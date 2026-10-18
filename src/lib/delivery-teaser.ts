import { formatPrice } from './identity'

/**
 * Construction de l'accroche de livraison.
 *
 * Volontairement pure et sans 'server-only' : le bloc d'achat doit la
 * recalculer quand le client change de conditionnement. Sinon la fiche
 * annoncerait « livraison offerte » pour un kit à 99,90 € alors que le client
 * vient de basculer sur les ampoules seules à 69,90 €, sous le seuil de
 * franchise — une promesse fausse, et la pire sorte : celle qu'on découvre au
 * paiement.
 */

export type ShippingOffer = {
  code: string
  label: string
  carrier: string | null
  priceCents: number
  freeFromCents: number | null
  minDays: number | null
  maxDays: number | null
}

export type DeliveryTeaser = {
  /** « Livraison offerte » ou « Livraison à partir de 3,90 € ». */
  priceLabel: string
  /** « estimation 2 à 3 jours ouvrés », ou null si les délais ne sont pas saisis. */
  delayLabel: string | null
  /** Ce qu'il manque pour atteindre la franchise, le cas échéant. */
  missingForFreeCents: number | null
  /**
   * Prix retenu pour l'accroche, en centimes. Zéro quand la franchise de port
   * est atteinte.
   *
   * Il est exposé parce que l'affichage d'un panier en dépend : quand la
   * livraison est offerte, le total est complet et le dire « hors frais de
   * port » est faux ; quand elle a un prix, ce prix n'est qu'un minimum, et le
   * total affiché ne couvre que les articles. Sans cette valeur, le panier
   * annonçait « Livraison offerte » ET « frais non compris dans ce total ».
   */
  priceCents: number
  /** Vrai quand le montant est définitif pour la zone configurée. */
  isSettled: boolean
}

/** Prix réellement appliqué à une méthode pour un sous-total donné. */
export function effectivePrice(offer: ShippingOffer, subtotalCents: number): number {
  return offer.freeFromCents !== null && subtotalCents >= offer.freeFromCents
    ? 0
    : offer.priceCents
}

export function buildDeliveryTeaser(
  offers: ShippingOffer[],
  subtotalCents: number,
): DeliveryTeaser | null {
  if (offers.length === 0) return null

  // On raisonne sur la méthode la moins chère applicable : c'est le minimum que
  // le client paiera, et la seule promesse tenable avant de connaître son adresse.
  const cheapest = offers.reduce((best, offer) =>
    effectivePrice(offer, subtotalCents) < effectivePrice(best, subtotalCents) ? offer : best,
  )
  const price = effectivePrice(cheapest, subtotalCents)

  // Les deux bornes doivent être saisies : une seule ne dit rien d'utile.
  const delayLabel =
    cheapest.minDays !== null && cheapest.maxDays !== null
      ? cheapest.minDays === cheapest.maxDays
        ? `estimation ${cheapest.minDays} jours ouvrés`
        : `estimation ${cheapest.minDays} à ${cheapest.maxDays} jours ouvrés`
      : null

  const franchises = offers
    .filter((offer) => offer.freeFromCents !== null)
    .map((offer) => offer.freeFromCents! - subtotalCents)
    .filter((missing) => missing > 0)

  return {
    priceLabel: price === 0 ? 'Livraison offerte' : `Livraison à partir de ${formatPrice(price)}`,
    delayLabel,
    missingForFreeCents: price > 0 && franchises.length > 0 ? Math.min(...franchises) : null,
    priceCents: price,
    /*
      « Réglé » veut dire : ce montant ne bougera plus pour la zone configurée.
      C'est le cas quand la franchise de port est atteinte — la livraison est
      offerte quelle que soit la méthode retenue ensuite. Sinon, `price` n'est
      que le tarif de la méthode la moins chère : le client peut en choisir une
      autre, et l'adresse reste à saisir.
    */
    isSettled: price === 0,
  }
}
