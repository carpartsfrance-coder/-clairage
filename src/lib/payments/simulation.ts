import 'server-only'
import { randomBytes } from 'node:crypto'
import type {
  CreatePaymentInput,
  PaymentDriver,
  PaymentEvent,
  PaymentSession,
} from './types'

/**
 * Pilote de simulation, utilisé tant qu'aucune clé Stripe n'est configurée.
 *
 * Il n'imite PAS le reste de la chaîne : la commande, la réservation de stock,
 * les mouvements de stock, les e-mails et les statuts passent exactement par le
 * même code que pour un paiement réel. Seul l'encaissement est mimé, et il est
 * marqué comme tel (`simulated: true`) dans la table `Payment`, visible au
 * back-office.
 *
 * Il existe pour une raison précise : permettre de vérifier le tunnel de
 * commande de bout en bout — y compris le refus et l'abandon — avant d'avoir
 * ouvert un compte chez un prestataire. Il doit rester impossible de l'activer
 * par accident en production : voir `resolvePaymentDriver`.
 */
export class SimulationDriver implements PaymentDriver {
  readonly name = 'simulation' as const
  readonly isTestMode = true
  readonly simulated = true

  async createSession(input: CreatePaymentInput): Promise<PaymentSession> {
    const providerRef = `sim_${randomBytes(12).toString('hex')}`
    return {
      provider: this.name,
      providerRef,
      // Page interne qui propose les trois issues : accepté, refusé, abandonné.
      redirectUrl: `/commande/${input.orderId}/paiement?ref=${providerRef}&t=${input.accessToken}`,
      isTestMode: true,
      simulated: true,
    }
  }

  async parseWebhook(): Promise<PaymentEvent | null> {
    // Aucun prestataire n'appelle : les issues sont déclenchées depuis la page
    // de simulation, qui passe par la même fonction d'application que le
    // webhook réel.
    return null
  }
}
