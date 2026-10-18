import 'server-only'
import { prisma } from './db'
import { identity, siteConfig } from './identity'
import { emailIsSimulated } from './email'
import { paymentIsSimulated } from './payments'
import { storageStatus } from './storage'

/**
 * État de l'installation.
 *
 * Un seul endroit décide si la boutique peut ouvrir, et ce même endroit sert
 * au back-office (écran Paramètres) et à la supervision (/api/health). Deux
 * listes séparées finiraient par ne plus dire la même chose, et c'est celle
 * qui rassure qu'on lirait.
 *
 * La règle tient en une phrase : une fonction simulée, absente ou non
 * vérifiée est annoncée comme telle. Aucune valeur par défaut ne vaut
 * confirmation.
 */

export type CheckState =
  /** Opérationnel et vérifié. */
  | 'ok'
  /** Fonctionne, mais pas dans une configuration d'ouverture commerciale. */
  | 'warn'
  /** Empêche l'ouverture : la fonction est simulée, absente ou non configurée. */
  | 'blocking'

export type ReadinessCheck = {
  key: string
  label: string
  state: CheckState
  /** Ce qui est constaté, au présent. */
  detail: string
  /** Ce qu'il faut faire quand ce n'est pas « ok ». */
  action?: string
}

export type Readiness = {
  checks: ReadinessCheck[]
  /** Vrai seulement si aucun point bloquant ne subsiste. */
  mayOpen: boolean
  blocking: number
  warnings: number
}

/* -------------------------------------------------------------------------- */

function checkSiteUrl(): ReadinessCheck {
  const url = siteConfig.url
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)
  const isHttps = url.startsWith('https://')

  if (isLocal) {
    return {
      key: 'site-url',
      label: 'Adresse publique',
      state: process.env.NODE_ENV === 'production' ? 'blocking' : 'warn',
      detail: `NEXT_PUBLIC_SITE_URL vaut « ${url} ».`,
      action:
        'Renseigner le domaine définitif : cette valeur sert aux URL canoniques, au plan de site ' +
        'et aux liens des e-mails. Un lien de réinitialisation pointant sur localhost est inutilisable.',
    }
  }
  if (!isHttps) {
    return {
      key: 'site-url',
      label: 'Adresse publique',
      state: 'blocking',
      detail: `L'adresse publique n'est pas en HTTPS (« ${url} »).`,
      action: 'Les cookies de session sont posés en Secure : sans HTTPS, la connexion ne tient pas.',
    }
  }
  return {
    key: 'site-url',
    label: 'Adresse publique',
    state: 'ok',
    detail: url,
  }
}

function checkPayment(): ReadinessCheck {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  const webhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ''

  if (!key) {
    return {
      key: 'payment',
      label: 'Paiement',
      state: 'blocking',
      detail: paymentIsSimulated()
        ? 'Aucune clé Stripe : le paiement est SIMULÉ. Aucun encaissement n’a lieu.'
        : 'Aucune clé Stripe configurée.',
      action:
        'Renseigner STRIPE_SECRET_KEY. En production, l’ouverture du paiement échoue sans clé : ' +
        'la simulation y est refusée, pour qu’aucune commande ne soit confirmée sans encaissement.',
    }
  }

  const live = key.startsWith('sk_live_')

  if (!webhook) {
    return {
      key: 'payment',
      label: 'Paiement',
      state: 'blocking',
      detail: `Clé Stripe ${live ? 'de production' : 'de test'} présente, mais aucun secret de webhook.`,
      action:
        'Déclarer le point de terminaison /api/paiement/webhook dans Stripe et reporter son secret ' +
        'de signature. Sans lui la route refuse tous les appels : un paiement réussi ne serait ' +
        'jamais confirmé côté boutique.',
    }
  }

  if (!live) {
    return {
      key: 'payment',
      label: 'Paiement',
      state: 'warn',
      detail: 'Stripe en mode TEST (clé sk_test_…). Les cartes réelles sont refusées.',
      action: 'Remplacer par la clé de production le jour de l’ouverture, et refaire un essai de bout en bout.',
    }
  }

  return {
    key: 'payment',
    label: 'Paiement',
    state: 'ok',
    detail: 'Stripe en mode production, webhook signé.',
  }
}

function checkEmail(): ReadinessCheck {
  const driver = (process.env.EMAIL_DRIVER ?? 'log').toLowerCase()

  if (emailIsSimulated()) {
    return {
      key: 'email',
      label: 'E-mails transactionnels',
      state: 'blocking',
      detail:
        driver === 'log'
          ? 'Pilote « log » : aucun envoi réel. Chaque message est journalisé et marqué « simulé ».'
          : `Pilote « ${driver} » sélectionné mais incomplet (EMAIL_API_KEY ou EMAIL_FROM manquant) : aucun envoi ne peut aboutir.`,
      action:
        'Configurer un prestataire et authentifier le domaine (SPF, DKIM, DMARC) avant l’ouverture. ' +
        'Sans cela, un client ne reçoit ni confirmation de commande ni lien de réinitialisation.',
    }
  }

  return {
    key: 'email',
    label: 'E-mails transactionnels',
    state: 'ok',
    detail: `Pilote « ${driver} », expéditeur ${process.env.EMAIL_FROM}.`,
  }
}

function checkStorage(): ReadinessCheck {
  const status = storageStatus()

  if (!status.ok) {
    return {
      key: 'storage',
      label: 'Stockage des médias',
      state: 'blocking',
      detail: status.problem ?? 'Configuration incomplète.',
      action: 'Voir docs/render.md : un stockage objet S3-compatible est requis.',
    }
  }
  if (status.driver === 'local') {
    return {
      key: 'storage',
      label: 'Stockage des médias',
      state: 'warn',
      detail: 'Pilote « local » (public/uploads) — convient au développement seulement.',
      action:
        'Passer à MEDIA_DRIVER=s3. Le disque d’une instance Render est éphémère : les fichiers ' +
        'téléversés disparaîtraient au déploiement suivant, sans erreur.',
    }
  }
  return {
    key: 'storage',
    label: 'Stockage des médias',
    state: 'ok',
    detail: `Stockage objet S3, bucket « ${process.env.MEDIA_BUCKET} ».`,
  }
}

function checkLegalIdentity(): ReadinessCheck {
  const missing = (
    [
      ['companyName', 'dénomination'],
      ['legalForm', 'forme juridique'],
      ['siret', 'SIRET'],
      ['address', 'adresse'],
      ['publicationDirector', 'responsable de publication'],
    ] as const
  ).filter(([field]) => !identity.legal[field]).map(([, label]) => label)

  const contactMissing = !identity.contact.email && !identity.contact.phone

  if (missing.length > 0 || contactMissing) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`mentions légales incomplètes (${missing.join(', ')})`)
    if (contactMissing) parts.push('aucun moyen de contact publié')
    return {
      key: 'legal',
      label: 'Identité légale',
      state: 'blocking',
      detail: `${parts.join(' ; ')}.`,
      action:
        'Compléter src/lib/identity.ts. Ces mentions sont obligatoires pour une vente en ligne en ' +
        'France ; elles ne sont pas inventées par défaut, donc elles manquent tant qu’on ne les a pas saisies.',
    }
  }

  return {
    key: 'legal',
    label: 'Identité légale',
    state: 'ok',
    detail: `${identity.legal.companyName}, SIRET ${identity.legal.siret}.`,
  }
}

/** Données de démonstration encore en base, et bandeau qui les signale. */
async function checkDemoData(): Promise<ReadinessCheck> {
  const [products, media] = await Promise.all([
    prisma.product.count({ where: { isDemo: true } }),
    prisma.media.count({ where: { isDemo: true } }),
  ])
  const demoCount = products + media

  if (demoCount > 0) {
    return {
      key: 'demo-data',
      label: 'Données de démonstration',
      state: 'blocking',
      detail: `${products} produit(s) et ${media} média(s) de démonstration en base.`,
      action:
        siteConfig.demoBanner
          ? 'Retirer les données (npm run seed -- --purge-demo), puis passer NEXT_PUBLIC_DEMO_MODE à « off ».'
          : 'ATTENTION : le bandeau de préproduction est désactivé alors que des données de démonstration ' +
            'sont en ligne. Un visiteur les prend pour de vraies offres.',
    }
  }

  if (siteConfig.demoBanner) {
    return {
      key: 'demo-data',
      label: 'Données de démonstration',
      state: 'warn',
      detail: 'Aucune donnée de démonstration, mais le site reste en préproduction (bandeau + noindex).',
      action: 'Passer NEXT_PUBLIC_DEMO_MODE à « off » pour ouvrir le site à l’indexation.',
    }
  }

  return {
    key: 'demo-data',
    label: 'Données de démonstration',
    state: 'ok',
    detail: 'Aucune. Le site est en mode ouvert.',
  }
}

/**
 * Au moins une méthode de livraison active : sans elle, le tunnel n'a rien à
 * proposer à l'étape du transport et la commande ne peut pas aboutir.
 */
async function checkShipping(): Promise<ReadinessCheck> {
  const active = await prisma.shippingMethod.count({ where: { active: true } })

  if (active === 0) {
    return {
      key: 'shipping',
      label: 'Livraison',
      state: 'blocking',
      detail: 'Aucune méthode de livraison active.',
      action: 'Le tunnel de commande ne peut pas aboutir : activer au moins une méthode.',
    }
  }
  return {
    key: 'shipping',
    label: 'Livraison',
    state: 'ok',
    detail: `${active} méthode(s) active(s).`,
  }
}

/* -------------------------------------------------------------------------- */

export async function assessReadiness(): Promise<Readiness> {
  const checks: ReadinessCheck[] = [
    checkSiteUrl(),
    checkPayment(),
    checkEmail(),
    checkStorage(),
    checkLegalIdentity(),
    await checkShipping(),
    await checkDemoData(),
  ]

  const blocking = checks.filter((check) => check.state === 'blocking').length
  const warnings = checks.filter((check) => check.state === 'warn').length

  return { checks, mayOpen: blocking === 0, blocking, warnings }
}

/**
 * Version synchrone, sans accès à la base : utilisée par /api/health, qui doit
 * répondre même quand PostgreSQL est injoignable.
 */
export function assessEnvironment(): Readiness {
  const checks = [
    checkSiteUrl(),
    checkPayment(),
    checkEmail(),
    checkStorage(),
  ]
  const blocking = checks.filter((check) => check.state === 'blocking').length
  const warnings = checks.filter((check) => check.state === 'warn').length
  return { checks, mayOpen: blocking === 0, blocking, warnings }
}
