/**
 * Disponibilité.
 *
 * Ce module est volontairement SANS 'server-only' : ce sont des fonctions
 * pures, sans accès à la base, et le bloc d'achat en a besoin côté client pour
 * réagir au changement de conditionnement sans aller-retour serveur.
 *
 * Règle centrale : un kit n'a pas de stock propre. Sa disponibilité se déduit
 * de ses composants, et c'est le composant le plus contraint qui décide.
 * Saisir un stock sur un kit créerait deux vérités concurrentes — c'est
 * exactement comme ça qu'on vend une pièce qu'on n'a pas.
 *
 * Le stock réellement vendable d'une variante est `stockOnHand - stockReserved`.
 * `stockReserved` couvre les lignes déjà engagées (commande payée non expédiée) :
 * sans lui, deux clients peuvent acheter la même dernière pièce.
 */

export type AvailabilityState =
  | 'IN_STOCK'
  | 'LOW_STOCK'
  /** Vendable, mais pas détenu : commande fournisseur. */
  | 'BACKORDER'
  | 'OUT_OF_STOCK'

export type Availability = {
  state: AvailabilityState
  /** Quantité vendable aujourd'hui. `null` quand la vente à découvert est ouverte. */
  sellable: number | null
  /** Pour un kit : le composant qui limite, quand il y en a un. */
  limitingComponent?: { sku: string; name: string; sellable: number }
}

type VariantStock = {
  sku: string
  name: string
  stockOnHand: number
  stockReserved: number
  lowStockThreshold: number
  backorder: boolean
}

type KitComponentStock = {
  quantity: number
  /** Un composant facultatif ne bloque pas la vente du kit. */
  required: boolean
  component: VariantStock
}

function sellableOf(variant: VariantStock): number {
  return Math.max(0, variant.stockOnHand - variant.stockReserved)
}

function stateFor(sellable: number, variant: VariantStock): AvailabilityState {
  if (sellable > 0) {
    return sellable <= variant.lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK'
  }
  return variant.backorder ? 'BACKORDER' : 'OUT_OF_STOCK'
}

/** Disponibilité d'une variante simple. */
export function availabilityForVariant(variant: VariantStock): Availability {
  const sellable = sellableOf(variant)
  return {
    state: stateFor(sellable, variant),
    sellable: variant.backorder && sellable === 0 ? null : sellable,
  }
}

/**
 * Disponibilité d'un kit, calculée depuis ses composants obligatoires.
 *
 * Un composant à 10 exemplaires requis par 2 dans le kit ne permet que 5 kits :
 * d'où la division entière par la quantité du composant dans le kit.
 */
export function availabilityForKit(components: KitComponentStock[]): Availability {
  const required = components.filter((entry) => entry.required && entry.quantity > 0)

  // Un « kit » sans composant obligatoire n'est pas un kit : on refuse de le
  // déclarer disponible plutôt que de renvoyer l'infini.
  if (required.length === 0) {
    return { state: 'OUT_OF_STOCK', sellable: 0 }
  }

  let buildable = Number.POSITIVE_INFINITY
  let limiting: Availability['limitingComponent']
  let anyBackorder = false

  for (const entry of required) {
    const sellable = sellableOf(entry.component)
    const possible = Math.floor(sellable / entry.quantity)
    if (entry.component.backorder) anyBackorder = true
    if (possible < buildable) {
      buildable = possible
      limiting = { sku: entry.component.sku, name: entry.component.name, sellable }
    }
  }

  if (buildable > 0) {
    // Le seuil d'alerte du kit est celui du composant limitant : c'est lui qui
    // partira en rupture le premier.
    const threshold = Math.max(
      ...required.map((entry) => Math.floor(entry.component.lowStockThreshold / entry.quantity)),
    )
    return {
      state: buildable <= threshold ? 'LOW_STOCK' : 'IN_STOCK',
      sellable: buildable,
      limitingComponent: limiting,
    }
  }

  return {
    // Un kit n'est en commande fournisseur que si TOUS ses composants manquants
    // le sont : un seul composant définitivement indisponible suffit à bloquer.
    state: anyBackorder && required.every((entry) => entry.component.backorder || sellableOf(entry.component) > 0)
      ? 'BACKORDER'
      : 'OUT_OF_STOCK',
    sellable: 0,
    limitingComponent: limiting,
  }
}

/** Libellé affiché au client. Volontairement sans chiffre tant qu'il y a du stock. */
export function availabilityLabel(availability: Availability): string {
  switch (availability.state) {
    case 'IN_STOCK':
      return 'En stock'
    case 'LOW_STOCK':
      // On annonce le nombre seulement quand il est réellement bas : c'est une
      // information, pas un argument de vente.
      return availability.sellable && availability.sellable > 0
        ? `Plus que ${availability.sellable} en stock`
        : 'Stock limité'
    case 'BACKORDER':
      return 'Sur commande'
    case 'OUT_OF_STOCK':
      return 'Indisponible'
  }
}

export function isPurchasable(availability: Availability): boolean {
  return availability.state !== 'OUT_OF_STOCK'
}
