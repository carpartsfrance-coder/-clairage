import 'server-only'
import { MollieDriver } from './mollie'
import { StripeDriver } from './stripe'
import { SimulationDriver } from './simulation'
import { resolveProviderChoice } from './config'
import type { PaymentDriver } from './types'

export type {
  CreatePaymentInput,
  PaymentDriver,
  PaymentDriverName,
  PaymentEvent,
  PaymentOutcome,
  PaymentSession,
} from './types'
export { WebhookRefusedError } from './errors'
export { resolveProviderChoice } from './config'
export type { PaymentProviderChoice } from './config'

/**
 * Choix du prestataire.
 *
 * La décision elle-même vit dans `config.ts`, qui ne lit que des variables et
 * se teste sans réseau. Cette fonction ne fait que l'instancier — de sorte que
 * l'écran « État de l'installation » et le tunnel de commande se fondent
 * exactement sur le même verdict, et qu'aucun des deux ne puisse dériver.
 *
 * Règle de sécurité inchangée : la simulation n'est jamais choisie
 * silencieusement en production. Mieux vaut un tunnel de commande en erreur
 * qu'une boutique qui confirme des commandes sans encaisser.
 */
export function resolvePaymentDriver(): PaymentDriver {
  const choice = resolveProviderChoice()

  switch (choice.kind) {
    case 'mollie':
      return new MollieDriver(choice.apiKey)
    case 'stripe':
      return new StripeDriver(choice.secretKey, choice.webhookSecret)
    case 'simulation':
      return new SimulationDriver()
    case 'unusable':
      throw new Error(choice.problem)
  }
}

/**
 * Vrai quand le paiement est mimé : l'interface doit le dire au client.
 *
 * Attention à ne pas confondre avec le mode test d'un vrai prestataire. Une
 * clé `test_` de Mollie n'est PAS une simulation : Mollie répond réellement,
 * appelle réellement le webhook, et le tunnel se comporte comme en production
 * — seul l'argent ne bouge pas. Un paiement simulé, lui, n'a aucun
 * interlocuteur, et c'est une page interne qui en décide l'issue.
 */
export function paymentIsSimulated(): boolean {
  return resolveProviderChoice().kind === 'simulation'
}
