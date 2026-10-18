import { cookies } from 'next/headers'
import 'server-only'

/**
 * État de session côté serveur : véhicule sélectionné et panier.
 *
 * Le header affiche ces deux informations ; elles doivent donc refléter la
 * session réelle, pas un compteur décoratif. Tant que la base n'est pas
 * joignable (premier démarrage, migration non appliquée), les accesseurs
 * renvoient un état vide plutôt que de faire échouer le rendu — mais ils ne
 * fabriquent jamais de contenu.
 */

export const CART_COOKIE = 'lumera_cart'
export const VEHICLE_COOKIE = 'lumera_vehicle'

export type SelectedVehicle = {
  configurationId: string
  /** Libellé compact affiché dans le header : « Volkswagen Golf VII · 2015 ». */
  label: string
  /** Équipement d'origine, affiché en fiche produit. */
  equipmentLabel: string | null
  type: 'CAR' | 'MOTORCYCLE'
}

export type CartSummary = {
  id: string | null
  itemCount: number
  totalCents: number
}

const EMPTY_CART: CartSummary = { id: null, itemCount: 0, totalCents: 0 }

/**
 * Véhicule retenu pour la navigation. Il est stocké en cookie pour survivre à
 * la navigation anonyme, et re-résolu depuis la base pour que le libellé reste
 * juste si la configuration est renommée côté admin.
 */
export async function getSelectedVehicle(): Promise<SelectedVehicle | null> {
  const store = await cookies()
  const raw = store.get(VEHICLE_COOKIE)?.value
  if (!raw) return null

  try {
    const { prisma } = await import('./db')
    const config = await prisma.vehicleConfiguration.findUnique({
      where: { id: raw },
      include: {
        equipment: true,
        generation: { include: { model: { include: { make: true } } } },
        trim: true,
      },
    })
    if (!config || !config.active) return null

    const { generation } = config
    const years = generation.yearTo
      ? `${generation.yearFrom}–${generation.yearTo}`
      : `depuis ${generation.yearFrom}`

    return {
      configurationId: config.id,
      label: `${generation.model.make.name} ${generation.name} · ${years}`,
      equipmentLabel: config.equipment.label,
      type: generation.model.make.type === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR',
    }
  } catch {
    // Base indisponible : on n'affiche pas de véhicule plutôt qu'un faux.
    return null
  }
}

/** Compteur du panier affiché dans le header. */
export async function getCartSummary(): Promise<CartSummary> {
  const store = await cookies()
  const token = store.get(CART_COOKIE)?.value
  if (!token) return EMPTY_CART

  try {
    const { prisma } = await import('./db')
    const cart = await prisma.cart.findUnique({
      where: { token },
      include: { lines: { include: { variant: true } } },
    })
    if (!cart) return EMPTY_CART

    return {
      id: cart.id,
      itemCount: cart.lines.reduce((n, line) => n + line.quantity, 0),
      totalCents: cart.lines.reduce(
        (sum, line) => sum + line.quantity * line.variant.priceCents,
        0,
      ),
    }
  } catch {
    return EMPTY_CART
  }
}
