import 'server-only'
import { prisma } from './db'
import {
  buildDeliveryTeaser,
  type DeliveryTeaser,
  type ShippingOffer,
} from './delivery-teaser'

/**
 * Livraison — accès base.
 *
 * Tarifs et délais viennent de `ShippingMethod`, jamais d'une constante dans un
 * gabarit : une promesse de livraison écrite en dur sur une fiche produit est
 * une promesse que personne ne peut tenir ni corriger.
 *
 * Quand aucune méthode n'est configurée, on renvoie une liste vide et
 * l'interface n'affiche rien — plutôt qu'un « expédié sous 24 h » inventé.
 *
 * Le calcul de l'accroche vit dans `delivery-teaser.ts`, qui est pur : le bloc
 * d'achat le rejoue côté client à chaque changement de conditionnement.
 */

export type { DeliveryTeaser, ShippingOffer }

const COUNTRY = 'FR'

/** Méthodes applicables à un pays, triées par position puis par prix. */
export async function getShippingOffers(country = COUNTRY): Promise<ShippingOffer[]> {
  try {
    const methods = await prisma.shippingMethod.findMany({
      where: { active: true, zone: { countries: { has: country } } },
      orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
    })

    return methods.map((method) => ({
      code: method.code,
      label: method.label,
      carrier: method.carrier,
      priceCents: method.priceCents,
      freeFromCents: method.freeFromCents,
      minDays: method.minDays,
      maxDays: method.maxDays,
    }))
  } catch (error) {
    console.error('[livraison] méthodes indisponibles', error)
    return []
  }
}

/** Accroche de livraison pour un sous-total donné. */
export async function getDeliveryTeaser(
  subtotalCents: number,
  country = COUNTRY,
): Promise<DeliveryTeaser | null> {
  return buildDeliveryTeaser(await getShippingOffers(country), subtotalCents)
}
