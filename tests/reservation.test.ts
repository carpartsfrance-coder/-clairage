import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  StockConflictError,
  commitReservation,
  expandToStockLines,
  nextOrderReference,
  releaseReservation,
  reserveForOrder,
} from '../src/lib/stock-reservation'

/**
 * Tests sur une vraie base PostgreSQL.
 *
 * La réservation de stock repose sur une condition évaluée par PostgreSQL au
 * moment de l'écriture (`UPDATE … WHERE stockOnHand - stockReserved >= n`).
 * Un faux client Prisma ne testerait que mon propre code de simulation et
 * laisserait passer exactement le bug que ces tests existent pour attraper :
 * deux clients qui achètent la dernière pièce en même temps.
 *
 * Base dédiée : lumera_test. Créée par
 *   createdb lumera_test && DATABASE_URL=…lumera_test npx prisma migrate deploy
 */
// vitest.config.ts force DATABASE_URL sur la base de test avant tout import :
// ce client vise donc lumera_test, comme celui de src/lib/db.ts.
const prisma = new PrismaClient()

async function reset() {
  // L'ordre suit les dépendances.
  await prisma.stockMovement.deleteMany()
  await prisma.kitComponent.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
}

async function makeVariant(
  sku: string,
  stockOnHand: number,
  options: { backorder?: boolean; reserved?: number } = {},
) {
  const product = await prisma.product.create({
    data: { slug: `p-${sku.toLowerCase()}`, name: `Produit ${sku}`, status: 'PUBLISHED' },
  })
  return prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      name: sku,
      priceCents: 1000,
      stockOnHand,
      stockReserved: options.reserved ?? 0,
      backorder: options.backorder ?? false,
    },
  })
}

async function sellable(id: string) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id } })
  return v.stockOnHand - v.stockReserved
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await prisma.$disconnect()
})

describe('reserveForOrder', () => {
  it('abaisse le vendable sans toucher au stock détenu', async () => {
    const variant = await makeVariant('SIMPLE', 10)

    await prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 3 }]))

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockOnHand).toBe(10) // rien n'est encore sorti
    expect(after.stockReserved).toBe(3)
    expect(await sellable(variant.id)).toBe(7)
  })

  it('refuse de réserver au-delà du vendable', async () => {
    const variant = await makeVariant('RARE', 2)

    await expect(
      prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 3 }])),
    ).rejects.toBeInstanceOf(StockConflictError)

    // La transaction est annulée : rien ne doit rester réservé.
    expect(await sellable(variant.id)).toBe(2)
  })

  it("tient compte du stock déjà réservé par d'autres commandes", async () => {
    const variant = await makeVariant('PARTAGE', 5, { reserved: 4 })

    await expect(
      prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 2 }])),
    ).rejects.toBeInstanceOf(StockConflictError)

    await prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 1 }]))
    expect(await sellable(variant.id)).toBe(0)
  })

  it('laisse passer la vente à découvert', async () => {
    const variant = await makeVariant('DECOUVERT', 0, { backorder: true })

    await prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 5 }]))

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockReserved).toBe(5)
  })

  /**
   * Le test qui compte : deux commandes simultanées sur la dernière pièce.
   * Une seule doit passer. Sans la condition SQL, les deux passeraient.
   */
  it('ne vend pas deux fois la dernière pièce (achats simultanés)', async () => {
    const variant = await makeVariant('DERNIERE', 1)

    const attempt = () =>
      prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 1 }]))

    const results = await Promise.allSettled([attempt(), attempt()])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const ko = results.filter((r) => r.status === 'rejected')

    expect(ok).toHaveLength(1)
    expect(ko).toHaveLength(1)
    expect(await sellable(variant.id)).toBe(0)
  })

  it('ne survend pas sous une rafale de commandes concurrentes', async () => {
    const variant = await makeVariant('RAFALE', 5)

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: variant.id, quantity: 1 }])),
      ),
    )

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockReserved).toBe(5)
    expect(await sellable(variant.id)).toBe(0)
  })
})

describe('kits', () => {
  async function makeKit() {
    const bulbs = await makeVariant('AMPOULES', 64)
    const adapter = await makeVariant('ADAPT', 7)
    const kitProduct = await prisma.product.create({
      data: { slug: 'p-kit', name: 'Kit', status: 'PUBLISHED', kind: 'KIT' },
    })
    const kit = await prisma.productVariant.create({
      data: {
        productId: kitProduct.id,
        sku: 'KIT',
        name: 'Le kit complet',
        packaging: 'KIT',
        priceCents: 9990,
        stockOnHand: 0,
      },
    })
    await prisma.kitComponent.createMany({
      data: [
        { kitId: kit.id, componentId: bulbs.id, quantity: 1, required: true },
        { kitId: kit.id, componentId: adapter.id, quantity: 2, required: true },
      ],
    })
    return { kit, bulbs, adapter }
  }

  it('développe un kit en ses composants', async () => {
    const { kit, bulbs, adapter } = await makeKit()

    const lines = await prisma.$transaction((tx) =>
      expandToStockLines(tx, [{ variantId: kit.id, quantity: 2 }]),
    )

    expect(lines).toContainEqual({ variantId: bulbs.id, quantity: 2 })
    expect(lines).toContainEqual({ variantId: adapter.id, quantity: 4 })
    // Le kit lui-même ne porte aucun stock : il ne doit pas figurer.
    expect(lines.find((line) => line.variantId === kit.id)).toBeUndefined()
  })

  it("réserve les composants, pas le kit", async () => {
    const { kit, bulbs, adapter } = await makeKit()

    await prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: kit.id, quantity: 3 }]))

    expect(await sellable(bulbs.id)).toBe(61)
    expect(await sellable(adapter.id)).toBe(1) // 7 − 3×2
    const kitAfter = await prisma.productVariant.findUniqueOrThrow({ where: { id: kit.id } })
    expect(kitAfter.stockReserved).toBe(0)
  })

  it('échoue entièrement si un seul composant manque', async () => {
    const { kit, bulbs, adapter } = await makeKit()

    // 7 adaptateurs, 2 par kit → 4 kits demandent 8 adaptateurs.
    await expect(
      prisma.$transaction((tx) => reserveForOrder(tx, [{ variantId: kit.id, quantity: 4 }])),
    ).rejects.toBeInstanceOf(StockConflictError)

    // Aucun composant ne doit rester réservé : la transaction est annulée.
    expect(await sellable(bulbs.id)).toBe(64)
    expect(await sellable(adapter.id)).toBe(7)
  })
})

describe('cycle complet', () => {
  it('paiement confirmé : le stock détenu baisse, le vendable ne rebouge pas', async () => {
    const variant = await makeVariant('CYCLE', 10)
    const lines = [{ variantId: variant.id, quantity: 4 }]

    await prisma.$transaction((tx) => reserveForOrder(tx, lines))
    expect(await sellable(variant.id)).toBe(6)

    await prisma.$transaction((tx) => commitReservation(tx, lines, 'CMD-2026-00001'))

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockOnHand).toBe(6)
    expect(after.stockReserved).toBe(0)
    expect(await sellable(variant.id)).toBe(6) // inchangé depuis la réservation

    const movements = await prisma.stockMovement.findMany({ where: { variantId: variant.id } })
    expect(movements).toHaveLength(1)
    expect(movements[0].delta).toBe(-4)
    expect(movements[0].reference).toBe('CMD-2026-00001')
  })

  it('paiement échoué : le stock redevient vendable', async () => {
    const variant = await makeVariant('ECHEC', 10)
    const lines = [{ variantId: variant.id, quantity: 4 }]

    await prisma.$transaction((tx) => reserveForOrder(tx, lines))
    await prisma.$transaction((tx) => releaseReservation(tx, lines))

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockOnHand).toBe(10)
    expect(after.stockReserved).toBe(0)
  })

  it('une libération rejouée ne descend pas sous zéro', async () => {
    const variant = await makeVariant('REJEU', 10)
    const lines = [{ variantId: variant.id, quantity: 2 }]

    await prisma.$transaction((tx) => reserveForOrder(tx, lines))
    await prisma.$transaction((tx) => releaseReservation(tx, lines))
    await prisma.$transaction((tx) => releaseReservation(tx, lines))

    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(after.stockReserved).toBe(0)
  })
})

describe('nextOrderReference', () => {
  it('ne rejoue jamais un numéro, même en parallèle', async () => {
    const references = await Promise.all(
      Array.from({ length: 20 }, () => prisma.$transaction((tx) => nextOrderReference(tx, 'CMD'))),
    )
    expect(new Set(references).size).toBe(20)
    expect(references[0]).toMatch(/^CMD-\d{4}-\d{5}$/)
  })
})
