/**
 * Choix du prestataire de paiement, isolé du reste.
 *
 * Ce fichier ne dépend ni de Prisma, ni de `server-only`, ni d'un SDK : il lit
 * des variables et rend un verdict. C'est ce qui permet à l'écran « État de
 * l'installation » et au tunnel de commande de se fonder exactement sur la même
 * décision, et de le tester sans réseau.
 *
 * Trois principes :
 *
 *  1. **Le mode test se déduit de la clé**, jamais d'une variable séparée qu'on
 *     pourrait oublier de basculer. Une clé Mollie commence par `test_` ou
 *     `live_`, une clé Stripe par `sk_test_` ou `sk_live_` : la vérité est dans
 *     la clé.
 *  2. **Un préfixe inconnu est refusé**, pas interprété. Ne pas savoir si une
 *     clé encaisse réellement est précisément le cas où il ne faut pas deviner.
 *  3. **Deux prestataires configurés sans arbitrage est une erreur**, pas une
 *     occasion de choisir à la place de l'exploitant. Choisir en silence, c'est
 *     risquer d'encaisser chez l'un pendant qu'on surveille l'autre.
 */

export type PaymentProviderChoice =
  | { kind: 'mollie'; apiKey: string; isTestMode: boolean }
  | { kind: 'stripe'; secretKey: string; webhookSecret: string | null; isTestMode: boolean }
  | { kind: 'simulation' }
  /** Configuration inutilisable : la raison est destinée à être affichée. */
  | { kind: 'unusable'; problem: string }

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? ''
}

/**
 * Nom demandé explicitement, quand les deux prestataires sont configurés.
 * Accepte `mollie` et `stripe`, dans n'importe quelle casse.
 */
function requestedProvider(): 'mollie' | 'stripe' | null {
  const raw = trimmed('PAYMENT_PROVIDER').toLowerCase()
  if (raw === 'mollie' || raw === 'stripe') return raw
  return null
}

export function resolveProviderChoice(): PaymentProviderChoice {
  const mollieKey = trimmed('MOLLIE_API_KEY')
  const stripeKey = trimmed('STRIPE_SECRET_KEY')
  const requested = requestedProvider()

  // --- Les deux clés sont présentes --------------------------------------
  if (mollieKey && stripeKey) {
    if (!requested) {
      return {
        kind: 'unusable',
        problem:
          'MOLLIE_API_KEY et STRIPE_SECRET_KEY sont tous deux renseignés : impossible de savoir ' +
          'lequel doit encaisser. Précisez PAYMENT_PROVIDER (« mollie » ou « stripe »), ou ' +
          'retirez la clé du prestataire que vous n’utilisez pas.',
      }
    }
    return requested === 'mollie' ? mollieChoice(mollieKey) : stripeChoice(stripeKey)
  }

  // --- Une seule clé ------------------------------------------------------
  if (mollieKey) {
    // Un PAYMENT_PROVIDER qui désigne l'autre prestataire est une
    // contradiction : on la signale plutôt que de l'ignorer.
    if (requested === 'stripe') {
      return {
        kind: 'unusable',
        problem:
          'PAYMENT_PROVIDER vaut « stripe » mais STRIPE_SECRET_KEY est absent. ' +
          'Renseignez la clé, ou passez PAYMENT_PROVIDER à « mollie ».',
      }
    }
    return mollieChoice(mollieKey)
  }

  if (stripeKey) {
    if (requested === 'mollie') {
      return {
        kind: 'unusable',
        problem:
          'PAYMENT_PROVIDER vaut « mollie » mais MOLLIE_API_KEY est absent. ' +
          'Renseignez la clé, ou passez PAYMENT_PROVIDER à « stripe ».',
      }
    }
    return stripeChoice(stripeKey)
  }

  // --- Aucune clé ---------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return {
      kind: 'unusable',
      problem:
        'Aucun prestataire de paiement n’est configuré (ni MOLLIE_API_KEY ni ' +
        'STRIPE_SECRET_KEY). Le paiement simulé est refusé en production : une boutique ' +
        'qui confirme des commandes sans encaisser est pire qu’une boutique en panne.',
    }
  }

  return { kind: 'simulation' }
}

function mollieChoice(apiKey: string): PaymentProviderChoice {
  if (apiKey.startsWith('test_')) return { kind: 'mollie', apiKey, isTestMode: true }
  if (apiKey.startsWith('live_')) return { kind: 'mollie', apiKey, isTestMode: false }
  return {
    kind: 'unusable',
    problem:
      'MOLLIE_API_KEY ne commence ni par « test_ » ni par « live_ » : impossible de savoir si ' +
      'cette clé encaisse réellement. Recopiez la clé depuis Mollie › Développeurs › Clés d’API.',
  }
}

function stripeChoice(secretKey: string): PaymentProviderChoice {
  if (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')) {
    return { kind: 'stripe', secretKey, webhookSecret: webhookSecretOrNull(), isTestMode: true }
  }
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
    return { kind: 'stripe', secretKey, webhookSecret: webhookSecretOrNull(), isTestMode: false }
  }
  return {
    kind: 'unusable',
    problem:
      'STRIPE_SECRET_KEY ne ressemble ni à une clé de test (« sk_test_… ») ni à une clé de ' +
      'production (« sk_live_… ») : impossible de savoir si elle encaisse réellement.',
  }
}

function webhookSecretOrNull(): string | null {
  return trimmed('STRIPE_WEBHOOK_SECRET') || null
}
