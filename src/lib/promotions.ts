import 'server-only'
import { prisma } from './db'

/**
 * Codes promo.
 *
 * Un code est relu et recalculé à chaque étape (panier, commande, paiement) :
 * la remise n'est jamais crue sur parole depuis le navigateur. Trois types :
 * pourcentage, montant fixe, livraison offerte (cumulable avec les deux
 * autres par la case « offre aussi la livraison »).
 *
 * Si des produits ou des rubriques sont ciblés, la remise ne porte que sur
 * ces lignes ; sinon sur tout le panier.
 */

export type LignePromo = { productId: string; totalCents: number }

export type ResultatPromo =
  | {
      ok: true
      promotionId: string
      code: string
      label: string
      remiseCents: number
      livraisonOfferte: boolean
    }
  | { ok: false; erreur: string }

export function normaliserCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export async function evaluerPromotion(
  saisie: string | null | undefined,
  { lignes, email = null }: { lignes: LignePromo[]; email?: string | null },
): Promise<ResultatPromo | null> {
  if (!saisie) return null
  const code = normaliserCode(saisie)
  if (!code) return null

  const promo = await prisma.promotion.findUnique({ where: { code } })
  const maintenant = new Date()
  if (!promo || !promo.active) return { ok: false, erreur: 'Ce code promo n’existe pas ou n’est plus actif.' }
  if (promo.startsAt && promo.startsAt > maintenant) return { ok: false, erreur: 'Ce code promo n’est pas encore valable.' }
  if (promo.endsAt && promo.endsAt < maintenant) return { ok: false, erreur: 'Ce code promo a expiré.' }
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {
    return { ok: false, erreur: 'Ce code promo a atteint son nombre maximal d’utilisations.' }
  }

  const sousTotal = lignes.reduce((t, l) => t + l.totalCents, 0)
  if (promo.minOrderCents !== null && sousTotal < promo.minOrderCents) {
    return {
      ok: false,
      erreur: `Ce code promo s’applique dès ${(promo.minOrderCents / 100).toFixed(2).replace('.', ',')} € d’achat.`,
    }
  }

  if (email && promo.maxPerCustomer !== null) {
    const deja = await prisma.order.count({
      where: {
        promotionId: promo.id,
        email: { equals: email, mode: 'insensitive' },
        paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
    })
    if (deja >= promo.maxPerCustomer) return { ok: false, erreur: 'Vous avez déjà utilisé ce code promo.' }
  }

  // Base de la remise : les lignes ciblées, ou tout le panier.
  let base = sousTotal
  const cible = promo.eligibleProductIds.length > 0 || promo.eligibleCategoryIds.length > 0
  if (cible) {
    const ids = [...new Set(lignes.map((l) => l.productId))]
    const dansRubrique = promo.eligibleCategoryIds.length
      ? new Set(
          (
            await prisma.productCategory.findMany({
              where: { productId: { in: ids }, categoryId: { in: promo.eligibleCategoryIds } },
              select: { productId: true },
            })
          ).map((r) => r.productId),
        )
      : new Set<string>()
    base = lignes
      .filter((l) => promo.eligibleProductIds.includes(l.productId) || dansRubrique.has(l.productId))
      .reduce((t, l) => t + l.totalCents, 0)
    if (base === 0) return { ok: false, erreur: 'Ce code promo ne s’applique à aucun article de votre panier.' }
  }

  const remiseCents =
    promo.type === 'PERCENT'
      ? Math.round((base * promo.value) / 10000)
      : promo.type === 'FIXED'
        ? Math.min(promo.value, base)
        : 0

  return {
    ok: true,
    promotionId: promo.id,
    code: promo.code,
    label: promo.label,
    remiseCents,
    livraisonOfferte: promo.type === 'FREE_SHIPPING' || promo.freeShipping,
  }
}
