import 'server-only'
import { StripeDriver } from './stripe'
import { SimulationDriver } from './simulation'
import type { PaymentDriver } from './types'

export type {
  CreatePaymentInput,
  PaymentDriver,
  PaymentDriverName,
  PaymentEvent,
  PaymentOutcome,
  PaymentSession,
} from './types'

/**
 * Choix du prestataire.
 *
 * Règle de sécurité : la simulation n'est jamais choisie silencieusement en
 * production. Si `NODE_ENV === 'production'` et qu'aucune clé n'est configurée,
 * on lève — mieux vaut un tunnel de commande en erreur qu'une boutique qui
 * encaisse dans le vide et envoie des confirmations pour des paiements qui
 * n'ont jamais eu lieu.
 */
export function resolvePaymentDriver(): PaymentDriver {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()

  if (secretKey) {
    return new StripeDriver(secretKey, process.env.STRIPE_WEBHOOK_SECRET?.trim() || null)
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "Aucun prestataire de paiement n'est configuré (STRIPE_SECRET_KEY absent). " +
        'Le paiement simulé est refusé en production.',
    )
  }

  return new SimulationDriver()
}

/** Vrai quand le paiement est mimé : l'interface doit le dire au client. */
export function paymentIsSimulated(): boolean {
  return !process.env.STRIPE_SECRET_KEY?.trim() && process.env.NODE_ENV !== 'production'
}
