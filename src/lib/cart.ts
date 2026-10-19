import 'server-only'
import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { prisma } from './db'
import { CART_COOKIE } from './session'
import {
  availabilityForKit,
  availabilityForVariant,
  type Availability,
} from './stock'
import {
  findCartConflicts,
  findMissingCartAccessories,
  type CartConflict,
  type MissingCartAccessory,
} from './fitment'

/**
 * Lecture du panier.
 *
 * Un kit occupe **une seule ligne**, celle de sa variante kit : c'est ce que le
 * client a choisi et c'est le prix qu'il a vu. Sa composition est affichée sous
 * la ligne, et c'est au moment de la commande que les composants donnent lieu
 * à des mouvements de stock. Éclater le kit en lignes dès le panier ferait
 * disparaître la remise du pack et rendrait le retrait incompréhensible.
 *
 * Les totaux sont calculés ici, côté serveur, à partir des prix en base. Rien
 * de ce que le navigateur envoie n'entre dans un total.
 */

export type CartComponent = {
  sku: string
  productName: string
  variantName: string
  quantity: number
  required: boolean
}

export type CartLineView = {
  id: string
  variantId: string
  sku: string
  productSlug: string
  productName: string
  variantName: string
  packaging: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  vatRateBp: number
  image: { url: string; alt: string } | null
  /** Composition, pour un kit. Vide pour une variante simple. */
  components: CartComponent[]
  availability: Availability
  /** Renseigné quand la ligne a été ajoutée parce qu'un montage l'exige. */
  requiredBy: string | null
}

export type CartView = {
  id: string | null
  token: string | null
  lines: CartLineView[]
  itemCount: number
  subtotalCents: number
  /** TVA contenue dans le sous-total (les prix sont TTC). */
  vatCents: number
  /** Articles dont la disponibilité ne couvre plus la quantité demandée. */
  stockIssues: Array<{ lineId: string; productName: string; sellable: number }>
  /** Conflits avec le véhicule sélectionné. On signale, on ne retire rien. */
  conflicts: CartConflict[]
  /**
   * Accessoires indispensables au montage qu'aucune ligne n'apporte.
   *
   * On signale, on n'ajoute rien : c'est au client de dire s'il les possède
   * déjà. Vide tant qu'aucun véhicule n'est sélectionné — sans montage connu,
   * rien ne peut être déclaré nécessaire.
   */
  missingAccessories: MissingCartAccessory[]
}

export const EMPTY_CART: CartView = {
  id: null,
  token: null,
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  vatCents: 0,
  stockIssues: [],
  conflicts: [],
  missingAccessories: [],
}

export function newCartToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Lit le panier de la session. Ne crée rien : la lecture doit rester neutre. */
export async function getCart(configurationId: string | null = null): Promise<CartView> {
  const store = await cookies()
  const token = store.get(CART_COOKIE)?.value
  if (!token) return EMPTY_CART

  try {
    const cart = await prisma.cart.findUnique({
      where: { token },
      include: {
        lines: {
          orderBy: { createdAt: 'asc' },
          include: {
            variant: {
              include: {
                vatRate: true,
                product: {
                  include: {
                    media: {
                      where: { role: 'PRODUCT' },
                      orderBy: { position: 'asc' },
                      take: 1,
                      include: { media: true },
                    },
                  },
                },
                components: {
                  orderBy: { position: 'asc' },
                  include: {
                    component: { include: { product: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!cart) return EMPTY_CART

    const lines: CartLineView[] = cart.lines.map((line) => {
      const { variant } = line
      const isKit = variant.components.length > 0

      const availability = isKit
        ? availabilityForKit(
            variant.components.map((entry) => ({
              quantity: entry.quantity,
              required: entry.required,
              component: entry.component,
            })),
          )
        : availabilityForVariant(variant)

      const cover = variant.product.media[0]?.media

      return {
        id: line.id,
        variantId: variant.id,
        sku: variant.sku,
        productSlug: variant.product.slug,
        productName: variant.product.name,
        variantName: variant.name,
        packaging: variant.packaging,
        quantity: line.quantity,
        unitPriceCents: variant.priceCents,
        lineTotalCents: variant.priceCents * line.quantity,
        vatRateBp: variant.vatRate?.rateBp ?? 0,
        image: cover ? { url: cover.url, alt: cover.alt ?? variant.product.name } : null,
        components: variant.components.map((entry) => ({
          sku: entry.component.sku,
          productName: entry.component.product.name,
          variantName: entry.component.name,
          quantity: entry.quantity,
          required: entry.required,
        })),
        availability,
        requiredBy: line.requiredBy,
      }
    })

    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0)
    // Prix TTC : la TVA contenue vaut total × taux / (10000 + taux).
    const vatCents = lines.reduce(
      (sum, line) =>
        sum + Math.round((line.lineTotalCents * line.vatRateBp) / (10000 + line.vatRateBp)),
      0,
    )

    const stockIssues = lines
      .filter((line) => line.availability.sellable !== null && line.availability.sellable < line.quantity)
      .map((line) => ({
        lineId: line.id,
        productName: line.productName,
        sellable: line.availability.sellable ?? 0,
      }))

    const [conflicts, missingAccessories] = await Promise.all([
      findCartConflicts(
        configurationId,
        lines.map((line) => ({
          variantId: line.variantId,
          productName: line.productName,
          variantName: line.variantName,
        })),
      ),
      findMissingCartAccessories(
        configurationId,
        lines.map((line) => ({
          variantId: line.variantId,
          productName: line.productName,
          variantName: line.variantName,
          quantity: line.quantity,
          componentSkus: line.components.map((component) => ({
            sku: component.sku,
            quantity: component.quantity,
          })),
        })),
      ),
    ])

    return {
      id: cart.id,
      token: cart.token,
      lines,
      itemCount: lines.reduce((n, line) => n + line.quantity, 0),
      subtotalCents,
      vatCents,
      stockIssues,
      conflicts,
      missingAccessories,
    }
  } catch (error) {
    console.error('[panier] lecture impossible', error)
    return EMPTY_CART
  }
}

/**
 * Quantité réellement vendable d'une variante, kit compris.
 * Sert aux contrôles d'ajout et de mise à jour.
 */
export async function sellableQuantity(variantId: string): Promise<number | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      components: { include: { component: true } },
    },
  })
  if (!variant || !variant.active) return 0

  const availability =
    variant.components.length > 0
      ? availabilityForKit(
          variant.components.map((entry) => ({
            quantity: entry.quantity,
            required: entry.required,
            component: entry.component,
          })),
        )
      : availabilityForVariant(variant)

  return availability.sellable
}
