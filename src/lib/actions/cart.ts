'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { CART_COOKIE, VEHICLE_COOKIE } from '../session'
import { newCartToken, sellableQuantity } from '../cart'

/**
 * Actions du panier.
 *
 * Tout se décide ici, côté serveur : la quantité possible, le prix, la
 * composition d'un kit. Le navigateur n'envoie qu'un identifiant de variante et
 * une quantité ; il ne peut rien imposer d'autre.
 *
 * Les accessoires rendus nécessaires par un montage ne sont JAMAIS ajoutés
 * d'office : ils arrivent dans `extraVariantIds`, c'est-à-dire seulement si le
 * client les a cochés.
 */

export type CartActionResult =
  | { ok: true; itemCount: number; message?: string }
  | { ok: false; error: string }

const addSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
  /** Accessoires explicitement acceptés par le client. */
  extraVariantIds: z.array(z.string().min(1)).max(10).default([]),
})

async function getOrCreateCart() {
  const store = await cookies()
  const existing = store.get(CART_COOKIE)?.value

  if (existing) {
    const cart = await prisma.cart.findUnique({ where: { token: existing } })
    if (cart) return cart
  }

  const token = newCartToken()
  const configurationId = store.get(VEHICLE_COOKIE)?.value ?? null
  const cart = await prisma.cart.create({
    data: {
      token,
      // Le véhicule est mémorisé sur le panier : il sert à signaler les
      // conflits si le client en change ensuite.
      configurationId: configurationId || null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  })

  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return cart
}

export async function addToCart(input: unknown): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Demande invalide.' }
  const { variantId, quantity, extraVariantIds } = parsed.data

  try {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { status: true, name: true } } },
    })
    if (!variant || !variant.active || variant.product.status !== 'PUBLISHED') {
      return { ok: false, error: "Cet article n'est plus disponible." }
    }

    const store = await cookies()
    const configurationId = store.get(VEHICLE_COOKIE)?.value ?? null
    const cart = await getOrCreateCart()

    const notes: string[] = []
    // La variante principale, puis les accessoires acceptés. Chacun est
    // contrôlé séparément : un accessoire en rupture ne doit pas faire échouer
    // l'ajout du produit principal.
    const targets: Array<{ id: string; quantity: number; requiredBy: string | null }> = [
      { id: variantId, quantity, requiredBy: null },
      ...extraVariantIds.map((id) => ({ id, quantity: 1, requiredBy: variantId })),
    ]

    for (const target of targets) {
      const sellable = await sellableQuantity(target.id)
      const existing = await prisma.cartLine.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId: target.id } },
      })
      const wanted = (existing?.quantity ?? 0) + target.quantity

      // `null` = vente à découvert autorisée, aucune borne à appliquer.
      const granted = sellable === null ? wanted : Math.min(wanted, sellable)

      if (granted <= 0) {
        if (target.requiredBy === null) {
          return { ok: false, error: `${variant.product.name} est indisponible.` }
        }
        notes.push("Un accessoire sélectionné est indisponible : il n'a pas été ajouté.")
        continue
      }

      if (granted < wanted && target.requiredBy === null) {
        notes.push(
          granted === 1
            ? "Un seul exemplaire était disponible : la quantité a été ajustée."
            : `Seulement ${granted} exemplaires étaient disponibles : la quantité a été ajustée.`,
        )
      }

      await prisma.cartLine.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: target.id } },
        update: { quantity: granted },
        create: {
          cartId: cart.id,
          variantId: target.id,
          quantity: granted,
          requiredBy: target.requiredBy,
          addedForConfigurationId: configurationId || null,
        },
      })
    }

    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } })
    const itemCount = await countItems(cart.id)

    revalidatePath('/', 'layout')
    return { ok: true, itemCount, message: notes.join(' ') || undefined }
  } catch (error) {
    console.error('[panier] ajout impossible', error)
    return { ok: false, error: "L'ajout au panier a échoué. Réessayez dans un instant." }
  }
}

const updateSchema = z.object({
  lineId: z.string().min(1),
  quantity: z.number().int().min(0).max(99),
})

export async function updateCartLine(input: unknown): Promise<CartActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Demande invalide.' }
  const { lineId, quantity } = parsed.data

  try {
    const store = await cookies()
    const token = store.get(CART_COOKIE)?.value
    if (!token) return { ok: false, error: 'Panier introuvable.' }

    // On passe par le jeton du panier : sans ce filtre, un identifiant de ligne
    // deviné permettrait de modifier le panier de quelqu'un d'autre.
    const line = await prisma.cartLine.findFirst({
      where: { id: lineId, cart: { token } },
      include: { cart: true },
    })
    if (!line) return { ok: false, error: 'Article introuvable dans votre panier.' }

    if (quantity === 0) {
      // Retirer un article retire aussi les accessoires qu'il avait rendus
      // nécessaires : les laisser seuls au panier n'aurait aucun sens.
      await prisma.cartLine.deleteMany({
        where: { cartId: line.cartId, OR: [{ id: lineId }, { requiredBy: line.variantId }] },
      })
      const itemCount = await countItems(line.cartId)
      revalidatePath('/', 'layout')
      return { ok: true, itemCount }
    }

    const sellable = await sellableQuantity(line.variantId)
    const granted = sellable === null ? quantity : Math.min(quantity, sellable)
    if (granted <= 0) return { ok: false, error: 'Cet article est indisponible.' }

    await prisma.cartLine.update({ where: { id: lineId }, data: { quantity: granted } })
    const itemCount = await countItems(line.cartId)

    revalidatePath('/', 'layout')
    return {
      ok: true,
      itemCount,
      message:
        granted < quantity
          ? `Stock insuffisant : la quantité a été ramenée à ${granted}.`
          : undefined,
    }
  } catch (error) {
    console.error('[panier] mise à jour impossible', error)
    return { ok: false, error: 'La mise à jour a échoué.' }
  }
}

async function countItems(cartId: string): Promise<number> {
  const aggregate = await prisma.cartLine.aggregate({
    where: { cartId },
    _sum: { quantity: true },
  })
  return aggregate._sum.quantity ?? 0
}
