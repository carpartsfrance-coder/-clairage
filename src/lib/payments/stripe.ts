import 'server-only'
import Stripe from 'stripe'
import { WebhookRefusedError } from './errors'
import type {
  CreatePaymentInput,
  PaymentDriver,
  PaymentEvent,
  PaymentSession,
} from './types'

/**
 * Pilote Stripe, en Checkout Session hébergée.
 *
 * Checkout plutôt qu'Elements : la page de paiement est servie par Stripe, donc
 * aucune donnée de carte ne transite par notre serveur ni par notre code. C'est
 * la voie la plus sûre, et celle qui demande le moins de conformité à porter.
 *
 * Le mode test se déduit de la clé (`sk_test_…`), jamais d'une variable séparée
 * qu'on pourrait oublier de changer : la vérité est dans la clé elle-même.
 */
export class StripeDriver implements PaymentDriver {
  readonly name = 'stripe' as const
  readonly simulated = false
  private readonly client: Stripe

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | null,
  ) {
    this.client = new Stripe(secretKey)
  }

  get isTestMode(): boolean {
    return this.secretKey.startsWith('sk_test_')
  }

  async createSession(input: CreatePaymentInput): Promise<PaymentSession> {
    const session = await this.client.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: input.email,
        client_reference_id: input.orderReference,
        line_items: [
          ...input.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: line.unitPriceCents,
              product_data: { name: line.label },
            },
          })),
          ...(input.shippingCents > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: input.currency.toLowerCase(),
                    unit_amount: input.shippingCents,
                    product_data: { name: 'Livraison' },
                  },
                },
              ]
            : []),
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { orderId: input.orderId, orderReference: input.orderReference },
      },
      // Stripe renvoie la session déjà créée si la clé est rejouée : un double
      // clic ne crée pas deux paiements.
      { idempotencyKey: input.idempotencyKey },
    )

    if (!session.url) {
      throw new Error("Stripe n'a pas renvoyé d'URL de paiement.")
    }

    return {
      provider: this.name,
      providerRef: session.id,
      redirectUrl: session.url,
      isTestMode: this.isTestMode,
      simulated: false,
    }
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null> {
    const signature = headers.get('stripe-signature')

    if (!this.webhookSecret) {
      // Sans secret, on ne peut pas distinguer Stripe d'un inconnu : on refuse.
      throw new WebhookRefusedError('STRIPE_WEBHOOK_SECRET absent : webhook refusé.')
    }
    if (!signature) throw new WebhookRefusedError('Signature absente.')

    // constructEvent lève si la signature ou l'horodatage ne correspondent pas.
    // L'erreur est retypée en refus : elle doit valoir 400 et aucune relance,
    // contrairement à une panne de notre côté.
    let event
    try {
      event = await this.client.webhooks.constructEventAsync(
        rawBody,
        signature,
        this.webhookSecret,
      )
    } catch (error) {
      throw new WebhookRefusedError(
        error instanceof Error ? error.message : 'Signature invalide.',
      )
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        // `completed` ne vaut pas encaissé : un virement ou un prélèvement
        // peuvent rester en attente. Seul `paid` autorise l'expédition.
        if (session.payment_status !== 'paid') return null
        return {
          providerRef: session.id,
          outcome: 'paid',
          amountCents: session.amount_total ?? null,
          raw: event,
        }
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object
        return {
          providerRef: session.id,
          outcome: 'paid',
          amountCents: session.amount_total ?? null,
          raw: event,
        }
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object
        return { providerRef: session.id, outcome: 'failed', amountCents: null, raw: event }
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        return { providerRef: session.id, outcome: 'expired', amountCents: null, raw: event }
      }
      default:
        return null
    }
  }

  /**
   * Relit l'état d'une session de paiement.
   *
   * Elle existe pour la même raison que chez Mollie : le rattrapage des
   * webhooks perdus, et la décision de rendre ou non le stock d'une commande
   * restée en attente. Sans elle, Stripe tombait dans la catégorie « pilote
   * qu'on ne sait pas interroger », et ses commandes étaient libérées au bout
   * d'une heure sans que personne ait vérifié qu'elles n'avaient pas été
   * payées entre-temps.
   *
   * Comme chez Mollie, seul un état définitif donne une issue : une session
   * `open` est encore payable, et une session dont le paiement est `unpaid`
   * peut encore aboutir.
   *
   * ⚠ Ce chemin n'a pas été exercé contre Stripe : aucune clé n'est configurée
   * sur ce projet. Sa logique est couverte par les tests, son comportement
   * réseau ne l'est pas.
   */
  async fetchOutcome(providerRef: string): Promise<PaymentEvent | null> {
    const session = await this.client.checkout.sessions.retrieve(providerRef)

    if (session.status === 'expired') {
      return {
        providerRef: session.id,
        outcome: 'expired',
        amountCents: null,
        currency: session.currency ?? null,
        amountKnown: true,
        raw: session,
      }
    }

    // `complete` ne vaut pas encaissé : un virement ou un prélèvement peuvent
    // rester en attente. Seul `paid` autorise l'expédition.
    if (session.status === 'complete' && session.payment_status === 'paid') {
      return {
        providerRef: session.id,
        outcome: 'paid',
        amountCents: session.amount_total ?? null,
        currency: session.currency ?? null,
        amountKnown: session.amount_total !== null && session.amount_total !== undefined,
        raw: session,
      }
    }

    // `open`, ou `complete` avec un paiement encore impayé : rien n'est joué.
    return null
  }
}
