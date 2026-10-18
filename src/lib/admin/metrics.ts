import 'server-only'
import { prisma } from '../db'

/**
 * Indicateurs du tableau de bord.
 *
 * Chaque indicateur porte sa définition, et l'écran l'affiche. Ce n'est pas de
 * la pédagogie : « chiffre d'affaires » ne veut rien dire tant qu'on n'a pas dit
 * si c'est TTC ou HT, si le port est compté, si les remboursements sont
 * déduits et sur quelle date la période est calculée. Deux personnes qui lisent
 * le même nombre sans ces précisions en tirent deux conclusions différentes.
 *
 * Choix retenus, valables pour tout ce fichier :
 *   - Montants **TTC**, frais de port **inclus** — c'est ce que le client a payé.
 *   - Seules les commandes **payées** comptent ; les commandes en attente,
 *     échouées, expirées et annulées sont exclues.
 *   - La période porte sur **`placedAt`** (date de confirmation du paiement),
 *     pas sur la date de création : une commande créée le 31 et payée le 1er
 *     appartient au mois où l'argent est entré.
 *   - Les **remboursements sont déduits** du chiffre d'affaires, à leur date.
 *   - Les commandes réglées avec un **paiement en mode test ou simulé** sont
 *     exclues du chiffre d'affaires, et comptées à part. Les inclure
 *     reviendrait à présenter de l'argent qui n'a jamais été encaissé comme une
 *     recette — c'est précisément ce que `Payment.isTestMode` sert à éviter.
 */

export type Period = '7d' | '30d' | '90d' | '365d'

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
  '365d': '12 derniers mois',
}

export function periodStart(period: Period): Date {
  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[period]
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export type Metric = {
  key: string
  label: string
  /** Valeur en centimes pour un montant, nombre brut sinon. */
  value: number
  kind: 'money' | 'count'
  /** Phrase affichée sous l'indicateur. Obligatoire : voir l'en-tête. */
  definition: string
  /** Lien vers la liste correspondante, quand il y en a une. */
  href?: string
  /** Attire l'œil quand il y a quelque chose à faire. */
  tone?: 'neutral' | 'warn' | 'danger'
}

export type DashboardData = {
  period: Period
  periodFrom: Date
  revenue: Metric
  refunds: Metric
  averageBasket: Metric
  paidOrders: Metric
  toPrepare: Metric
  pendingPayments: Metric
  openTickets: Metric
  lowStock: Metric
  outOfStock: Metric
  /** Montant réglé en mode test. Affiché seulement s'il est non nul. */
  testRevenue: Metric
  /** Commandes payées non expédiées les plus anciennes d'abord. */
  oldestUnfulfilled: Array<{
    id: string
    reference: string
    placedAt: Date | null
    email: string
    totalCents: number
    ageDays: number
  }>
  lowStockVariants: Array<{
    id: string
    sku: string
    productName: string
    productSlug: string
    sellable: number
    threshold: number
  }>
}

const EMPTY_METRIC = (key: string, label: string, kind: Metric['kind'], definition: string): Metric => ({
  key,
  label,
  value: 0,
  kind,
  definition,
})

export async function getDashboard(period: Period = '30d'): Promise<DashboardData> {
  const from = periodStart(period)
  const label = PERIOD_LABELS[period].toLowerCase()

  const base: DashboardData = {
    period,
    periodFrom: from,
    revenue: EMPTY_METRIC(
      'revenue',
      "Chiffre d'affaires",
      'money',
      `Commandes payées sur les ${label}, TTC et port compris, remboursements déduits. Date retenue : confirmation du paiement.`,
    ),
    refunds: EMPTY_METRIC(
      'refunds',
      'Remboursements',
      'money',
      `Montants remboursés sur les ${label}, à la date du remboursement. Déjà déduits du chiffre d'affaires ci-contre.`,
    ),
    averageBasket: EMPTY_METRIC(
      'averageBasket',
      'Panier moyen',
      'money',
      `Chiffre d'affaires divisé par le nombre de commandes payées sur les ${label}. TTC, port compris.`,
    ),
    paidOrders: EMPTY_METRIC(
      'paidOrders',
      'Commandes payées',
      'count',
      `Nombre de commandes dont le paiement a été confirmé sur les ${label}.`,
    ),
    toPrepare: EMPTY_METRIC(
      'toPrepare',
      'À préparer',
      'count',
      'Commandes payées et non encore expédiées, toutes périodes confondues.',
    ),
    pendingPayments: EMPTY_METRIC(
      'pendingPayments',
      'Paiements en attente',
      'count',
      "Commandes créées dont le paiement n'est ni confirmé ni échoué. Leur stock est réservé jusqu'à expiration.",
    ),
    openTickets: EMPTY_METRIC(
      'openTickets',
      'Demandes SAV ouvertes',
      'count',
      'Demandes ni closes ni refusées, toutes périodes confondues.',
    ),
    lowStock: EMPTY_METRIC(
      'lowStock',
      'Stocks faibles',
      'count',
      "Références dont le stock vendable est au niveau du seuil d'alerte ou en dessous, sans être à zéro.",
    ),
    testRevenue: EMPTY_METRIC(
      'testRevenue',
      'Dont paiements de test',
      'money',
      `Commandes réglées avec une clé de test ou le paiement simulé, sur les ${label}. **Exclues** du chiffre d'affaires ci-dessus : aucun montant n'a été encaissé.`,
    ),
    outOfStock: EMPTY_METRIC(
      'outOfStock',
      'Ruptures',
      'count',
      'Références actives dont le stock vendable est nul et qui ne sont pas vendables à découvert.',
    ),
    oldestUnfulfilled: [],
    lowStockVariants: [],
  }

  try {
    const [paid, testPaid, refundAgg, toPrepare, pendingPayments, openTickets, unfulfilled, variants] =
      await Promise.all([
        prisma.order.aggregate({
          // `none` : aucune ligne de paiement encaissée en mode test. Un
          // paiement simulé porte lui aussi isTestMode, il est donc écarté.
          where: {
            paymentStatus: 'PAID',
            placedAt: { gte: from },
            payments: { none: { status: 'PAID', isTestMode: true } },
          },
          _sum: { totalCents: true },
          _count: true,
        }),
        prisma.order.aggregate({
          where: {
            paymentStatus: 'PAID',
            placedAt: { gte: from },
            payments: { some: { status: 'PAID', isTestMode: true } },
          },
          _sum: { totalCents: true },
        }),
        prisma.refund.aggregate({
          where: { createdAt: { gte: from } },
          _sum: { amountCents: true },
        }),
        // Mêmes critères que `listToPrepare` : le compteur et la file qu'il
        // ouvre doivent donner le même nombre, sinon on ne sait plus lequel
        // croire.
        prisma.order.count({
          where: {
            paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
            fulfillmentStatus: { in: ['UNFULFILLED', 'PARTIALLY_FULFILLED'] },
            status: { not: 'CANCELLED' },
          },
        }),
        prisma.order.count({ where: { paymentStatus: 'PENDING', status: 'PENDING' } }),
        prisma.supportTicket.count({ where: { status: { notIn: ['CLOSED', 'REJECTED'] } } }),
        prisma.order.findMany({
          where: {
            paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
            fulfillmentStatus: 'UNFULFILLED',
            status: { not: 'CANCELLED' },
          },
          orderBy: { placedAt: 'asc' },
          take: 8,
          select: { id: true, reference: true, placedAt: true, email: true, totalCents: true },
        }),
        // Les kits n'ont pas de stock propre : on ne regarde que les variantes
        // qui en portent un, c'est-à-dire celles qui ne sont pas des kits.
        prisma.productVariant.findMany({
          where: { active: true, components: { none: {} }, product: { status: 'PUBLISHED' } },
          select: {
            id: true,
            sku: true,
            stockOnHand: true,
            stockReserved: true,
            lowStockThreshold: true,
            backorder: true,
            product: { select: { name: true, slug: true } },
          },
        }),
      ])

    const grossRevenue = paid._sum.totalCents ?? 0
    const refunded = refundAgg._sum.amountCents ?? 0
    const netRevenue = grossRevenue - refunded

    base.testRevenue.value = testPaid._sum.totalCents ?? 0
    base.testRevenue.tone = base.testRevenue.value > 0 ? 'warn' : 'neutral'
    base.revenue.value = netRevenue
    base.refunds.value = refunded
    base.refunds.tone = refunded > 0 ? 'warn' : 'neutral'
    base.paidOrders.value = paid._count
    base.averageBasket.value = paid._count > 0 ? Math.round(netRevenue / paid._count) : 0

    base.toPrepare.value = toPrepare
    base.toPrepare.href = '/admin/preparation'
    base.toPrepare.tone = toPrepare > 0 ? 'warn' : 'neutral'

    base.pendingPayments.value = pendingPayments
    base.pendingPayments.href = '/admin/commandes?payment=PENDING'

    base.openTickets.value = openTickets
    base.openTickets.href = '/admin/sav'
    base.openTickets.tone = openTickets > 0 ? 'warn' : 'neutral'

    const now = Date.now()
    base.oldestUnfulfilled = unfulfilled.map((order) => ({
      ...order,
      ageDays: order.placedAt
        ? Math.floor((now - order.placedAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0,
    }))

    const lowStock: DashboardData['lowStockVariants'] = []
    let outOfStock = 0

    for (const variant of variants) {
      const sellable = Math.max(0, variant.stockOnHand - variant.stockReserved)
      if (sellable === 0) {
        if (!variant.backorder) outOfStock += 1
        continue
      }
      if (sellable <= variant.lowStockThreshold) {
        lowStock.push({
          id: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          productSlug: variant.product.slug,
          sellable,
          threshold: variant.lowStockThreshold,
        })
      }
    }

    lowStock.sort((a, b) => a.sellable - b.sellable)
    base.lowStockVariants = lowStock.slice(0, 10)
    base.lowStock.value = lowStock.length
    base.lowStock.tone = lowStock.length > 0 ? 'warn' : 'neutral'
    base.outOfStock.value = outOfStock
    base.outOfStock.tone = outOfStock > 0 ? 'danger' : 'neutral'
    base.lowStock.href = '/admin/catalogue?stock=faible'
    base.outOfStock.href = '/admin/catalogue?stock=rupture'
  } catch (error) {
    console.error('[admin] tableau de bord indisponible', error)
  }

  return base
}
