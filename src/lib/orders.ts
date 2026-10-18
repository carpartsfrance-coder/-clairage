import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './db'
import { getShippingOffers } from './shipping'
import { effectivePrice } from './delivery-teaser'
import {
  StockConflictError,
  commitReservation,
  nextOrderReference,
  orderReservationLines,
  releaseReservation,
  reserveForOrder,
} from './stock-reservation'
import { resolvePaymentDriver } from './payments'
import type { PaymentOutcome } from './payments'
import { sendEmail } from './email'
import { identity } from './identity'

/**
 * Commandes.
 *
 * Deux principes, et ils tiennent tout le reste :
 *
 * 1. **Rien de ce que le navigateur envoie n'entre dans un total.** Les prix,
 *    la TVA et les frais de port sont relus en base au moment de valider. Le
 *    formulaire ne transmet que des identifiants et un choix de livraison.
 * 2. **La commande et la réservation de stock naissent et meurent ensemble.**
 *    Elles sont créées dans la même transaction : il ne peut pas exister de
 *    commande sans stock réservé, ni de stock réservé sans commande.
 */

export type CheckoutAddress = {
  firstName: string
  lastName: string
  company?: string | null
  line1: string
  line2?: string | null
  postalCode: string
  city: string
  country: string
  phone?: string | null
}

export type PlaceOrderInput = {
  cartToken: string
  email: string
  phone?: string | null
  shippingAddress: CheckoutAddress
  billingAddress: CheckoutAddress
  shippingMethodCode: string
  /** Consentements recueillis, horodatés à l'enregistrement. */
  consents: Record<string, boolean>
  userId?: string | null
  configurationId?: string | null
  /** Base des URL de retour, fournie par la requête. */
  origin: string
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; reference: string; redirectUrl: string }
  | { ok: false; error: string; variantId?: string }

/** Totaux recalculés depuis la base. Jamais depuis le client. */
export type CheckoutTotals = {
  subtotalCents: number
  shippingCents: number
  vatCents: number
  totalCents: number
}

export async function computeTotals(
  lines: Array<{ unitPriceCents: number; quantity: number; vatRateBp: number }>,
  shippingCents: number,
): Promise<CheckoutTotals> {
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0)
  // Prix TTC : la TVA contenue vaut total × taux / (10000 + taux).
  const vatCents = lines.reduce((sum, line) => {
    const lineTotal = line.unitPriceCents * line.quantity
    return sum + Math.round((lineTotal * line.vatRateBp) / (10000 + line.vatRateBp))
  }, 0)
  return {
    subtotalCents,
    shippingCents,
    vatCents,
    totalCents: subtotalCents + shippingCents,
  }
}

/**
 * Crée la commande, réserve le stock et ouvre une session de paiement.
 *
 * L'ordre compte : la session de paiement est ouverte APRÈS la transaction.
 * Si l'appel au prestataire échoue, la commande existe en PENDING avec son
 * stock réservé et peut être reprise ou expirée — alors qu'un paiement ouvert
 * sans commande serait un encaissement orphelin.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const cart = await prisma.cart.findUnique({
    where: { token: input.cartToken },
    include: {
      lines: {
        orderBy: { createdAt: 'asc' },
        include: {
          variant: {
            include: {
              vatRate: true,
              product: { select: { name: true, slug: true, status: true } },
              components: {
                orderBy: { position: 'asc' },
                include: { component: { include: { product: { select: { name: true } } } } },
              },
            },
          },
        },
      },
    },
  })

  if (!cart || cart.lines.length === 0) {
    return { ok: false, error: 'Votre panier est vide.' }
  }

  const unavailable = cart.lines.find((line) => line.variant.product.status !== 'PUBLISHED')
  if (unavailable) {
    return {
      ok: false,
      error: `${unavailable.variant.product.name} n'est plus disponible à la vente.`,
      variantId: unavailable.variantId,
    }
  }

  // --- Livraison : la méthode doit exister et son prix vient de la base ------
  const subtotalCents = cart.lines.reduce(
    (sum, line) => sum + line.variant.priceCents * line.quantity,
    0,
  )
  const offers = await getShippingOffers(input.shippingAddress.country)
  const method = offers.find((offer) => offer.code === input.shippingMethodCode)
  if (!method) {
    return { ok: false, error: "Ce mode de livraison n'est pas disponible." }
  }
  const shippingCents = effectivePrice(method, subtotalCents)

  const lineInputs = cart.lines.map((line) => ({
    unitPriceCents: line.variant.priceCents,
    quantity: line.quantity,
    vatRateBp: line.variant.vatRate?.rateBp ?? 0,
  }))
  const totals = await computeTotals(lineInputs, shippingCents)

  const prefix =
    (await prisma.setting.findUnique({ where: { key: 'order.prefix' } }))?.value?.toString() ??
    'CMD'

  let orderId = ''
  let reference = ''
  const guestToken = input.userId ? null : randomBytes(24).toString('base64url')

  try {
    await prisma.$transaction(async (tx) => {
      reference = await nextOrderReference(tx, prefix)

      const order = await tx.order.create({
        data: {
          reference,
          // Prisma n'accepte pas les clés étrangères brutes quand la relation
          // est déclarée : on connecte, ou on omet. Une commande invité n'a pas
          // d'utilisateur, et un client sans véhicule sélectionné n'a pas de
          // configuration — dans les deux cas le champ reste absent.
          ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
          ...(input.configurationId
            ? { configuration: { connect: { id: input.configurationId } } }
            : {}),
          guestToken,
          cartToken: cart.token,
          email: input.email,
          phone: input.phone ?? null,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'UNFULFILLED',
          currency: cart.currency,
          subtotalCents: totals.subtotalCents,
          discountCents: 0,
          shippingCents: totals.shippingCents,
          taxCents: totals.vatCents,
          totalCents: totals.totalCents,
          shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: input.billingAddress as unknown as Prisma.InputJsonValue,
          shippingMethodCode: method.code,
          shippingMethodLabel: method.carrier ? `${method.label} — ${method.carrier}` : method.label,
          consents: Object.fromEntries(
            Object.entries(input.consents).map(([key, value]) => [
              key,
              { accepted: value, at: new Date().toISOString() },
            ]),
          ) as Prisma.InputJsonValue,
        },
      })
      orderId = order.id

      for (const line of cart.lines) {
        const { variant } = line
        const parent = await tx.orderLine.create({
          data: {
            order: { connect: { id: order.id } },
            variant: { connect: { id: variant.id } },
            sku: variant.sku,
            productName: variant.product.name,
            variantName: variant.name,
            packaging: variant.packaging,
            quantity: line.quantity,
            unitPriceCents: variant.priceCents,
            lineTotalCents: variant.priceCents * line.quantity,
            vatRateBp: variant.vatRate?.rateBp ?? 0,
            // L'instantané fige ce qui a été acheté : modifier le produit ou
            // une compatibilité plus tard ne doit pas réécrire l'historique.
            snapshot: {
              productSlug: variant.product.slug,
              configurationId: input.configurationId ?? null,
              addedForConfigurationId: line.addedForConfigurationId,
              requiredBy: line.requiredBy,
              components: variant.components.map((entry) => ({
                sku: entry.component.sku,
                productName: entry.component.product.name,
                variantName: entry.component.name,
                quantity: entry.quantity,
                required: entry.required,
              })),
            } as Prisma.InputJsonValue,
          },
        })

        // Les composants d'un kit sont enregistrés comme lignes filles : le
        // back-office voit ce qu'il doit préparer, et un remboursement partiel
        // peut porter sur un composant précis.
        for (const entry of variant.components) {
          await tx.orderLine.create({
            data: {
              order: { connect: { id: order.id } },
              variant: { connect: { id: entry.componentId } },
              parentLineId: parent.id,
              sku: entry.component.sku,
              productName: entry.component.product.name,
              variantName: entry.component.name,
              packaging: entry.component.packaging,
              quantity: entry.quantity * line.quantity,
              // Le composant est déjà payé dans le prix du kit : sa ligne vaut 0
              // pour ne pas compter deux fois le même montant dans le total.
              unitPriceCents: 0,
              lineTotalCents: 0,
              vatRateBp: 0,
              snapshot: { partOfKit: variant.sku } as Prisma.InputJsonValue,
            },
          })
        }
      }

      await reserveForOrder(
        tx,
        cart.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      )

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'order.created',
          message: 'Commande créée, stock réservé.',
          actorKind: 'customer',
        },
      })
    })
  } catch (error) {
    if (error instanceof StockConflictError) {
      return { ok: false, error: error.message, variantId: error.variantId }
    }
    console.error('[commande] création impossible', error)
    return { ok: false, error: "La commande n'a pas pu être enregistrée." }
  }

  // --- Paiement : hors transaction, car il appelle un service externe -------
  try {
    const driver = resolvePaymentDriver()
    const session = await driver.createSession({
      orderId,
      orderReference: reference,
      email: input.email,
      amountCents: totals.totalCents,
      currency: cart.currency,
      lines: cart.lines.map((line) => ({
        label: `${line.variant.product.name} — ${line.variant.name}`,
        unitPriceCents: line.variant.priceCents,
        quantity: line.quantity,
      })),
      shippingCents: totals.shippingCents,
      successUrl: `${input.origin}/commande/${orderId}/confirmation`,
      cancelUrl: `${input.origin}/commande/${orderId}/paiement?abandon=1`,
      // Une clé par commande : recharger la page ne crée pas un second paiement.
      idempotencyKey: `order_${orderId}`,
    })

    await prisma.payment.create({
      data: {
        orderId,
        provider: session.provider,
        providerRef: session.providerRef,
        idempotencyKey: `order_${orderId}`,
        status: 'PENDING',
        amountCents: totals.totalCents,
        currency: cart.currency,
        isTestMode: session.isTestMode,
        rawPayload: { simulated: session.simulated } as Prisma.InputJsonValue,
      },
    })

    return { ok: true, orderId, reference, redirectUrl: session.redirectUrl }
  } catch (error) {
    console.error('[commande] ouverture du paiement impossible', error)
    // La commande reste en PENDING avec son stock réservé : elle est reprenable
    // depuis la page de paiement, et expirera d'elle-même sinon.
    return {
      ok: false,
      error:
        "La commande a été enregistrée mais le paiement n'a pas pu être ouvert. " +
        'Reprenez depuis votre panier dans quelques instants.',
    }
  }
}

/**
 * Applique l'issue d'un paiement.
 *
 * C'est le SEUL endroit où le statut d'une commande change en fonction d'un
 * paiement — webhook Stripe comme paiement simulé passent par ici. Avoir deux
 * chemins reviendrait à tester l'un et à livrer l'autre.
 *
 * Idempotent : rejouer le même événement ne décrémente pas le stock deux fois.
 * Les prestataires rejouent, c'est normal et attendu.
 */
export async function applyPaymentOutcome(
  providerRef: string,
  outcome: PaymentOutcome,
  amountCents: number | null = null,
  raw: unknown = null,
): Promise<{ applied: boolean; orderId: string | null; reason?: string }> {
  const payment = await prisma.payment.findUnique({
    where: { providerRef },
    include: { order: true },
  })

  if (!payment) return { applied: false, orderId: null, reason: 'paiement inconnu' }
  if (payment.status === 'PAID' || payment.order.paymentStatus === 'PAID') {
    return { applied: false, orderId: payment.orderId, reason: 'déjà traité' }
  }

  // Un montant qui ne correspond pas est un signal, pas un détail : on ne
  // valide pas la commande et on laisse une trace pour le back-office.
  if (outcome === 'paid' && amountCents !== null && amountCents !== payment.amountCents) {
    await prisma.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'payment.amount_mismatch',
        message: `Montant reçu ${amountCents} ≠ montant attendu ${payment.amountCents}.`,
        payload: { raw } as Prisma.InputJsonValue,
      },
    })
    return { applied: false, orderId: payment.orderId, reason: 'montant incohérent' }
  }

  const lines = await orderReservationLines(payment.orderId)

  await prisma.$transaction(async (tx) => {
    if (outcome === 'paid') {
      await commitReservation(tx, lines, payment.order.reference)
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', rawPayload: (raw ?? {}) as Prisma.InputJsonValue },
      })
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED', placedAt: new Date() },
      })
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'payment.paid',
          message: 'Paiement confirmé, stock décompté.',
        },
      })
      // Le panier est vidé seulement ici : tant que le paiement n'a pas abouti,
      // le client doit pouvoir revenir à son panier intact.
      //
      // On cible le panier d'origine par son jeton. Filtrer sur l'utilisateur
      // viderait TOUS les paniers anonymes dès la première commande invité,
      // puisque `userId` y est nul.
      if (payment.order.cartToken) {
        await tx.cart.deleteMany({ where: { token: payment.order.cartToken } })
      }
    } else {
      await releaseReservation(tx, lines)
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: outcome === 'expired' ? 'EXPIRED' : 'FAILED',
          rawPayload: (raw ?? {}) as Prisma.InputJsonValue,
        },
      })
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: outcome === 'expired' ? 'EXPIRED' : 'FAILED',
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      })
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: outcome === 'expired' ? 'payment.expired' : 'payment.failed',
          message: 'Stock remis à disposition.',
        },
      })
    }
  })

  if (outcome === 'paid') {
    // L'e-mail sort de la transaction : un prestataire e-mail indisponible ne
    // doit pas annuler un paiement qui a bien eu lieu.
    await sendEmail({
      template: 'commande.confirmation',
      to: payment.order.email,
      subject: `${identity.name} — commande ${payment.order.reference} confirmée`,
      variables: {
        reference: payment.order.reference,
        totalCents: payment.order.totalCents,
      },
    }).catch((error) => console.error('[commande] e-mail de confirmation', error))
  }

  return { applied: true, orderId: payment.orderId }
}

/**
 * Libère les commandes restées en attente de paiement.
 * Appelée par le cron : une réservation qui n'aboutit pas doit rendre le stock.
 */
export async function expireStaleOrders(olderThanMinutes = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const stale = await prisma.order.findMany({
    where: { paymentStatus: 'PENDING', status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true },
  })

  for (const order of stale) {
    const lines = await orderReservationLines(order.id)
    await prisma.$transaction(async (tx) => {
      await releaseReservation(tx, lines)
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'EXPIRED', status: 'CANCELLED', cancelledAt: new Date() },
      })
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      })
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'order.expired',
          message: `Sans paiement après ${olderThanMinutes} minutes : stock remis à disposition.`,
        },
      })
    })
  }

  return stale.length
}
