/**
 * Contrat commun aux prestataires de paiement.
 *
 * Le reste de l'application ne connaît que ces types : passer de Stripe à
 * Mollie ne doit toucher ni la commande, ni le stock, ni les e-mails.
 */

export type PaymentDriverName = 'stripe' | 'simulation'

export type PaymentSession = {
  provider: PaymentDriverName
  /** Identifiant chez le prestataire. Sert de clé d'idempotence aux webhooks. */
  providerRef: string
  /** Où envoyer le client pour payer. */
  redirectUrl: string
  /** Vrai tant que le prestataire est en mode test. */
  isTestMode: boolean
  /**
   * Vrai quand aucun prestataire réel n'est joignable et que le paiement est
   * mimé localement. Cette valeur est stockée et affichée : une simulation ne
   * doit jamais pouvoir passer pour un encaissement.
   */
  simulated: boolean
}

export type PaymentOutcome = 'paid' | 'failed' | 'expired'

/** Événement normalisé, quel que soit le prestataire. */
export type PaymentEvent = {
  providerRef: string
  outcome: PaymentOutcome
  amountCents: number | null
  /** Charge utile brute, conservée pour pouvoir rejouer un diagnostic. */
  raw: unknown
}

export type CreatePaymentInput = {
  orderId: string
  orderReference: string
  email: string
  amountCents: number
  currency: string
  lines: Array<{ label: string; unitPriceCents: number; quantity: number }>
  shippingCents: number
  /** URL de retour après paiement réussi ou abandonné. */
  successUrl: string
  cancelUrl: string
  /**
   * Empêche la création de deux paiements pour la même commande quand le
   * client clique deux fois ou recharge la page.
   */
  idempotencyKey: string
}

export interface PaymentDriver {
  readonly name: PaymentDriverName
  readonly isTestMode: boolean
  readonly simulated: boolean
  createSession(input: CreatePaymentInput): Promise<PaymentSession>
  /**
   * Vérifie la signature et normalise l'événement.
   * Renvoie `null` quand l'événement ne concerne pas le paiement d'une commande.
   * Lève quand la signature est invalide — un webhook non signé n'est pas une
   * information, c'est une tentative.
   */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>
}
