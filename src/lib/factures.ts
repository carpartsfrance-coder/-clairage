import 'server-only'
import { prisma } from './db'

/**
 * Factures et avoirs.
 *
 * Une facture est émise pour chaque commande payée, une seule fois, avec un
 * numéro pris dans une suite continue (`facture_numero_seq`) : F2026-000001,
 * F2026-000002… Un avoir est émis pour chaque remboursement (A2026-000001…).
 * Le numéro, la date et le montant sont figés dans `Document` ; le PDF est
 * recalculé à la demande depuis la commande, qui ne change plus une fois payée.
 *
 * Les paiements de test reçoivent une facture marquée « TEST » hors suite
 * légale (TEST-<référence>), pour ne pas consommer de numéros.
 */

async function estDeTest(orderId: string): Promise<boolean> {
  const paiement = await prisma.payment.findFirst({
    where: { orderId, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    select: { isTestMode: true },
  })
  return paiement?.isTestMode ?? true
}

async function prochainNumero(sequence: 'facture_numero_seq' | 'avoir_numero_seq', prefixe: string, annee: number) {
  const [{ n }] =
    sequence === 'facture_numero_seq'
      ? await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('facture_numero_seq') AS n`
      : await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('avoir_numero_seq') AS n`
  return `${prefixe}${annee}-${String(n).padStart(6, '0')}`
}

/** Émet la facture d'une commande payée, ou renvoie celle déjà émise. */
export async function emettreFacture(orderId: string) {
  const existante = await prisma.document.findFirst({ where: { orderId, type: 'INVOICE' } })
  if (existante) return existante

  const commande = await prisma.order.findUnique({
    where: { id: orderId },
    select: { reference: true, paymentStatus: true, totalCents: true, placedAt: true, createdAt: true },
  })
  if (!commande || !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(commande.paymentStatus)) return null

  const date = commande.placedAt ?? commande.createdAt
  const numero = (await estDeTest(orderId))
    ? `TEST-${commande.reference}`
    : await prochainNumero('facture_numero_seq', 'F', date.getFullYear())

  try {
    return await prisma.document.create({
      data: { orderId, type: 'INVOICE', number: numero, totalCents: commande.totalCents, issuedAt: date },
    })
  } catch {
    // Deux demandes en même temps : l'autre a gagné, on renvoie la sienne.
    return prisma.document.findFirst({ where: { orderId, type: 'INVOICE' } })
  }
}

/** Émet l'avoir d'un remboursement. */
export async function emettreAvoir(orderId: string, montantCents: number) {
  const commande = await prisma.order.findUnique({ where: { id: orderId }, select: { reference: true } })
  if (!commande) return null
  await emettreFacture(orderId)
  const maintenant = new Date()
  const test = await estDeTest(orderId)
  const numero = test
    ? `TEST-AVOIR-${commande.reference}-${Date.now().toString(36)}`
    : await prochainNumero('avoir_numero_seq', 'A', maintenant.getFullYear())
  return prisma.document.create({
    data: { orderId, type: 'CREDIT_NOTE', number: numero, totalCents: montantCents, issuedAt: maintenant },
  })
}

/** Tout ce qu'il faut pour dessiner le PDF d'un document. */
export async function donneesDuDocument(documentId: string) {
  const { pdfFacture } = await import('./facture-pdf')
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      order: {
        include: {
          lines: { where: { parentLineId: null }, orderBy: { id: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
          documents: { where: { type: 'INVOICE' }, take: 1 },
        },
      },
    },
  })
  if (!document) return null
  const o = document.order
  type Adresse = { firstName?: string; lastName?: string; company?: string | null; line1?: string; line2?: string | null; postalCode?: string; city?: string; country?: string }
  const a = (o.billingAddress ?? o.shippingAddress) as Adresse
  const paiement = o.payments[0]
  const pdf = await pdfFacture({
    type: document.type === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE',
    numero: document.number,
    date: document.issuedAt,
    reference: o.reference,
    factureLiee: document.type === 'CREDIT_NOTE' ? (o.documents[0]?.number ?? null) : null,
    client: {
      nom: [a.firstName, a.lastName].filter(Boolean).join(' ') + (a.company ? ` — ${a.company}` : ''),
      adresse: [a.line1 ?? '', a.line2 ?? '', `${a.postalCode ?? ''} ${a.city ?? ''}`.trim(), a.country === 'FR' || !a.country ? 'France' : a.country].filter(Boolean),
      email: o.email,
    },
    lignes: o.lines.map((l) => ({
      designation: l.productName,
      reference: l.sku,
      quantite: l.quantity,
      ttcCents: l.lineTotalCents,
      tauxBp: l.vatRateBp,
    })),
    livraisonCents: o.shippingCents,
    remiseCents: o.discountCents,
    montantAvoirCents: document.totalCents ?? 0,
    paiement:
      document.type === 'INVOICE' && paiement
        ? `Payée le ${(o.placedAt ?? paiement.createdAt).toLocaleDateString('fr-FR')} par carte bancaire (${paiement.provider === 'mollie' ? 'Mollie' : paiement.provider}, réf. ${paiement.providerRef}).`
        : null,
    test: document.number.startsWith('TEST'),
  })
  return { pdf, nom: `${document.type === 'CREDIT_NOTE' ? 'avoir' : 'facture'}-${document.number}.pdf`, order: o }
}

/** HT / TVA / TTC d'une commande, ligne par ligne (prix TTC, livraison à 20 %). */
export function ventilation(o: {
  lines: Array<{ lineTotalCents: number; vatRateBp: number; parentLineId: string | null }>
  shippingCents: number
  discountCents: number
}) {
  let ht = 0
  let tva = 0
  const ajouter = (ttc: number, bp: number) => {
    const t = Math.round((ttc * bp) / (10000 + bp))
    tva += t
    ht += ttc - t
  }
  for (const l of o.lines) if (!l.parentLineId) ajouter(l.lineTotalCents, l.vatRateBp)
  if (o.shippingCents) ajouter(o.shippingCents, 2000)
  if (o.discountCents) ajouter(-o.discountCents, 2000)
  return { ht, tva, ttc: ht + tva }
}

/**
 * Export comptable : une ligne par facture et par avoir émis sur la période,
 * au format CSV (séparateur « ; », virgule décimale) que lisent Excel et les
 * logiciels des cabinets comptables.
 */
export async function exportComptable(du: Date, au: Date): Promise<string> {
  const documents = await prisma.document.findMany({
    where: { issuedAt: { gte: du, lt: au }, type: { in: ['INVOICE', 'CREDIT_NOTE'] }, NOT: { number: { startsWith: 'TEST' } } },
    orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    include: {
      order: {
        include: {
          lines: { select: { lineTotalCents: true, vatRateBp: true, parentLineId: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { provider: true, providerRef: true } },
        },
      },
    },
  })
  const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',')
  const champ = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lignes = [
    ['Date', 'Type', 'Numéro', 'Commande', 'Client', 'E-mail', 'Total HT', 'TVA', 'Total TTC', 'Paiement', 'Référence paiement'].join(';'),
  ]
  for (const d of documents) {
    const o = d.order
    const a = (o.billingAddress ?? o.shippingAddress) as { firstName?: string; lastName?: string; company?: string | null }
    const nom = [a.firstName, a.lastName].filter(Boolean).join(' ') + (a.company ? ` (${a.company})` : '')
    let montants: { ht: number; tva: number; ttc: number }
    if (d.type === 'INVOICE') {
      montants = ventilation(o)
    } else {
      const ttc = d.totalCents ?? 0
      const t = Math.round((ttc * 2000) / 12000)
      montants = { ht: -(ttc - t), tva: -t, ttc: -ttc }
    }
    const p = o.payments[0]
    lignes.push(
      [
        d.issuedAt.toLocaleDateString('fr-FR'),
        d.type === 'INVOICE' ? 'Facture' : 'Avoir',
        d.number,
        o.reference,
        champ(nom),
        champ(o.email),
        euros(montants.ht),
        euros(montants.tva),
        euros(montants.ttc),
        p?.provider === 'mollie' ? 'Mollie (carte)' : (p?.provider ?? ''),
        p?.providerRef ?? '',
      ].join(';'),
    )
  }
  // BOM : Excel lit alors les accents correctement.
  return '﻿' + lignes.join('\r\n') + '\r\n'
}
