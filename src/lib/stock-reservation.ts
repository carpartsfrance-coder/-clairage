import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from './db'

/**
 * Réservation de stock.
 *
 * Le problème que ce module résout : entre le moment où le client voit « en
 * stock » et celui où il paie, quelqu'un d'autre peut acheter la même pièce.
 * Sans réservation, les deux commandes passent et l'une des deux part en SAV.
 *
 * Le cycle est en trois temps, et chaque temps est atomique :
 *
 *   1. `reserveForOrder`  — à la création de la commande : `stockReserved` monte.
 *      Le stock détenu ne bouge pas, mais le vendable baisse immédiatement.
 *   2. `commitReservation` — au paiement confirmé : `stockOnHand` baisse et
 *      `stockReserved` redescend d'autant. Le vendable, lui, ne bouge pas :
 *      il avait déjà été décompté à l'étape 1.
 *   3. `releaseReservation` — à l'échec, à l'annulation ou à l'expiration :
 *      `stockReserved` redescend et le vendable remonte.
 *
 * Un kit n'a pas de stock propre : on réserve ses COMPOSANTS, à hauteur de la
 * quantité commandée multipliée par la quantité de chaque composant dans le kit.
 *
 * L'atomicité repose sur un `updateMany` conditionnel : la condition de stock
 * est évaluée par PostgreSQL au moment de l'écriture, pas par Node avant.
 * Deux requêtes concurrentes ne peuvent donc pas réserver la même unité — la
 * seconde voit `count === 0` et la transaction entière est annulée.
 */

export type ReservationLine = { variantId: string; quantity: number }

export class StockConflictError extends Error {
  constructor(
    message: string,
    /** Variante qui a manqué, pour pouvoir le dire précisément au client. */
    readonly variantId: string,
  ) {
    super(message)
    this.name = 'StockConflictError'
  }
}

/**
 * Développe des lignes (kits compris) en mouvements de stock unitaires.
 * Un kit disparaît au profit de ses composants obligatoires.
 */
export async function expandToStockLines(
  tx: Prisma.TransactionClient,
  lines: ReservationLine[],
): Promise<ReservationLine[]> {
  const variants = await tx.productVariant.findMany({
    where: { id: { in: lines.map((line) => line.variantId) } },
    include: { components: { where: { required: true } } },
  })

  const byVariant = new Map(variants.map((variant) => [variant.id, variant]))
  const totals = new Map<string, number>()

  for (const line of lines) {
    const variant = byVariant.get(line.variantId)
    if (!variant) {
      throw new StockConflictError("Article introuvable.", line.variantId)
    }

    if (variant.components.length > 0) {
      for (const component of variant.components) {
        totals.set(
          component.componentId,
          (totals.get(component.componentId) ?? 0) + component.quantity * line.quantity,
        )
      }
    } else {
      totals.set(variant.id, (totals.get(variant.id) ?? 0) + line.quantity)
    }
  }

  return [...totals.entries()].map(([variantId, quantity]) => ({ variantId, quantity }))
}

/**
 * Réserve le stock nécessaire. À appeler DANS la transaction qui crée la
 * commande, pour que l'une n'existe jamais sans l'autre.
 */
export async function reserveForOrder(
  tx: Prisma.TransactionClient,
  lines: ReservationLine[],
): Promise<void> {
  const stockLines = await expandToStockLines(tx, lines)

  // Ordre stable sur l'identifiant : deux commandes qui se croisent verrouillent
  // les mêmes lignes dans le même ordre, ce qui évite l'interblocage.
  stockLines.sort((a, b) => a.variantId.localeCompare(b.variantId))

  for (const line of stockLines) {
    const variant = await tx.productVariant.findUnique({
      where: { id: line.variantId },
      select: { backorder: true, sku: true },
    })
    if (!variant) throw new StockConflictError('Article introuvable.', line.variantId)

    // La vente à découvert ignore la contrainte de stock, mais la réservation
    // est tout de même enregistrée : elle sert au réapprovisionnement.
    const updated = variant.backorder
      ? await tx.productVariant.updateMany({
          where: { id: line.variantId },
          data: { stockReserved: { increment: line.quantity } },
        })
      : await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET "stockReserved" = "stockReserved" + ${line.quantity}
          WHERE id = ${line.variantId}
            AND "stockOnHand" - "stockReserved" >= ${line.quantity}
        `

    const count = typeof updated === 'number' ? updated : updated.count
    if (count !== 1) {
      throw new StockConflictError(
        `Le stock de ${variant.sku} ne suffit plus.`,
        line.variantId,
      )
    }
  }
}

/** Paiement confirmé : la réservation devient une sortie de stock réelle. */
export async function commitReservation(
  tx: Prisma.TransactionClient,
  lines: ReservationLine[],
  orderReference: string,
): Promise<void> {
  const stockLines = await expandToStockLines(tx, lines)

  for (const line of stockLines) {
    await tx.productVariant.update({
      where: { id: line.variantId },
      data: {
        stockOnHand: { decrement: line.quantity },
        stockReserved: { decrement: line.quantity },
      },
    })
    await tx.stockMovement.create({
      data: {
        variantId: line.variantId,
        delta: -line.quantity,
        reason: 'order',
        reference: orderReference,
      },
    })
  }
}

/**
 * Libère une réservation : échec de paiement, annulation, expiration.
 * `stockReserved` ne descend jamais sous zéro, même si l'appel est rejoué.
 */
export async function releaseReservation(
  tx: Prisma.TransactionClient,
  lines: ReservationLine[],
): Promise<void> {
  const stockLines = await expandToStockLines(tx, lines)

  for (const line of stockLines) {
    await tx.$executeRaw`
      UPDATE "ProductVariant"
      SET "stockReserved" = GREATEST(0, "stockReserved" - ${line.quantity})
      WHERE id = ${line.variantId}
    `
  }
}

/**
 * Numéro de commande, pris sur une séquence PostgreSQL.
 * Atomique : deux commandes simultanées ne peuvent pas obtenir le même numéro.
 */
export async function nextOrderReference(
  tx: Prisma.TransactionClient,
  prefix = 'CMD',
  year = new Date().getFullYear(),
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('order_reference_seq') AS nextval
  `
  const value = Number(rows[0]?.nextval ?? 0)
  return `${prefix}-${year}-${String(value).padStart(5, '0')}`
}

/** Lignes d'une commande, au format attendu par les fonctions ci-dessus. */
export async function orderReservationLines(orderId: string): Promise<ReservationLine[]> {
  const lines = await prisma.orderLine.findMany({
    where: { orderId, parentLineId: null, variantId: { not: null } },
    select: { variantId: true, quantity: true },
  })
  return lines
    .filter((line): line is { variantId: string; quantity: number } => line.variantId !== null)
    .map((line) => ({ variantId: line.variantId, quantity: line.quantity }))
}
