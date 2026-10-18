/**
 * Contrat commun aux prestataires de paiement.
 *
 * Le reste de l'application ne connaît que ces types : passer de Stripe à
 * Mollie ne doit toucher ni la commande, ni le stock, ni les e-mails.
 */

export type PaymentDriverName = 'mollie' | 'stripe' | 'simulation'

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

/**
 * Issues normalisées.
 *
 * `canceled` est distinguée de `failed` : un client qui renonce n'est pas un
 * paiement refusé, et les deux ne se disent pas de la même façon. Les deux
 * libèrent le stock de la même manière.
 */
export type PaymentOutcome = 'paid' | 'failed' | 'expired' | 'canceled'

/** Événement normalisé, quel que soit le prestataire. */
export type PaymentEvent = {
  providerRef: string
  outcome: PaymentOutcome
  /**
   * Montant encaissé, en centimes.
   *
   * `null` a deux sens très différents, et c'est `amountKnown` qui les sépare :
   * soit il n'y avait rien à contrôler (issue négative), soit le prestataire a
   * annoncé un encaissement dont on n'a pas su lire le montant. Le second cas
   * ne doit pas être traité comme le premier : confirmer une commande sans
   * avoir pu vérifier le montant, c'est accepter n'importe quelle somme.
   */
  amountCents: number | null
  /** Devise annoncée par le prestataire, pour la comparer à celle de la commande. */
  currency?: string | null
  /**
   * Faux quand le prestataire annonce un encaissement dont le montant est
   * illisible ou absent. Vrai dans tous les autres cas, y compris les issues
   * négatives, où il n'y a rien à contrôler.
   */
  amountKnown?: boolean
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
  /** Jeton d'accès à la commande, propagé dans les URL de retour. */
  accessToken: string
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
   * Transforme un appel de webhook en événement normalisé.
   *
   * Reçoit le corps brut **et les en-têtes**, parce que les prestataires
   * n'authentifient pas de la même façon :
   *
   *  - **Stripe** signe le corps. La signature voyage dans un en-tête, et un
   *    appel non signé n'est pas une information : c'est une tentative. Le
   *    pilote lève.
   *  - **Mollie** ne signe rien. Il POSTe l'identifiant du paiement qui vient
   *    de changer, et la doc demande d'aller relire l'état **par l'API**. La
   *    confiance ne vient donc pas de la requête reçue mais de la réponse de
   *    Mollie, obtenue avec notre clé secrète.
   *
   * Renvoie `null` quand l'appel est légitime mais sans effet pour nous.
   */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>

  /**
   * Relit l'état courant d'un paiement chez le prestataire.
   *
   * Sert à deux choses : au retour du client, quand le webhook n'est pas encore
   * arrivé (ou ne peut pas arriver, voir le développement en local), et au
   * rattrapage manuel depuis le back-office.
   *
   * Absente quand le prestataire ne permet pas cette relecture — c'est le cas
   * du pilote de simulation, qui n'a rien à interroger.
   */
  fetchOutcome?(providerRef: string): Promise<PaymentEvent | null>
}
