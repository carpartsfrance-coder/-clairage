import 'server-only'
import Stripe from 'stripe'
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

  async parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null> {
    if (!this.webhookSecret) {
      // Sans secret, on ne peut pas distinguer Stripe d'un inconnu : on refuse.
      throw new Error('STRIPE_WEBHOOK_SECRET absent : webhook refusé.')
    }
    if (!signature) throw new Error('Signature absente.')

    // constructEvent lève si la signature ou l'horodatage ne correspondent pas.
    const event = await this.client.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.webhookSecret,
    )

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
}
