import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { applyPaymentOutcome, expireStaleOrders, placeOrder } from '../src/lib/orders'

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

  /**
   * Le rejeu séquentiel ne suffit pas à prouver l'idempotence : c'est le rejeu
   * SIMULTANÉ qui casse, parce que les deux appels lisent le statut avant que
   * l'un ou l'autre ne l'écrive. Sans verrou, le stock serait décompté deux
   * fois et `stockReserved` passerait sous zéro.
   */
  it('ne décompte qu’une fois sous deux webhooks simultanés', async () => {
    const { order, variant, payment, quantity } = await makePendingOrder()

    const results = await Promise.allSettled([
      applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents),
      applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents),
      applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents),
    ])

    const applied = results.filter(
      (r) => r.status === 'fulfilled' && r.value.applied,
    )
    expect(applied).toHaveLength(1)

    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10 - quantity)
    expect(stock.stockReserved).toBe(0)
    expect(await prisma.stockMovement.count()).toBe(1)
  })

  it('refuse un « payé » qui arrive après un échec', async () => {
    const { order, variant, payment } = await makePendingOrder()

    // Le paiement échoue : le stock est rendu.
    await applyPaymentOutcome(payment.providerRef, 'failed')
    const afterFailure = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })

    // Un « payé » en retard ne doit pas décompter un stock déjà libéré.
    const late = await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)
    expect(late.applied).toBe(false)

    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(afterFailure.stockOnHand)
    expect(stock.stockReserved).toBe(afterFailure.stockReserved)
    expect(await prisma.stockMovement.count()).toBe(0)
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


/* -------------------------------------------------------------------------- */
/* Expiration : ce que le branchement d'un vrai prestataire a changé           */
/* -------------------------------------------------------------------------- */

describe('expireStaleOrders face à un prestataire réel', () => {
  /**
   * Le scénario que ces tests protègent, et qui coûte de l'argent :
   *
   * un paiement Mollie reste réglable bien plus longtemps qu'une heure — douze
   * jours pour un virement bancaire. Libérer le stock au bout de soixante
   * minutes, puis voir le client payer, c'est encaisser pour une commande
   * annulée dont les articles ont été vendus à quelqu'un d'autre.
   *
   * `expireStaleOrders` doit donc DEMANDER avant de conclure.
   */

  const MOLLIE_KEY = 'test_000000000000000000000000000000'

  /** Commande ancienne, payée par Mollie, et réponse imposée à l'API. */
  async function vieilleCommandeMollie(reponse: {
    status?: number
    body?: unknown
    throws?: boolean
  }) {
    const { order, variant, payment } = await makePendingOrder()
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provider: 'mollie', providerRef: 'tr_WDqYK6vllg' },
    })
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 120 * 60_000) },
    })

    process.env.MOLLIE_API_KEY = MOLLIE_KEY
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (reponse.throws) throw new Error('réseau injoignable')
        return new Response(reponse.body === undefined ? '' : JSON.stringify(reponse.body), {
          status: reponse.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    return { order, variant, payment }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.MOLLIE_API_KEY
  })

  it('NE LIBÈRE PAS le stock quand le paiement est encore ouvert chez Mollie', async () => {
    const { order, variant } = await vieilleCommandeMollie({
      body: { id: 'tr_WDqYK6vllg', status: 'open', amount: { currency: 'EUR', value: '20.00' } },
    })

    expect(await expireStaleOrders(60)).toBe(0)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PENDING')
    expect(after.status).toBe('PENDING')

    // Le point qui compte : les articles restent à cette commande.
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(2)
  })

  it('ne libère pas non plus un paiement en attente de confirmation bancaire', async () => {
    // `pending` peut durer deux à trois jours ouvrés.
    const { order } = await vieilleCommandeMollie({
      body: { id: 'tr_WDqYK6vllg', status: 'pending', amount: { currency: 'EUR', value: '20.00' } },
    })

    expect(await expireStaleOrders(60)).toBe(0)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING')
  })

  it('ne conclut rien quand Mollie est injoignable', async () => {
    // Un silence n'est pas un refus.
    const { order, variant } = await vieilleCommandeMollie({ throws: true })

    expect(await expireStaleOrders(60)).toBe(0)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('PENDING')
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(2)
  })

  it('CONFIRME la commande quand Mollie dit qu’elle a été payée', async () => {
    // Le rattrapage sert dans les deux sens : c'est le filet des webhooks
    // perdus, et Mollie abandonne ses relances au bout de 26 heures.
    const { order, variant } = await vieilleCommandeMollie({
      body: {
        id: 'tr_WDqYK6vllg',
        status: 'paid',
        amount: { currency: 'EUR', value: '20.00' },
        amountCaptured: { currency: 'EUR', value: '20.00' },
      },
    })

    expect(await expireStaleOrders(60)).toBe(1)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PAID')
    expect(after.status).toBe('CONFIRMED')

    // Stock décompté, pas rendu.
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(8)
    expect(stock.stockReserved).toBe(0)
  })

  it('applique l’échec quand Mollie dit que le paiement a échoué', async () => {
    const { order, variant } = await vieilleCommandeMollie({
      body: { id: 'tr_WDqYK6vllg', status: 'failed', amount: { currency: 'EUR', value: '20.00' } },
    })

    expect(await expireStaleOrders(60)).toBe(1)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('FAILED')
    expect(after.status).toBe('CANCELLED')
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(0)
    expect(stock.stockOnHand).toBe(10)
  })

  it('libère quand même au bout de 14 jours, prestataire muet ou non', async () => {
    // Sans cette borne, un prestataire durablement injoignable garderait du
    // stock réservé indéfiniment.
    const { order, variant } = await vieilleCommandeMollie({ throws: true })
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 15 * 24 * 60 * 60_000) },
    })

    expect(await expireStaleOrders(60)).toBe(1)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('CANCELLED')
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(0)

    // Le dossier dit POURQUOI, et que le prestataire n'a pas répondu.
    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    expect(events.some((e) => e.message?.includes('14 jours'))).toBe(true)
  })

  it('trace un encaissement arrivé APRÈS la libération du stock', async () => {
    // Le filet : si malgré tout l'argent arrive sur une commande déjà annulée,
    // cela ne doit pas se réduire à une ligne de journal.
    const { order, payment, variant } = await makePendingOrder()
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } })
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', paymentStatus: 'EXPIRED' },
    })

    const result = await applyPaymentOutcome(payment.providerRef, 'paid', order.totalCents)
    expect(result.applied).toBe(false)

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    const alerte = events.find((e) => e.type === 'payment.paid_after_release')
    expect(alerte).toBeDefined()
    expect(alerte?.message).toMatch(/rembourser/)

    // Et surtout : le stock n'est pas décompté une seconde fois.
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10)
  })
})

describe('contrôles avant de confirmer un encaissement', () => {
  /**
   * Trois refus, trois raisons de ne pas confirmer une commande. Dans les trois
   * cas le paiement reste PENDING : il est rattrapable au passage suivant du
   * cron, quand le prestataire répondra peut-être mieux.
   */

  it('refuse un « payé » dont le montant est illisible', async () => {
    const { order, payment, variant } = await makePendingOrder()

    const result = await applyPaymentOutcome(payment.providerRef, 'paid', null, null, {
      amountKnown: false,
    })
    expect(result.applied).toBe(false)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PENDING')
    expect(after.status).toBe('PENDING')

    // Le stock n'est ni décompté ni rendu : on n'a rien conclu.
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockOnHand).toBe(10)
    expect(stock.stockReserved).toBe(2)

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    expect(events.some((e) => e.type === 'payment.amount_unreadable')).toBe(true)
  })

  it('refuse un « payé » dans une autre devise', async () => {
    // 2080 yens ne valent pas 20,80 €. Le montant seul ne suffit pas.
    const { order, payment } = await makePendingOrder()

    const result = await applyPaymentOutcome(
      payment.providerRef,
      'paid',
      order.totalCents,
      null,
      { currency: 'USD', amountKnown: true },
    )
    expect(result.applied).toBe(false)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.paymentStatus).toBe('PENDING')

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    const trace = events.find((e) => e.type === 'payment.currency_mismatch')
    expect(trace?.message).toMatch(/USD/)
  })

  it('accepte la même devise écrite différemment', async () => {
    const { order, payment } = await makePendingOrder()
    const result = await applyPaymentOutcome(
      payment.providerRef,
      'paid',
      order.totalCents,
      null,
      { currency: 'eur', amountKnown: true },
    )
    expect(result.applied).toBe(true)
  })
})

describe('changement de prestataire', () => {
  it('NE LIBÈRE PAS un paiement ouvert chez un autre prestataire', async () => {
    /*
      Scénario réel : la boutique passe de Stripe à Mollie, ou revient en
      simulation sur un environnement de travail. Les paiements déjà ouverts
      chez l'ancien prestataire restent payables, mais on ne peut plus les
      interroger — on ne sait donc rien de leur sort, et on ne libère pas.
    */
    const { order, payment, variant } = await makePendingOrder()
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provider: 'stripe', providerRef: 'cs_test_ancien' },
    })
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 120 * 60_000) },
    })

    // Aucune clé configurée : le pilote courant est la simulation.
    expect(await expireStaleOrders(60)).toBe(0)

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after.status).toBe('PENDING')
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(2)
  })
})

describe('une seule commande en attente par panier', () => {
  /**
   * Revenir en arrière puis resoumettre le formulaire — ou deux onglets — ne
   * doit pas créer une seconde commande. Sinon les mêmes articles sont réservés
   * deux fois et deux paiements sont ouverts chez le prestataire, tous deux
   * payables.
   *
   * La clé d'idempotence envoyée au prestataire ne protège pas de ce cas : elle
   * dérive de l'identifiant de commande, neuf à chaque soumission.
   */
  it('renvoie vers le paiement déjà ouvert au lieu d’en créer un second', async () => {
    const { order, variant } = await makePendingOrder()
    await prisma.order.update({
      where: { id: order.id },
      data: { cartToken: 'panier-essai', guestToken: 'jeton-essai' },
    })

    // Le panier existe toujours : il n'est vidé qu'au paiement confirmé. C'est
    // exactement l'état dans lequel se trouve un client qui resoumet.
    await prisma.cart.create({
      data: {
        token: 'panier-essai',
        lines: { create: [{ variantId: variant.id, quantity: 2 }] },
      },
    })

    const avant = await prisma.order.count()

    const adresse = {
      firstName: 'Essai',
      lastName: 'Doublon',
      line1: '1 rue de l’Essai',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
    }

    const result = await placeOrder({
      cartToken: 'panier-essai',
      email: 'client@example.com',
      shippingMethodCode: 'colissimo',
      shippingAddress: adresse,
      billingAddress: adresse,
      consents: { cgv: true },
      origin: 'http://localhost:3400',
    })

    // Aucune commande supplémentaire, aucune réservation supplémentaire.
    expect(await prisma.order.count()).toBe(avant)
    const stock = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    expect(stock.stockReserved).toBe(2)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.orderId).toBe(order.id)
      // On renvoie le client là où son règlement est en cours.
      expect(result.redirectUrl).toContain(`/commande/${order.id}/paiement`)
      expect(result.redirectUrl).toContain('jeton-essai')
    }
  })
})
