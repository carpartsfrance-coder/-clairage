import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { identity } from './identity'

/**
 * PDF d'une facture ou d'un avoir, avec les mentions obligatoires d'une
 * facture française : vendeur (dénomination, forme, capital, siège, SIRET,
 * RCS, n° de TVA), client, numéro et date, détail HT / TVA / TTC par taux.
 *
 * Les prix du catalogue sont TTC : le HT se déduit du taux de chaque ligne.
 * La livraison suit le taux normal (20 %), comme la loi le prévoit pour une
 * prestation accessoire à des biens à ce taux.
 */

export type LigneFacture = { designation: string; reference: string; quantite: number; ttcCents: number; tauxBp: number }

export type DonneesFacture = {
  type: 'INVOICE' | 'CREDIT_NOTE'
  numero: string
  date: Date
  reference: string
  factureLiee?: string | null
  client: { nom: string; adresse: string[]; email: string }
  lignes: LigneFacture[]
  livraisonCents: number
  remiseCents: number
  /** Avoir : montant remboursé TTC. */
  montantAvoirCents?: number
  paiement?: string | null
  test: boolean
}

const TAUX_LIVRAISON = 2000

/** Les polices standard du PDF ne connaissent que l'encodage WinAnsi. */
function texte(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .replace(/[‐-‒]/g, '-')
    .replace(/[^\x20-\x7E -ÿ€’‘“”–—•…œŒ]/g, '?')
}

function euros(cents: number): string {
  const s = (cents / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${s} €`
}

function ht(ttc: number, bp: number) {
  const tva = Math.round((ttc * bp) / (10000 + bp))
  return { ht: ttc - tva, tva }
}

export async function pdfFacture(d: DonneesFacture): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${d.type === 'INVOICE' ? 'Facture' : 'Avoir'} ${d.numero}`)
  doc.setAuthor(identity.legal.companyName ?? identity.name)
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const gras = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595.28, 841.89])
  const marge = 48
  const largeur = 595.28 - marge * 2
  let y = 841.89 - marge
  const gris = rgb(0.42, 0.44, 0.46)
  const noir = rgb(0.1, 0.1, 0.1)
  const rouge = rgb(0.88, 0.11, 0.11)

  const ecrire = (p: PDFPage, s: string, x: number, yy: number, taille = 9, police: PDFFont = normal, couleur = noir) =>
    p.drawText(texte(s), { x, y: yy, size: taille, font: police, color: couleur })
  const aDroite = (p: PDFPage, s: string, xDroit: number, yy: number, taille = 9, police: PDFFont = normal, couleur = noir) =>
    ecrire(p, s, xDroit - police.widthOfTextAtSize(texte(s), taille), yy, taille, police, couleur)

  // En-tête : vendeur à gauche, titre à droite.
  ecrire(page, identity.name, marge, y - 4, 20, gras, rouge)
  const legal = identity.legal
  const vendeur = [
    legal.companyName ?? '',
    legal.legalForm ? `${legal.legalForm}${legal.capital ? ` au capital de ${legal.capital}` : ''}` : '',
    legal.address ?? '',
    [legal.siret ? `SIRET ${legal.siret}` : '', legal.rcs ?? ''].filter(Boolean).join(' · '),
    legal.vatNumber ? `TVA intracommunautaire ${legal.vatNumber}` : '',
    identity.contact.email ?? '',
  ].filter(Boolean)
  vendeur.forEach((l, i) => ecrire(page, l, marge, y - 24 - i * 11, 8, normal, gris))

  const titre = d.type === 'INVOICE' ? 'FACTURE' : 'AVOIR'
  aDroite(page, titre, marge + largeur, y - 4, 18, gras)
  aDroite(page, `N° ${d.numero}`, marge + largeur, y - 22, 10, gras)
  aDroite(page, `Date : ${d.date.toLocaleDateString('fr-FR')}`, marge + largeur, y - 35, 9)
  aDroite(page, `Commande ${d.reference}`, marge + largeur, y - 47, 9)
  if (d.factureLiee) aDroite(page, `Facture d'origine ${d.factureLiee}`, marge + largeur, y - 59, 9)

  y -= 24 + vendeur.length * 11 + 22

  // Client.
  ecrire(page, d.type === 'INVOICE' ? 'Facturé à' : 'Avoir établi pour', marge, y, 8, gras, gris)
  y -= 13
  ;[d.client.nom, ...d.client.adresse, d.client.email].filter(Boolean).forEach((l) => {
    ecrire(page, l, marge, y, 9.5)
    y -= 12
  })
  y -= 14

  if (d.test) {
    ecrire(page, 'DOCUMENT DE TEST — paiement simulé, aucune valeur comptable', marge, y, 9, gras, rouge)
    y -= 18
  }

  // Tableau.
  const cols = { designation: marge, quantite: marge + 290, pu: marge + 345, tva: marge + 410, total: marge + largeur }
  const entete = () => {
    page.drawRectangle({ x: marge, y: y - 6, width: largeur, height: 20, color: rgb(0.95, 0.95, 0.95) })
    ecrire(page, 'Désignation', cols.designation + 6, y, 8, gras)
    aDroite(page, 'Qté', cols.quantite + 30, y, 8, gras)
    aDroite(page, 'PU HT', cols.pu + 50, y, 8, gras)
    aDroite(page, 'TVA', cols.tva + 35, y, 8, gras)
    aDroite(page, 'Total HT', cols.total - 6, y, 8, gras)
    y -= 22
  }
  entete()

  const parTaux = new Map<number, { ht: number; tva: number }>()
  const cumuler = (bp: number, montantHt: number, montantTva: number) => {
    const c = parTaux.get(bp) ?? { ht: 0, tva: 0 }
    c.ht += montantHt
    c.tva += montantTva
    parTaux.set(bp, c)
  }

  const ligne = (designation: string, reference: string, quantite: number, ttc: number, bp: number) => {
    if (y < marge + 140) {
      page = doc.addPage([595.28, 841.89])
      y = 841.89 - marge
      entete()
    }
    const { ht: montantHt, tva } = ht(ttc, bp)
    cumuler(bp, montantHt, tva)
    // Désignation sur deux lignes au plus.
    const mots = texte(designation).split(' ')
    const lignesTexte: string[] = ['']
    for (const mot of mots) {
      const essai = (lignesTexte[lignesTexte.length - 1] + ' ' + mot).trim()
      if (normal.widthOfTextAtSize(essai, 9) > 270 && lignesTexte.length < 2) lignesTexte.push(mot)
      else lignesTexte[lignesTexte.length - 1] = essai
    }
    lignesTexte.forEach((l, i) => ecrire(page, l, cols.designation + 6, y - i * 11, 9))
    if (reference) ecrire(page, reference, cols.designation + 6, y - lignesTexte.length * 11, 7, normal, gris)
    aDroite(page, String(quantite), cols.quantite + 30, y, 9)
    aDroite(page, euros(Math.round(montantHt / Math.max(1, quantite))), cols.pu + 50, y, 9)
    aDroite(page, `${(bp / 100).toLocaleString('fr-FR')} %`, cols.tva + 35, y, 9)
    aDroite(page, euros(montantHt), cols.total - 6, y, 9)
    y -= 14 + lignesTexte.length * 11 + (reference ? 2 : 0)
    page.drawLine({ start: { x: marge, y: y + 11 }, end: { x: marge + largeur, y: y + 11 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) })
  }

  if (d.type === 'INVOICE') {
    for (const l of d.lignes) ligne(l.designation, l.reference, l.quantite, l.ttcCents, l.tauxBp)
    if (d.livraisonCents > 0) ligne('Livraison', '', 1, d.livraisonCents, TAUX_LIVRAISON)
    if (d.remiseCents > 0) ligne('Remise', '', 1, -d.remiseCents, TAUX_LIVRAISON)
  } else {
    ligne(`Remboursement sur la commande ${d.reference}`, '', 1, d.montantAvoirCents ?? 0, TAUX_LIVRAISON)
  }

  // Totaux.
  y -= 8
  const totalHt = [...parTaux.values()].reduce((t, c) => t + c.ht, 0)
  const totalTva = [...parTaux.values()].reduce((t, c) => t + c.tva, 0)
  const xLib = marge + largeur - 200
  const total = (lib: string, val: string, police: PDFFont = normal, taille = 9.5) => {
    ecrire(page, lib, xLib, y, taille, police)
    aDroite(page, val, marge + largeur - 6, y, taille, police)
    y -= 15
  }
  total('Total HT', euros(totalHt))
  for (const [bp, c] of [...parTaux.entries()].sort((a, b) => a[0] - b[0])) {
    total(`TVA ${(bp / 100).toLocaleString('fr-FR')} % (sur ${euros(c.ht)})`, euros(c.tva))
  }
  page.drawLine({ start: { x: xLib, y: y + 9 }, end: { x: marge + largeur, y: y + 9 }, thickness: 0.6, color: noir })
  y -= 4
  total(d.type === 'INVOICE' ? 'Total TTC' : 'Total remboursé TTC', euros(totalHt + totalTva), gras, 11)

  y -= 16
  if (d.paiement) {
    ecrire(page, d.paiement, marge, y, 9)
    y -= 13
  }
  const pied = [
    d.type === 'INVOICE' ? 'Facture acquittée.' : "Avoir émis suite au remboursement, en déduction de la facture d'origine.",
    'Garantie légale de conformité de 2 ans (art. L217-3 et suivants du Code de la consommation) et garantie contre les vices cachés.',
  ]
  pied.forEach((l) => {
    ecrire(page, l, marge, y, 7.5, normal, gris)
    y -= 11
  })

  return doc.save()
}
