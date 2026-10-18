import 'server-only'
import type {
  CreatePaymentInput,
  PaymentDriver,
  PaymentEvent,
  PaymentOutcome,
  PaymentSession,
} from './types'

/**
 * Pilote Mollie, en page de paiement hébergée (Mollie Checkout).
 *
 * Trois choses distinguent Mollie de Stripe, et elles dictent tout ce fichier.
 *
 * **1. Le webhook n'est pas signé.** Mollie POSTe `id=tr_xxx` en
 * `application/x-www-form-urlencoded`, et rien d'autre. Il n'y a ni signature,
 * ni secret partagé. L'authenticité ne vient donc pas de la requête reçue mais
 * de ce qu'on en fait : on va relire le paiement par l'API, avec notre clé
 * secrète. Un inconnu qui POSTerait un identifiant au hasard ferait interroger
 * Mollie pour rien ; s'il POSTait l'identifiant réel d'un de nos paiements, il
 * nous ferait relire l'état véritable — c'est-à-dire exactement ce que nous
 * voulions savoir. Le corps du webhook est un signal, jamais une donnée.
 *
 * **2. La redirection de retour ne dit pas l'issue.** Il n'y a qu'une URL de
 * retour, empruntée quelle que soit l'issue, et la documentation demande
 * explicitement de ne pas en déduire le statut. D'où `fetchOutcome`, appelée au
 * retour du client (voir `reconcilePayment`).
 *
 * **3. Un statut non définitif n'est pas un échec.** Mollie a sept statuts et
 * seuls quatre sont définitifs. En particulier, sur un paiement multi-moyens,
 * une tentative échouée **ramène le paiement à `open`** : le client est invité
 * à réessayer. Conclure « refusé » sur un `open` annulerait la commande d'un
 * client en train de payer. Ce pilote ne renvoie donc une issue que pour les
 * statuts définitifs, et `null` partout ailleurs.
 */

const API_BASE = 'https://api.mollie.com/v2'

/**
 * Délai de garde des appels à Mollie.
 *
 * Choisi en fonction du webhook : Mollie **abandonne un appel de webhook au
 * bout de 15 secondes** et le compte comme un échec, même si la réponse 200
 * finit par arriver. Notre traitement de webhook commence justement par relire
 * le paiement ; si cette lecture traîne, c'est tout le webhook qui dépasse.
 * Dix secondes laissent de la marge pour l'écriture en base, et un échec franc
 * vaut mieux qu'une requête suspendue : Mollie relancera.
 */
const TIMEOUT_MS = 10_000

/** Réponse partielle d'un paiement Mollie : ce que ce pilote lit réellement. */
type MollieAmount = { currency: string; value: string }

type MolliePayment = {
  id: string
  status: string
  amount?: MollieAmount
  amountCaptured?: MollieAmount | null
  method?: string | null
  paidAt?: string | null
  _links?: { checkout?: { href?: string } | null }
}

/* -------------------------------------------------------------------------- */
/* Montants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Centimes → chaîne Mollie (`"20.80"`).
 *
 * Fait à l'entier, sans division flottante. `2080 / 100` vaut bien 20.8, mais
 * la famille de bugs où un centime se perd dans un arrondi n'a pas sa place
 * dans le calcul d'un montant encaissé : on découpe les euros et les centimes.
 */
export function toMollieAmount(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Montant non entier en centimes : ${cents}`)
  }
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Chaîne Mollie → centimes, ou `null` si la forme n'est pas celle attendue.
 *
 * `null` plutôt qu'une approximation : un montant qu'on ne sait pas lire ne
 * doit pas être comparé au montant attendu, car la comparaison déciderait de
 * valider ou non une commande. `applyPaymentOutcome` traite `null` comme
 * « montant non vérifiable » et laisse passer, le contrôle ayant déjà eu lieu
 * à la création du paiement.
 */
export function fromMollieAmount(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const [, sign, whole, fraction] = match
  const cents = Number(whole) * 100 + Number((fraction ?? '0').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return sign === '-' ? -cents : cents
}

/* -------------------------------------------------------------------------- */
/* Statuts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Statut Mollie → issue normalisée, ou `null` si rien n'est encore joué.
 *
 * Attention à l'orthographe : Mollie écrit `canceled` avec un seul « l ». Un
 * test sur `'cancelled'` ne correspondrait jamais, et le paiement tomberait
 * dans le cas par défaut — sans erreur, sans trace.
 *
 * `authorized` renvoie `null`, et c'est le point le plus important de cette
 * table : les fonds sont seulement **réservés**. Sans capture, l'autorisation
 * expire (sept jours sur Visa) et le paiement finit `expired` : marchandise
 * expédiée, rien perçu. Comme ce pilote ne demande pas de capture manuelle,
 * Mollie capture de lui-même et le paiement passera à `paid` — c'est ce `paid`
 * qu'on attend, pas l'autorisation.
 */
export function outcomeFromStatus(status: string): PaymentOutcome | null {
  switch (status) {
    case 'paid':
      return 'paid'
    case 'canceled':
      return 'canceled'
    case 'expired':
      return 'expired'
    case 'failed':
      return 'failed'

    // Statuts non définitifs. Le paiement peut encore aboutir : `open` est même
    // l'état où revient un paiement après une tentative abandonnée.
    case 'open':
    case 'pending':
    case 'authorized':
      return null

    default:
      // Statut inconnu (nouveauté chez Mollie) : on ne devine pas. La trace
      // permet de l'ajouter sciemment plutôt que de l'avoir traité de travers.
      console.warn(`[mollie] statut inconnu « ${status} » : aucune issue appliquée`)
      return null
  }
}

/* -------------------------------------------------------------------------- */
/* URL de webhook                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mollie exige une URL de webhook **publiquement joignable** : il refuse
 * `localhost`, `127.0.0.1` et les domaines non résolvables. En développement,
 * on omet donc le champ plutôt que de faire échouer la création du paiement, et
 * c'est le retour du client qui réconcilie (`reconcilePayment`).
 *
 * Exporté pour être testable : c'est la règle qui décide si la production
 * recevra ses notifications.
 */
export function publicWebhookUrl(origin: string): string | null {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  const unreachable =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test') ||
    host.endsWith('.local') ||
    // Adresses privées : joignables depuis le poste, pas depuis Mollie.
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)

  if (unreachable) return null
  return `${url.origin}/api/paiement/webhook`
}

/* -------------------------------------------------------------------------- */
/* Pilote                                                                     */
/* -------------------------------------------------------------------------- */

export type MollieDriverOptions = {
  /** Injectable pour les tests : aucun appel réseau n'y a lieu. */
  fetchImpl?: typeof fetch
  baseUrl?: string
  /**
   * Origine publique du site, pour construire les URL de retour et de webhook.
   * Vient de `NEXT_PUBLIC_SITE_URL` par défaut.
   */
  siteOrigin?: string
}

export class MollieDriver implements PaymentDriver {
  readonly name = 'mollie' as const
  readonly simulated = false

  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly siteOrigin: string

  constructor(
    private readonly apiKey: string,
    options: MollieDriverOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = (options.baseUrl ?? API_BASE).replace(/\/$/, '')
    this.siteOrigin = options.siteOrigin ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  }

  /** Le mode se lit dans la clé : `test_…` ou `live_…`. Rien d'autre à régler. */
  get isTestMode(): boolean {
    return this.apiKey.startsWith('test_')
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
      ...extra,
    }
  }

  /** Lève avec le message de Mollie plutôt qu'un « 422 » opaque. */
  private async readJson(response: Response, context: string): Promise<unknown> {
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }

    if (!response.ok) {
      // Mollie renvoie `detail` (message lisible) et, sur un 422 seulement,
      // `field` (le paramètre fautif). C'est ce qu'on veut dans les journaux :
      // « 422 » tout seul n'apprend rien.
      const problem = body as { detail?: string; title?: string; field?: string } | null
      const detail = problem?.detail ?? problem?.title ?? text.slice(0, 300)
      const field = problem?.field ? ` (champ « ${problem.field} »)` : ''
      throw new Error(`Mollie ${context} : ${response.status} ${detail}${field}`)
    }
    return body
  }

  async createSession(input: CreatePaymentInput): Promise<PaymentSession> {
    /*
      Deux origines, et elles n'ont pas le même rôle.

      - Le RETOUR du client suit l'origine réellement servie, celle que
        l'appelant a mise dans `successUrl` : c'est là que le client se trouve.
        La faire venir d'une variable d'environnement renverrait un visiteur de
        la préproduction vers la production si cette variable était mal réglée.
      - Le WEBHOOK suit l'origine publique configurée, parce que Mollie doit
        pouvoir l'atteindre depuis l'extérieur et que l'origine d'une requête
        interne ne le garantit pas.
    */
    const callerOrigin = new URL(input.successUrl).origin
    const publicOrigin = (this.siteOrigin || callerOrigin).replace(/\/$/, '')
    const webhookUrl = publicWebhookUrl(publicOrigin)
    const returnUrl =
      `${callerOrigin}/api/paiement/retour` +
      `?order=${encodeURIComponent(input.orderId)}` +
      `&t=${encodeURIComponent(input.accessToken)}`

    if (!webhookUrl) {
      // Dit une fois, à la création : sans webhook, seul le retour du client
      // réconcilie. C'est acceptable en développement, pas en production.
      console.warn(
        `[mollie] origine « ${publicOrigin} » non joignable depuis l'extérieur : aucun webhook ne ` +
          'sera demandé. Le paiement sera réconcilié au retour du client.',
      )
    }

    const body: Record<string, unknown> = {
      amount: {
        currency: input.currency.toUpperCase(),
        value: toMollieAmount(input.amountCents),
      },
      // Visible par le client sur son relevé et dans son e-mail Mollie : la
      // référence de commande est ce qui permet de faire le lien. Tronquée à
      // 255 caractères, longueur maximale acceptée — au-delà, Mollie coupe
      // lui-même, ce qui vaut mieux d'être fait sciemment ici.
      description: `Commande ${input.orderReference}`.slice(0, 255),
      // Une seule URL de retour, quelle que soit l'issue : c'est le modèle
      // Mollie. `cancelUrl` est volontairement omis — il retombe alors sur
      // `redirectUrl`, et notre route de retour relit le statut avant de
      // décider, au lieu de croire une URL sur parole.
      redirectUrl: returnUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      // Jusqu'à 1 ko environ. On n'y met rien de sensible : ces données
      // reviennent dans chaque réponse de l'API et s'affichent dans le
      // tableau de bord Mollie.
      metadata: {
        orderId: input.orderId,
        orderReference: input.orderReference,
      },
      locale: 'fr_FR',
    }

    /*
      Volontairement absents de cette requête :

      - `method` : restreindre à un seul moyen de paiement a un effet de bord
        documenté — si le client renonce sur la page de ce moyen, Mollie
        n'envoie AUCUN webhook. Le choix du moyen reste donc celui du profil
        Mollie, et l'écran de sélection est présenté par Mollie.
      - `lines` et `billingAddress` : facultatifs pour la carte, iDEAL,
        Bancontact et PayPal, mais OBLIGATOIRES pour les paiements fractionnés
        et différés (Klarna, in3, Billie, Billink, Riverty, voucher). Tant
        qu'ils ne sont pas transmis, il ne faut pas activer ces moyens sur le
        profil : Mollie refuserait la création du paiement. C'est noté dans
        docs/render.md.
      - `profileId` et `testmode` : réservés aux identifiants d'organisation
        (OAuth). Avec une clé d'API, le mode est porté par la clé.
    */

    const response = await this.fetchImpl(`${this.baseUrl}/payments`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      /*
        Clé d'idempotence, reconnue par Mollie sur tous les POST : rejouer la
        même requête renvoie le paiement déjà créé plutôt que d'en créer un
        second. C'est ce qui protège du double-clic et du rechargement.

        À savoir : Mollie ne garde ces clés qu'UNE HEURE. Au-delà, la même clé
        repart sur une création. Ce n'est pas un problème ici parce que la
        protection de fond est ailleurs : `Payment.idempotencyKey` est unique
        en base, donc une seconde tentative d'ouverture de paiement pour la
        même commande échoue chez nous, même un jour plus tard.
      */
      headers: this.headers({ 'idempotency-key': input.idempotencyKey }),
      body: JSON.stringify(body),
    })

    const payment = (await this.readJson(response, 'création du paiement')) as MolliePayment | null
    const checkout = payment?._links?.checkout?.href

    if (!payment?.id) throw new Error("Mollie n'a pas renvoyé d'identifiant de paiement.")
    if (!checkout) {
      // Arrive quand le profil n'a aucun moyen de paiement actif : Mollie crée
      // le paiement mais n'a pas de page à présenter.
      throw new Error(
        "Mollie n'a pas renvoyé d'URL de paiement. Vérifiez qu'au moins un moyen de paiement " +
          'est activé sur le profil utilisé par cette clé.',
      )
    }

    return {
      provider: this.name,
      providerRef: payment.id,
      redirectUrl: checkout,
      isTestMode: this.isTestMode,
      simulated: false,
    }
  }

  /**
   * Webhook Mollie.
   *
   * Le corps vaut `id=tr_xxx`. On ne lui fait confiance pour rien d'autre que
   * pour désigner un paiement à relire : tout le reste vient de l'API.
   */
  async parseWebhook(
    rawBody: string,
    /**
     * Les en-têtes sont reçus pour respecter le contrat commun, et ignorés
     * sciemment : le webhook classique de Mollie n'en porte aucun qui
     * authentifie l'appel. Chercher une signature ici reviendrait à inventer
     * une garantie qui n'existe pas.
     */
    _headers?: Headers,
  ): Promise<PaymentEvent | null> {
    const id = new URLSearchParams(rawBody).get('id')?.trim() ?? ''

    // Forme de l'identifiant vérifiée avant tout appel : inutile d'interroger
    // Mollie avec une valeur qui ne peut pas être une référence de paiement.
    if (!/^tr_[A-Za-z0-9]+$/.test(id)) {
      console.warn('[mollie] webhook sans identifiant de paiement exploitable')
      return null
    }

    return this.fetchOutcome(id)
  }

  /**
   * Relit l'état d'un paiement.
   *
   * Renvoie `null` tant que l'issue n'est pas définitive — y compris sur un
   * 404, qui signifie que ce paiement n'appartient pas à la clé utilisée : ce
   * n'est pas notre paiement, il n'y a rien à appliquer.
   */
  async fetchOutcome(providerRef: string): Promise<PaymentEvent | null> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/payments/${encodeURIComponent(providerRef)}`,
      { method: 'GET', headers: this.headers(), signal: AbortSignal.timeout(TIMEOUT_MS) },
    )

    if (response.status === 404) {
      console.warn(`[mollie] paiement ${providerRef} inconnu de cette clé : ignoré`)
      return null
    }

    const payment = (await this.readJson(response, 'lecture du paiement')) as MolliePayment | null
    if (!payment?.status) return null

    const outcome = outcomeFromStatus(payment.status)
    if (!outcome) return null

    /*
      Montant retenu pour le contrôle de cohérence.

      Sur un paiement abouti, c'est le montant réellement capturé qui compte,
      pas le montant demandé : une capture partielle ne vaut pas la commande.
      Mollie ne renseigne `amountCaptured` que lorsqu'il y a lieu, on retombe
      donc sur `amount`.

      `amountKnown` distingue « rien à contrôler » de « je n'ai pas su lire ».
      Sans cette distinction, une réponse tronquée ou un champ absent feraient
      confirmer la commande sans aucune vérification de montant.
    */
    if (outcome !== 'paid') {
      return {
        providerRef: payment.id,
        outcome,
        amountCents: null,
        currency: payment.amount?.currency ?? null,
        amountKnown: true,
        raw: payment,
      }
    }

    const source = payment.amountCaptured ?? payment.amount ?? null
    const amountCents = fromMollieAmount(source?.value)

    if (amountCents === null) {
      console.error(
        `[mollie] ${payment.id} annoncé payé, montant illisible : ${JSON.stringify(source)}`,
      )
    }

    return {
      providerRef: payment.id,
      outcome,
      amountCents,
      currency: source?.currency ?? payment.amount?.currency ?? null,
      amountKnown: amountCents !== null,
      raw: payment,
    }
  }
}
