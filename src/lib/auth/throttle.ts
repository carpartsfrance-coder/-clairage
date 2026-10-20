import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '../db'

/**
 * Limitation des tentatives.
 *
 * Deux clés par action, et c'est volontaire :
 *   - par **adresse IP**, pour freiner quelqu'un qui balaie beaucoup de comptes ;
 *   - par **identifiant visé** (e-mail, référence de commande), pour freiner
 *     quelqu'un qui change d'IP mais s'acharne sur une seule cible.
 *
 * L'une sans l'autre se contourne : la première en passant par un relais, la
 * seconde en changeant de cible à chaque essai.
 *
 * Le compteur vit en base parce que Render peut servir plusieurs instances :
 * un compteur en mémoire se contournerait en retombant sur une autre.
 */

export type ThrottleRule = {
  /** Nombre d'essais tolérés dans la fenêtre. */
  max: number
  /** Durée de la fenêtre, en secondes. */
  windowSeconds: number
  /** Durée du blocage une fois le plafond atteint, en secondes. */
  blockSeconds: number
}

export const RULES = {
  login: { max: 10, windowSeconds: 15 * 60, blockSeconds: 15 * 60 },
  register: { max: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 },
  orderLookup: { max: 10, windowSeconds: 15 * 60, blockSeconds: 30 * 60 },
  /*
    Demande de vérification de compatibilité.

    Elle ouvre une demande SAV sans compte ni commande : c'est le seul endroit
    du site où un visiteur anonyme écrit en base. Le plafond est bas — une
    poignée de demandes par heure suffit à un client réel, et la boîte SAV
    n'est pas une file d'attente publique.
  */
  fitmentCheck: { max: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 },
  /*
    Prise de contact depuis /contact.

    Même porte que la vérification de compatibilité — un visiteur anonyme qui
    écrit en base — donc le même plafond. Le compteur reste distinct : les deux
    formulaires sont sur des pages différentes, et quelqu'un qui fait vérifier
    une référence puis écrit au SAV n'a rien fait d'anormal.
  */
  contactRequest: { max: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 },
  /*
    Alerte de retour en stock.

    Plus permissif que les deux précédents : poser une alerte n'écrit à
    personne et ne crée aucune demande à traiter. Le risque n'est pas la
    charge, c'est l'inscription d'une adresse qu'on ne possède pas — et là,
    c'est la limite par adresse visée qui compte, pas celle par IP.
  */
  stockAlert: { max: 20, windowSeconds: 60 * 60, blockSeconds: 30 * 60 },
  /*
    Webhook de paiement.

    L'URL est publique et devinable, et le webhook de Mollie n'est pas signé :
    n'importe qui peut POSTer `id=tr_…` et nous faire interroger l'API du
    prestataire. Il n'en obtient rien — la réponse ne dit pas si le paiement
    existe — mais répété, cela consomme notre quota chez le prestataire et nos
    instances.

    Le plafond est large à dessein : un vrai prestataire rappelle jusqu'à dix
    fois par paiement, et une boutique active en reçoit beaucoup. Il s'agit
    d'arrêter un balayage, pas de gêner un trafic normal. Le blocage est court
    pour la même raison : une limitation trop zélée ferait perdre de vrais
    webhooks, et Mollie abandonne au bout de 26 heures.
  */
  paymentWebhook: { max: 240, windowSeconds: 60, blockSeconds: 60 },
} as const satisfies Record<string, ThrottleRule>

export type ThrottleAction = keyof typeof RULES

/** Adresse de l'appelant, telle que la voit le proxy de Render. */
export async function callerIp(): Promise<string> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')
  // Le premier élément est l'adresse d'origine ; les suivants sont les relais.
  const first = forwarded?.split(',')[0]?.trim()
  return first || requestHeaders.get('x-real-ip') || 'inconnue'
}

export type ThrottleResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

async function hit(key: string, rule: ThrottleRule): Promise<ThrottleResult> {
  const now = new Date()

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } })

    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
      }
    }

    const windowExpired =
      !existing || now.getTime() - existing.windowStart.getTime() > rule.windowSeconds * 1000

    if (windowExpired) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { count: 1, windowStart: now, blockedUntil: null },
        create: { key, count: 1, windowStart: now },
      })
      return { allowed: true }
    }

    const count = existing.count + 1
    if (count > rule.max) {
      const blockedUntil = new Date(now.getTime() + rule.blockSeconds * 1000)
      await prisma.rateLimit.update({ where: { key }, data: { count, blockedUntil } })
      return { allowed: false, retryAfterSeconds: rule.blockSeconds }
    }

    await prisma.rateLimit.update({ where: { key }, data: { count } })
    return { allowed: true }
  } catch (error) {
    // Une panne du compteur ne doit pas fermer la boutique : on laisse passer
    // et on le signale. Le choix inverse transformerait un incident de base en
    // interdiction de se connecter pour tout le monde.
    console.error('[throttle] compteur indisponible', error)
    return { allowed: true }
  }
}

/**
 * Enregistre une tentative et dit si elle est autorisée.
 * `target` est l'e-mail ou la référence visée ; il est normalisé pour que
 * « Alice@… » et « alice@… » comptent ensemble.
 */
export async function throttle(
  action: ThrottleAction,
  target?: string | null,
): Promise<ThrottleResult> {
  const rule = RULES[action]
  const ip = await callerIp()

  const results = await Promise.all([
    hit(`${action}:ip:${ip}`, rule),
    target ? hit(`${action}:cible:${target.trim().toLowerCase()}`, rule) : Promise.resolve({ allowed: true } as ThrottleResult),
  ])

  const blocked = results.find((result): result is Exclude<ThrottleResult, { allowed: true }> => !result.allowed)
  return blocked ?? { allowed: true }
}

/** Remet les compteurs à zéro après un succès (connexion réussie). */
export async function clearThrottle(action: ThrottleAction, target?: string | null): Promise<void> {
  const ip = await callerIp()
  const keys = [`${action}:ip:${ip}`]
  if (target) keys.push(`${action}:cible:${target.trim().toLowerCase()}`)
  try {
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } })
  } catch (error) {
    console.error('[throttle] remise à zéro impossible', error)
  }
}

/** Message affiché au client, sans révéler la règle exacte. */
export function throttleMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
}
