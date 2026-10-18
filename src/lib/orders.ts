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

  /*
    Une seule commande en attente par panier.

    Sans ce contrôle, revenir en arrière puis resoumettre le formulaire — ou
    ouvrir deux onglets — crée une SECONDE commande, qui réserve une seconde
    fois les mêmes articles et ouvre un second paiement chez le prestataire.
    Les deux sont payables. Le client peut régler l'une et abandonner l'autre,
    dont le stock reste immobilisé ; ou régler les deux.

    La clé d'idempotence transmise au prestataire ne protège pas de ce cas :
    elle est dérivée de l'identifiant de commande, qui est neuf à chaque
    soumission. C'est donc ici qu'il faut regarder.

    On ne crée pas : on renvoie vers le paiement déjà ouvert, qui est le geste
    que le client voulait faire.
  */
  const enAttente = await prisma.order.findFirst({
    where: {
      cartToken: input.cartToken,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      payments: { some: { status: 'PENDING' } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, reference: true, guestToken: true },
  })

  if (enAttente) {
    const jeton = enAttente.guestToken ? `?t=${encodeURIComponent(enAttente.guestToken)}` : ''
    return {
      ok: true,
      orderId: enAttente.id,
      reference: enAttente.reference,
      // La page de paiement de cette commande : elle dit où en est le règlement
      // et propose d'en vérifier l'état auprès du prestataire.
      redirectUrl: `/commande/${enAttente.id}/paiement${jeton}`,
    }
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
  // Émis pour TOUTE commande, pas seulement les commandes invité : tant qu'il
  // n'y a pas d'authentification, c'est la seule preuve qu'on a le droit de
  // consulter cette commande. Il voyage dans les URL de retour du prestataire.
  const accessToken = randomBytes(24).toString('base64url')

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
          guestToken: accessToken,
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
      accessToken,
      successUrl: `${input.origin}/commande/${orderId}/confirmation?t=${accessToken}`,
      cancelUrl: `${input.origin}/commande/${orderId}/paiement?abandon=1&t=${accessToken}`,
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

    /*
      Le paiement n'a pas pu être ouvert : on ANNULE la commande et on rend le
      stock, au lieu de la laisser en attente.

      Garder la commande serait tentant — « elle est reprenable » — mais c'est
      faux : sans ligne `Payment`, il n'existe ni référence chez le prestataire,
      ni page de règlement, ni rien à relire. Il n'y a rien à reprendre. La
      commande ne ferait que retenir du stock jusqu'à son expiration, et chaque
      nouvelle tentative du client en retiendrait un peu plus. Une clé de
      prestataire mal recopiée suffirait à rendre le catalogue indisponible.
    */
    try {
      const lines = await orderReservationLines(orderId)
      await prisma.$transaction(async (tx) => {
        await releaseReservation(tx, lines)
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', paymentStatus: 'FAILED', cancelledAt: new Date() },
        })
        await tx.orderEvent.create({
          data: {
            orderId,
            type: 'order.payment_unavailable',
            message:
              'Le paiement n’a pas pu être ouvert chez le prestataire : commande annulée et ' +
              'stock remis à disposition. ' +
              (error instanceof Error ? error.message : String(error)).slice(0, 400),
          },
        })
      })
    } catch (rollbackError) {
      // Le stock n'a pas pu être rendu : il le sera par le passage du cron, qui
      // libère les commandes restées en attente. On le dit fort, parce que
      // c'est du stock immobilisé en attendant.
      console.error('[commande] stock non libéré après échec du paiement', rollbackError)
    }

    return {
      ok: false,
      error:
        "Le paiement n'a pas pu être ouvert. Rien n'a été débité et votre panier est intact : " +
        'réessayez dans quelques instants.',
    }
  }
}

/**
 * Signale qu'un autre appel concurrent a déjà pris l'événement en charge.
 * Sert uniquement à annuler la transaction : ce n'est pas une erreur côté
 * appelant, c'est le fonctionnement normal d'un webhook rejoué.
 */
class AlreadyHandledError extends Error {
  constructor() {
    super('Paiement déjà traité par un autre appel.')
    this.name = 'AlreadyHandledError'
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
  /**
   * Ce que le prestataire a dit du montant, au-delà du nombre lui-même.
   * `amountKnown: false` signifie « il annonce un encaissement mais je n'ai
   * pas su lire combien » — à ne surtout pas confondre avec « rien à
   * contrôler ».
   */
  checks: { currency?: string | null; amountKnown?: boolean } = {},
): Promise<{ applied: boolean; orderId: string | null; reason?: string }> {
  const payment = await prisma.payment.findUnique({
    where: { providerRef },
    include: { order: true },
  })

  if (!payment) {
    /*
      Identifiant inconnu de la boutique.

      Le cas banal est sans conséquence : un appel de webhook forgé, ou un
      paiement appartenant à un autre profil. Mais si le prestataire annonce un
      encaissement, c'est de l'argent reçu qu'on ne sait rattacher à aucune
      commande — typiquement une réponse perdue à la création du paiement, qui
      nous a laissés sans référence alors que le paiement existait bien. Ce cas
      doit se voir dans les journaux, pas s'y fondre.
    */
    if (outcome === 'paid') {
      console.error(
        `[paiement] ENCAISSEMENT NON ATTRIBUABLE : ${providerRef} signalé payé, aucune commande ` +
          'ne porte cette référence. À rapprocher à la main dans le tableau de bord du prestataire.',
      )
    }
    return { applied: false, orderId: null, reason: 'paiement inconnu' }
  }

  // Court-circuit de confort : évite une transaction pour un rejeu évident.
  // Il ne suffit PAS à garantir l'unicité — c'est le verrou posé plus bas, dans
  // la transaction, qui s'en charge.
  if (payment.status !== 'PENDING') {
    /*
      Un cas mérite mieux qu'une ligne de journal : « payé » qui arrive sur un
      paiement que NOUS avons déjà déclaré expiré ou échoué.

      Cela veut dire que l'argent a été encaissé chez le prestataire alors que
      la commande est annulée et que son stock a été remis en vente. Ce n'est
      pas un rejeu bénin, c'est de l'argent reçu pour une commande qui n'existe
      plus — et personne ne le verrait si cela ne restait qu'un `console.info`.
      On l'écrit donc dans le dossier de la commande, où le SAV le lira.

      La prévention, elle, est ailleurs : `expireStaleOrders` interroge le
      prestataire avant de libérer quoi que ce soit, précisément pour que ce
      cas ne se produise pas. Ceci est le filet, pas la règle.
    */
    if (outcome === 'paid' && (payment.status === 'EXPIRED' || payment.status === 'FAILED')) {
      console.error(
        `[paiement] ENCAISSEMENT APRÈS LIBÉRATION : ${providerRef} payé alors que le paiement ` +
          `était ${payment.status} (commande ${payment.order.reference})`,
      )
      await prisma.orderEvent
        .create({
          data: {
            orderId: payment.orderId,
            type: 'payment.paid_after_release',
            message:
              `Le prestataire signale un paiement ENCAISSÉ alors que cette commande était déjà ` +
              `annulée (paiement ${payment.status.toLowerCase()}) et son stock remis en vente. ` +
              `À traiter à la main : rembourser, ou réapprovisionner et confirmer la commande.`,
            payload: { raw, amountCents } as Prisma.InputJsonValue,
          },
        })
        .catch((error) => console.error('[paiement] trace impossible', error))
    }

    return { applied: false, orderId: payment.orderId, reason: 'déjà traité' }
  }

  /*
    Un encaissement annoncé sans montant lisible.

    On refuse de l'appliquer. Confirmer une commande sans avoir pu vérifier le
    montant revient à accepter n'importe quelle somme — et le paiement reste en
    attente, donc rattrapable au prochain passage du cron, quand le prestataire
    répondra peut-être mieux.
  */
  if (outcome === 'paid' && checks.amountKnown === false) {
    await prisma.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'payment.amount_unreadable',
        message:
          'Le prestataire annonce un encaissement sans montant exploitable : rien n’a été ' +
          'confirmé. À vérifier dans son tableau de bord.',
        payload: { raw } as Prisma.InputJsonValue,
      },
    }).catch((error) => console.error('[paiement] trace impossible', error))
    return { applied: false, orderId: payment.orderId, reason: 'montant incohérent' }
  }

  /*
    Devise.

    Le montant seul ne suffit pas : 2080 yens ne valent pas 20,80 €. Le contrôle
    porte donc aussi sur la devise annoncée, quand le prestataire la donne.
  */
  if (
    outcome === 'paid' &&
    checks.currency &&
    checks.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    await prisma.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'payment.currency_mismatch',
        message: `Devise reçue ${checks.currency} ≠ devise attendue ${payment.currency}.`,
        payload: { raw } as Prisma.InputJsonValue,
      },
    }).catch((error) => console.error('[paiement] trace impossible', error))
    return { applied: false, orderId: payment.orderId, reason: 'montant incohérent' }
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

  /*
    Issue → statut du paiement.

    `canceled` (le client a renoncé chez le prestataire) retombe sur FAILED :
    l'énumération `PaymentStatus` ne distingue pas les deux, et l'effet est le
    même — rien d'encaissé, stock rendu. La nuance est conservée là où elle a
    du sens, dans le type de l'événement de commande, pour qu'un dossier
    n'affirme pas « paiement refusé » quand le client a simplement fermé
    l'onglet.
  */
  const nextStatus =
    outcome === 'paid' ? 'PAID' : outcome === 'expired' ? 'EXPIRED' : 'FAILED'

  try {
    await prisma.$transaction(async (tx) => {
      /**
       * Verrou atomique.
       *
       * La lecture faite plus haut ne protège rien : entre elle et cette
       * transaction, un second webhook rejoué — ou un double-clic sur le
       * paiement simulé — peut passer exactement le même test. Les deux
       * appelleraient alors `commitReservation`, et le stock serait décompté
       * deux fois, `stockReserved` passant sous zéro.
       *
       * Ce `updateMany` conditionnel ne peut réussir que pour un seul appelant :
       * PostgreSQL sérialise les deux écritures et le perdant voit `count: 0`.
       * La condition `status: 'PENDING'` écarte aussi un « payé » qui arriverait
       * après un échec — cas où le stock a déjà été rendu.
       */
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: nextStatus, rawPayload: (raw ?? {}) as Prisma.InputJsonValue },
      })
      if (claimed.count !== 1) throw new AlreadyHandledError()

      if (outcome === 'paid') {
        await commitReservation(tx, lines, payment.order.reference)
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
        // Le panier n'est vidé qu'ici : tant que le paiement n'a pas abouti, le
        // client doit pouvoir y revenir intact.
        //
        // On cible le panier d'origine par son jeton. Filtrer sur l'utilisateur
        // viderait TOUS les paniers anonymes dès la première commande invité,
        // puisque `userId` y est nul.
        if (payment.order.cartToken) {
          await tx.cart.deleteMany({ where: { token: payment.order.cartToken } })
        }
      } else {
        await releaseReservation(tx, lines)
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
            type:
              outcome === 'expired'
                ? 'payment.expired'
                : outcome === 'canceled'
                  ? 'payment.canceled'
                  : 'payment.failed',
            message:
              outcome === 'canceled'
                ? 'Paiement abandonné par le client. Stock remis à disposition.'
                : 'Stock remis à disposition.',
          },
        })
      }
    })
  } catch (error) {
    if (error instanceof AlreadyHandledError) {
      // Un autre appel a gagné la course : c'est le cas nominal d'un rejeu.
      return { applied: false, orderId: payment.orderId, reason: 'déjà traité' }
    }
    throw error
  }

  if (outcome === 'paid') {
    /*
      L'e-mail sort de la transaction : un prestataire e-mail indisponible ne
      doit pas annuler un paiement qui a bien eu lieu.

      Et son attente est BORNÉE. Cette fonction est appelée depuis le webhook,
      que Mollie coupe au bout de 15 secondes en comptant le dépassement comme
      un échec : un prestataire e-mail lent ferait rejouer tout le webhook. On
      attend donc au plus quelques secondes, puis on rend la main — l'envoi
      continue en arrière-plan, et le paiement, lui, est déjà enregistré.

      On attend quand même un peu, plutôt que de ne pas attendre du tout :
      l'envoi reste ainsi observable par le code appelant et par les tests, au
      lieu de dépendre de l'ordre des micro-tâches.
    */
    await withTimeout(
      sendEmail({
        template: 'commande.confirmation',
        to: payment.order.email,
        subject: `${identity.name} — commande ${payment.order.reference} confirmée`,
        variables: {
          reference: payment.order.reference,
          totalCents: payment.order.totalCents,
        },
      }).catch((error) => console.error('[commande] e-mail de confirmation', error)),
      EMAIL_WAIT_MS,
      '[commande] e-mail de confirmation : attente écourtée, envoi poursuivi en arrière-plan',
    )
  }

  return { applied: true, orderId: payment.orderId }
}

/**
 * Attente maximale d'un envoi d'e-mail dans le chemin du webhook.
 *
 * Mollie coupe un appel de webhook à 15 secondes et compte le dépassement
 * comme un échec, ce qui déclenche une relance. Trois secondes laissent le
 * temps d'un envoi normal sans jamais approcher cette limite.
 */
const EMAIL_WAIT_MS = 3_000

/**
 * Attend une promesse, mais pas indéfiniment.
 *
 * Au-delà du délai, on rend la main et on le dit : la promesse n'est pas
 * annulée, l'envoi se poursuit. Ce qui compte ici est de ne pas retenir la
 * réponse au prestataire.
 */
async function withTimeout(promise: Promise<unknown>, ms: number, message: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const guard = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  try {
    const issue = await Promise.race([promise.then(() => 'done' as const), guard])
    if (issue === 'timeout') console.warn(message)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Motifs de rattrapage.
 *
 * Ce sont des constantes, et pas des phrases, pour une raison précise : c'est
 * sur ces valeurs que `expireStaleOrders` décide de rendre du stock ou non. Une
 * comparaison de chaînes libres aurait fait dépendre cette décision d'une
 * reformulation — un mot retiré d'un message, et le stock d'une commande payée
 * repart à la vente sans que rien ne le signale. TypeScript refuse maintenant
 * un motif qui n'existe pas.
 */
export type ReconcileReason =
  /** Aucun paiement ouvert pour cette commande : il n'y a rien à interroger. */
  | 'aucun_paiement'
  /** Le prestataire n'a pas répondu, ou a répondu une erreur. On ne sait rien. */
  | 'relecture_impossible'
  /** Ce pilote ne sait pas relire (la simulation). On ne sait rien non plus. */
  | 'relecture_non_prise_en_charge'
  /** Paiement ouvert chez un autre prestataire que celui configuré aujourd'hui. */
  | 'prestataire_different'
  /** Le prestataire a répondu, mais l'issue n'est pas encore jouée. */
  | 'issue_inconnue'
  /** Une issue a été appliquée. */
  | 'applique'
  /** Le prestataire annonce un montant qui ne correspond pas à la commande. */
  | 'montant_incoherent'
  /** L'issue avait déjà été appliquée par un autre chemin. */
  | 'deja_traite'

/**
 * Rattrapage : relit l'état d'un paiement chez le prestataire et applique
 * l'issue si elle est connue.
 *
 * Pourquoi cette fonction existe, alors qu'il y a déjà un webhook :
 *
 *  1. **Mollie ne dit pas l'issue dans sa redirection.** Il renvoie le client
 *     sur une seule URL, quelle que soit l'issue, et sa documentation demande
 *     explicitement de ne pas en déduire le statut. Sans relecture, la page de
 *     retour d'un client qui vient de payer afficherait « en attente ».
 *  2. **Un webhook peut arriver après le client.** Le prestataire appelle le
 *     webhook et redirige le navigateur à peu près en même temps : l'ordre
 *     d'arrivée n'est pas garanti.
 *  3. **Un webhook peut ne jamais arriver.** Mollie abandonne au bout de dix
 *     tentatives sur vingt-six heures, et il est impossible de redéclencher un
 *     appel soi-même. En développement, c'est pire : Mollie refuse une URL de
 *     webhook sur localhost, donc il n'y a aucun webhook du tout.
 *
 * Elle ne décide rien par elle-même : elle demande au prestataire, puis passe
 * par `applyPaymentOutcome`, c'est-à-dire par le même verrou, la même
 * vérification de montant et la même idempotence que le webhook. Deux chemins
 * d'entrée, un seul endroit qui écrit.
 */
export async function reconcilePayment(
  orderId: string,
): Promise<{ applied: boolean; reason: ReconcileReason }> {
  const payment = await prisma.payment.findFirst({
    where: { orderId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })

  // Rien en attente : soit la commande est déjà réglée, soit elle n'a jamais
  // eu de paiement ouvert. Dans les deux cas il n'y a rien à rattraper.
  if (!payment) return { applied: false, reason: 'aucun_paiement' }

  let driver
  try {
    driver = resolvePaymentDriver()
  } catch (error) {
    console.error('[rattrapage] prestataire indisponible', error)
    return { applied: false, reason: 'relecture_impossible' }
  }

  // Le paiement a pu être ouvert par un autre prestataire que celui configuré
  // aujourd'hui (une clé changée entre-temps). L'interroger avec les mauvais
  // identifiants ne donnerait rien de fiable.
  if (payment.provider !== driver.name) {
    return { applied: false, reason: 'prestataire_different' }
  }

  if (!driver.fetchOutcome) {
    // Pilote sans relecture possible : la simulation, qui n'a personne à
    // interroger. Ce n'est pas une erreur.
    return { applied: false, reason: 'relecture_non_prise_en_charge' }
  }

  let event
  try {
    event = await driver.fetchOutcome(payment.providerRef)
  } catch (error) {
    // Prestataire injoignable ou délai dépassé : on ne conclut rien. Surtout
    // pas un échec — un silence n'est pas un refus.
    console.error('[rattrapage] relecture impossible', error)
    return { applied: false, reason: 'relecture_impossible' }
  }

  // Issue encore ouverte chez le prestataire : rien à appliquer. C'est le cas
  // d'un client qui a mis l'onglet de côté, et aussi celui d'un paiement
  // revenu à « open » après une tentative abandonnée — il doit pouvoir
  // réessayer.
  if (!event) return { applied: false, reason: 'issue_inconnue' }

  const result = await applyPaymentOutcome(
    event.providerRef,
    event.outcome,
    event.amountCents,
    event.raw,
    { currency: event.currency, amountKnown: event.amountKnown },
  )

  if (result.applied) return { applied: true, reason: 'applique' }

  // `applyPaymentOutcome` renvoie des phrases destinées aux journaux ; on les
  // retraduit en motifs typés, parce que c'est d'eux que dépend la décision de
  // rendre du stock. Un motif inconnu est traité comme « impossible de
  // savoir » : la prudence, pas la libération.
  if (result.reason === 'montant incohérent') return { applied: false, reason: 'montant_incoherent' }
  if (result.reason === 'déjà traité') return { applied: false, reason: 'deja_traite' }
  return { applied: false, reason: 'relecture_impossible' }
}

/**
 * Motifs qui autorisent à rendre le stock.
 *
 * Liste **blanche**, et c'est le point important : tout ce qui n'y figure pas
 * retient le stock. L'inverse — une liste noire de motifs bloquants — oblige à
 * penser à chaque nouveau cas, et celui qu'on oublie se paie en marchandise
 * vendue deux fois.
 *
 *  - `aucun_paiement` : aucune ligne de paiement n'a jamais été ouverte pour
 *    cette commande. Il n'existe nulle part de page de règlement : personne ne
 *    peut la payer, on peut rendre les articles.
 *  - `relecture_non_prise_en_charge` : pilote de simulation. Aucun argent réel
 *    n'est en jeu.
 *
 * Tout le reste — prestataire muet, montant incohérent, paiement ouvert chez
 * un autre prestataire, issue non jouée — signifie « on ne sait pas ». On ne
 * libère pas sur une incertitude.
 */
const MOTIFS_DE_LIBERATION: ReconcileReason[] = ['aucun_paiement', 'relecture_non_prise_en_charge']

/**
 * Délai au-delà duquel une commande impayée est libérée même sans réponse.
 *
 * Il existe parce que la règle ci-dessous refuse d'expirer un paiement dont on
 * ignore l'état : sans borne, un prestataire durablement injoignable garderait
 * du stock réservé indéfiniment. Quatorze jours couvrent le cas le plus lent
 * connu — un virement bancaire chez Mollie n'expire pas avant douze jours, plus
 * un ou deux si le douzième tombe un week-end.
 *
 * Cette borne décide de ce qu'on fait quand la réponse ne vient pas. Elle ne
 * dispense **jamais** de poser la question.
 */
const HARD_RELEASE_DAYS = 14

/**
 * Tranche le sort des commandes restées impayées.
 *
 * Le délai court (une heure par défaut) ne suffit PAS à décider seul, et c'est
 * tout l'enjeu de cette fonction depuis qu'un vrai prestataire est branché.
 *
 * Le scénario à éviter est précis : un paiement Mollie reste payable bien plus
 * longtemps qu'une heure — quinze minutes pour iDEAL, trente pour la carte,
 * quarante-huit heures pour Klarna, douze jours pour un virement. Libérer le
 * stock au bout d'une heure et voir le client payer ensuite, c'est encaisser
 * pour une commande annulée dont les articles ont été vendus à quelqu'un
 * d'autre. La documentation de Mollie est explicite : « It is not a good idea
 * to predict payment expiry. »
 *
 * On demande donc **toujours** au prestataire, y compris au-delà de la borne
 * des quatorze jours, puis :
 *
 *  - il donne une issue définitive → elle est appliquée par le chemin normal,
 *    avec son verrou, son contrôle de montant et son idempotence ;
 *  - le motif figure dans `MOTIFS_DE_LIBERATION` → le stock est rendu ;
 *  - sinon, avant la borne → **on ne touche à rien** ;
 *  - sinon, au-delà de la borne → on libère, et le dossier dit que c'est faute
 *    de réponse.
 *
 * C'est aussi le filet de rattrapage des webhooks perdus : Mollie cesse de
 * rappeler au bout de dix tentatives sur vingt-six heures et ne permet pas de
 * redéclencher un appel.
 *
 * Renvoie le nombre de commandes **tranchées** — confirmées, refusées ou
 * libérées. Ce n'est pas un nombre de libérations : une commande que le
 * prestataire déclare payée est comptée ici, et son stock a été décompté, pas
 * rendu.
 */
export async function expireStaleOrders(olderThanMinutes = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const hardCutoff = new Date(Date.now() - HARD_RELEASE_DAYS * 24 * 60 * 60_000)

  const stale = await prisma.order.findMany({
    where: { paymentStatus: 'PENDING', status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, reference: true, createdAt: true },
  })

  let resolved = 0

  for (const order of stale) {
    // Une commande qui échoue ne doit pas empêcher de traiter les suivantes :
    // sinon un seul conflit de transaction laisse toute la file réservée
    // jusqu'au passage suivant du cron, voire indéfiniment si l'erreur se
    // reproduit.
    try {
      const beyondHardLimit = order.createdAt < hardCutoff

      // On demande TOUJOURS, borne ou pas. La borne décide seulement de ce
      // qu'on fait d'une non-réponse.
      const check = await reconcilePayment(order.id).catch((error) => {
        console.error(`[expiration] ${order.reference} : relecture impossible`, error)
        return { applied: false, reason: 'relecture_impossible' as const }
      })

      // Issue appliquée : `applyPaymentOutcome` a déjà posé le statut définitif
      // et décompté ou rendu le stock. Rien à faire de plus.
      if (check.applied) {
        resolved += 1
        continue
      }

      const peutLiberer = MOTIFS_DE_LIBERATION.includes(check.reason)

      if (!peutLiberer && !beyondHardLimit) {
        // On ne sait pas, et il est trop tôt pour trancher sans savoir.
        continue
      }

      const motif = peutLiberer
        ? `Sans paiement après ${olderThanMinutes} minutes : stock remis à disposition.`
        : `Sans paiement après ${HARD_RELEASE_DAYS} jours, et sans réponse exploitable du ` +
          `prestataire (${check.reason}) : stock remis à disposition.`

      const lines = await orderReservationLines(order.id)

      try {
        await prisma.$transaction(async (tx) => {
          // Verrou : on ne libère que si la commande est TOUJOURS en attente.
          // Entre la lecture plus haut et maintenant, un webhook a pu la
          // confirmer.
          const claimed = await tx.order.updateMany({
            where: { id: order.id, paymentStatus: 'PENDING', status: 'PENDING' },
            data: { paymentStatus: 'EXPIRED', status: 'CANCELLED', cancelledAt: new Date() },
          })
          if (claimed.count !== 1) throw new AlreadyHandledError()

          await releaseReservation(tx, lines)
          await tx.payment.updateMany({
            where: { orderId: order.id, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          })
          await tx.orderEvent.create({
            data: { orderId: order.id, type: 'order.expired', message: motif },
          })
        })
        resolved += 1
      } catch (error) {
        if (error instanceof AlreadyHandledError) {
          // Confirmée entre-temps : exactement ce que le verrou doit empêcher.
          console.info(`[expiration] ${order.reference} confirmée entre-temps, laissée telle quelle`)
          continue
        }
        throw error
      }
    } catch (error) {
      console.error(`[expiration] ${order.reference} non traitée`, error)
    }
  }

  return resolved
}
