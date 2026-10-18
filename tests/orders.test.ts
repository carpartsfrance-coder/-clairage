import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { applyPaymentOutcome, expireStaleOrders } from '../src/lib/orders'

/**
 * Le chemin de l'argent.
 *
 * Ce que ces tests protègent : un prestataire de paiement **rejoue** ses
 * événements. C'est normal, documenté, et ça arrive tous les jours. Si
 * `applyPaymentOutcome` n'était pas idempotent, le stock serait décompté deux
 * fois à chaque rejeu — silencieusement, et sans que personne le voie avant
 * l'inventaire.
 *
 * Les tests tournent sur lumera_test (voir vitest.config.ts, qui force
 * DATABASE_URL avant tout import).
 */
const prisma = new PrismaClient()

async function reset() {
  await prisma.orderEvent.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderLine.deleteMany()
  await prisma.order.deleteMany()
  await prisma.emailLog.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.cartLine.deleteMany()
  await prisma.cart.deleteMany()
  await prisma.kitComponent.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
}

/** Commande d'un article simple, stock déjà réservé, paiement en attente. */
async function makePendingOrder(options: { stockOnHand?: number; quantity?: number } = {}) {
  const quantity = options.quantity ?? 2
  const product = await prisma.product.create({
    data: { slug: 'p-test', name: 'Produit test', status: 'PUBLISHED' },
  })
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: 'TEST-1',
      name: 'Unité',
      priceCents: 1000,
      stockOnHand: options.stockOnHand ?? 10,
      // Déjà réservé, comme après placeOrder.
      stockReserved: quantity,
    },
  })
  const order = await prisma.order.create({
    data: {
      reference: `CMD-TEST-${Math.floor(performance.now() * 1000)}`,
      email: 'client@example.com',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      subtotalCents: 1000 * quantity,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1000 * quantity,
      shippingAddress: {},
      billingAddress: {},
    },
  })
  await prisma.orderLine.create({
    data: {
      orderId: order.id,
      variantId: variant.id,
      sku: variant.sku,
      productName: product.name,
      variantName: variant.name,
      packaging: 'UNIT',
      quantity,
      unitPriceCents: 1000,
      lineTotalCents: 1000 * quantity,
      vatRateBp: 2000,
      snapshot: {},
    },
  })
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'simulation',
      providerRef: `sim_${order.id}`,
      status: 'PENDING',
      amountCents: order.totalCents,
      isTestMode: true,
    },
  })
  return { order, variant, payment, quantity }
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await prisma.$disconnect()
})

describe('applyPaymentOutcome', () => {
  it('confirme la commande et décompte le stock', async () => {
    const { order, variant, payment, quantity } = await makePendingOrder()

    const result = await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)
    expect(result.applied).toBe(true)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PAID')
    expect(after.status).toBe('CONFIRMED')
    expect(after.placedAt).not.toBeNull()

    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10 - quantity)
    expect(stock.stockReserved).toBe(0)
  })

  it('ignore un événement rejoué : le stock ne bouge qu’une fois', async () => {
    const { order, variant, payment } = await makePendingOrder()

    await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)
    const afterFirst = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    const movementsAfterFirst = await prisma.stockMovement.count()

    // Trois rejeux, comme le ferait un prestataire qui n'a pas reçu notre 200.
    for (let i = 0; i < 3; i += 1) {
      const replay = await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)
      expect(replay.applied).toBe(false)
      expect(replay.reason).toBe('déjà traité')
    }

    const afterReplays = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    expect(afterReplays.stockOnHand).toBe(afterFirst.stockOnHand)
    expect(afterReplays.stockReserved).toBe(afterFirst.stockReserved)
    expect(await prisma.stockMovement.count()).toBe(movementsAfterFirst)
  })

  it('libère le stock quand le paiement échoue', async () => {
    const { variant, payment, quantity } = await makePendingOrder()

    const result = await applyPaymentOutcome(payment.providerRef, 'failed')
    expect(result.applied).toBe(true)

    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10) // rien n'est sorti
    expect(stock.stockReserved).toBe(0) // la réservation est rendue
    expect(stock.stockOnHand - stock.stockReserved).toBe(10)
  })

  it("refuse d'appliquer un montant qui ne correspond pas", async () => {
    const { order, variant, payment } = await makePendingOrder()

    const result = await applyPaymentOutcome(payment.providerRef, 'paid', 1)
    expect(result.applied).toBe(false)
    expect(result.reason).toBe('montant incohérent')

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PENDING')

    // Le stock reste réservé : ni décompté, ni rendu, en attendant un arbitrage.
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10)
    expect(stock.stockReserved).toBe(2)

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    expect(events.some((e) => e.type === 'payment.amount_mismatch')).toBe(true)
  })

  it('ignore un paiement inconnu plutôt que de lever', async () => {
    const result = await applyPaymentOutcome('sim_inexistant', 'paid', 1000)
    expect(result.applied).toBe(false)
    expect(result.reason).toBe('paiement inconnu')
  })

  it('ne vide que le panier d’origine', async () => {
    const { order, payment } = await makePendingOrder()

    const mine = await prisma.cart.create({ data: { token: 'panier-de-la-commande' } })
    const someoneElse = await prisma.cart.create({ data: { token: 'panier-d-un-autre-visiteur' } })
    await prisma.order.update({ where: { id: order.id }, data: { cartToken: mine.token } })

    await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)

    expect(await prisma.cart.findUnique({ where: { id: mine.id } })).toBeNull()
    // Le panier d'un autre visiteur ne doit pas disparaître.
    expect(await prisma.cart.findUnique({ where: { id: someoneElse.id } })).not.toBeNull()
  })

  it('trace un e-mail de confirmation, marqué comme simulé', async () => {
    const { order, payment } = await makePendingOrder()
    await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)

    const mail = await prisma.emailLog.findFirst({ where: { toEmail: order.email } })
    expect(mail?.template).toBe('commande.confirmation')
    // Sans prestataire configuré, l'envoi est simulé — et le dit.
    expect(mail?.simulated).toBe(true)
  })
})

describe('expireStaleOrders', () => {
  it('libère le stock des commandes impayées trop anciennes', async () => {
    const { order, variant } = await makePendingOrder()
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 120 * 60_000) },
    })

    const released = await expireStaleOrders(60)
    expect(released).toBe(1)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('EXPIRED')
    expect(after.status).toBe('CANCELLED')

    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(0)
    expect(stock.stockOnHand).toBe(10)
  })

  it('laisse tranquilles les commandes récentes', async () => {
    const { order, variant } = await makePendingOrder()

    expect(await expireStaleOrders(60)).toBe(0)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PENDING')
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(2)
  })
})
