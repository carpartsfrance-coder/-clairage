/**
 * Discussion en direct : les règles, sans base ni réseau.
 *
 * Tout ce qui décide — qui prévenir, quand relayer par e-mail, ce qu'on
 * accepte d'un navigateur — vit ici, en fonctions pures, pour être vérifié par
 * les tests. La lecture et l'écriture en base sont dans `chat-serveur.ts`.
 *
 * **Un humain répond, pas un robot.** C'est le parti pris de tout le module
 * (exploitant, 19 novembre 2026). La boutique ne connaît la compatibilité que
 * pour une partie des véhicules ; un robot comblerait le trou en devinant, et
 * une devinette se paie en retour colis. Une personne, elle, peut écrire « je
 * vérifie et je vous réponds » — c'est la bonne réponse, et elle convertit.
 */

/** Longueur maximale d'un message du visiteur : une question, pas un roman. */
export const MESSAGE_MAX = 1000
/** Longueur maximale d'une réponse de l'équipe. */
export const REPONSE_MAX = 4000

/**
 * Délai au-delà duquel le visiteur est considéré parti.
 *
 * Sa page relit la discussion toutes les 4 s fenêtre ouverte, toutes les 12 s
 * fenêtre fermée, et plus du tout onglet en arrière-plan. Trente secondes sans
 * nouvelles, c'est donc qu'il a fermé l'onglet ou changé d'application : une
 * réponse affichée à l'écran ne serait pas lue, il faut l'envoyer par e-mail.
 */
export const PRESENCE_MS = 30_000

/**
 * Délai avant de relancer l'équipe sur une discussion qu'elle n'a pas ouverte.
 *
 * Une alerte par message noierait la boîte de réception dès qu'un client
 * écrit en trois fois ; aucune relance laisserait un client attendre pour
 * rien si la première alerte est passée inaperçue.
 */
export const RAPPEL_ALERTE_MS = 15 * 60_000

/**
 * Délai après lequel la fenêtre propose de laisser une adresse, quand
 * personne n'a encore répondu. Deux minutes : assez pour qu'un humain
 * disponible réponde, pas assez pour que le visiteur soit déjà parti.
 */
export const ATTENTE_AVANT_EMAIL_MS = 2 * 60_000

/** Ce que le navigateur reçoit d'un message : jamais l'auteur côté équipe. */
export type MessageVu = {
  id: string
  de: 'client' | 'equipe'
  texte: string
  /** Date ISO. */
  le: string
}

/** État de la discussion renvoyé à la bulle. */
export type EtatDiscussion = {
  disponible: boolean
  /** Absent tant que le visiteur n'a rien écrit. */
  t?: string
  ouverte?: boolean
  avecEmail?: boolean
  messages?: MessageVu[]
}

/* -------------------------------------------------------------------------- */
/* Ce qu'on accepte d'un navigateur                                           */
/* -------------------------------------------------------------------------- */

/**
 * Un message propre, ou rien.
 *
 * Les fins de ligne sont unifiées, les lignes vides en série réduites à une,
 * et la longueur coupée. Le texte n'est jamais interprété : React l'échappe à
 * l'affichage, et les e-mails l'échappent à leur tour (`email/layout.ts`).
 */
export function nettoyerMessage(brut: unknown, max = MESSAGE_MAX): string | null {
  if (typeof brut !== 'string') return null
  const texte = brut
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
    .trim()
  return texte ? texte : null
}

/** Une adresse plausible, en minuscules, ou rien. */
export function emailValide(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  const email = brut.trim().toLowerCase()
  if (email.length > 160) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
}

/**
 * Le chemin de la page d'où vient la question.
 *
 * Sans paramètres ni ancre : une adresse publicitaire porte un `gclid` qui
 * n'apprend rien à l'équipe et qu'il n'y a pas de raison de garder.
 */
export function cheminPropre(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  const chemin = brut.split(/[?#]/)[0].trim()
  if (!chemin.startsWith('/') || chemin.startsWith('//')) return null
  if (chemin.startsWith('/admin') || chemin.startsWith('/api')) return null
  if (chemin.length > 200 || /\s/.test(chemin)) return null
  return chemin
}

/** Un identifiant de fiche produit (`/p/<slug>`), ou rien. */
export function slugPropre(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brut) && brut.length <= 200 ? brut : null
}

/** Un numéro de visite de la mesure d'audience, ou rien. */
export function visitePropre(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  return /^[A-Za-z0-9-]{8,64}$/.test(brut) ? brut : null
}

/** Le jeton tel que `nouveauJeton` le fabrique : 32 caractères base64url. */
export function jetonPropre(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  return /^[A-Za-z0-9_-]{32}$/.test(brut) ? brut : null
}

/* -------------------------------------------------------------------------- */
/* Décisions                                                                  */
/* -------------------------------------------------------------------------- */

/** Le visiteur a-t-il encore sa page ouverte ? */
export function visiteurPresent(customerSeenAt: Date | null, maintenant: Date): boolean {
  return customerSeenAt !== null && maintenant.getTime() - customerSeenAt.getTime() < PRESENCE_MS
}

/**
 * Délai pendant lequel l'équipe est considérée devant la discussion.
 *
 * La page de la discussion, dans le back-office, se relit toutes les 5 s et
 * note chaque relecture : tant qu'elle est ouverte, la dernière lecture a
 * moins de 20 s.
 */
export const EQUIPE_PRESENTE_MS = 20_000

/**
 * Faut-il prévenir l'équipe de ce nouveau message ?
 *
 * Jamais si l'équipe a la discussion sous les yeux : elle voit le message
 * arriver, un e-mail en plus serait du bruit. Sinon : oui au premier message ;
 * oui si l'équipe a lu la discussion depuis la dernière alerte — le visiteur
 * relance, c'est une nouvelle salve ; et sinon seulement passé le délai de
 * rappel, l'alerte précédente n'ayant pas été vue.
 */
export function doitAlerterEquipe(
  discussion: { alertedAt: Date | null; staffReadAt: Date | null },
  maintenant: Date,
): boolean {
  const { alertedAt, staffReadAt } = discussion
  if (staffReadAt && maintenant.getTime() - staffReadAt.getTime() < EQUIPE_PRESENTE_MS) return false
  if (!alertedAt) return true
  if (staffReadAt && staffReadAt >= alertedAt) return true
  return maintenant.getTime() - alertedAt.getTime() >= RAPPEL_ALERTE_MS
}

/**
 * Faut-il envoyer la réponse par e-mail ?
 *
 * Seulement si le visiteur a laissé une adresse et n'est plus sur la page.
 * Présent, il lit la réponse à l'écran : un e-mail en plus ferait doublon.
 */
export function doitRelayerParEmail(
  discussion: { email: string | null; customerSeenAt: Date | null },
  maintenant: Date,
): boolean {
  return Boolean(discussion.email) && !visiteurPresent(discussion.customerSeenAt, maintenant)
}

/** La discussion attend-elle une réponse de l'équipe ? */
export function attendReponse(
  messages: ReadonlyArray<{ authorKind: string }>,
): boolean {
  const dernier = messages.at(-1)
  return dernier?.authorKind === 'customer'
}

/** Le résumé d'une ligne du panier, tel qu'il est gardé avec la discussion. */
export type LignePanier = { produit: string; option: string; quantite: number; prixCents: number }

/** Relit prudemment le champ `cart` : un Json dont rien ne garantit la forme. */
export function lirePanier(valeur: unknown): LignePanier[] {
  if (!Array.isArray(valeur)) return []
  return valeur.flatMap((ligne) => {
    if (typeof ligne !== 'object' || ligne === null) return []
    const l = ligne as Record<string, unknown>
    if (typeof l.produit !== 'string' || typeof l.quantite !== 'number') return []
    return [
      {
        produit: l.produit,
        option: typeof l.option === 'string' ? l.option : '',
        quantite: l.quantite,
        prixCents: typeof l.prixCents === 'number' ? l.prixCents : 0,
      },
    ]
  })
}

/* -------------------------------------------------------------------------- */
/* Alertes instantanées de l'équipe                                           */
/* -------------------------------------------------------------------------- */

/**
 * Faut-il sonner sur les appareils de l'équipe ?
 *
 * À chaque message du visiteur, sauf si l'équipe a déjà la discussion sous
 * les yeux. Pas de règle de salve comme pour l'e-mail : une notification se
 * remplace par la suivante (même étiquette), elle ne s'empile pas.
 */
export function doitNotifierEquipe(
  discussion: { staffReadAt: Date | null },
  maintenant: Date,
): boolean {
  const { staffReadAt } = discussion
  return !(staffReadAt && maintenant.getTime() - staffReadAt.getTime() < EQUIPE_PRESENTE_MS)
}

/**
 * Les services de notification des navigateurs, et eux seuls.
 *
 * Le serveur envoie une requête à l'adresse que le navigateur lui a donnée.
 * Sans cette liste, une adresse fabriquée ferait interroger par la boutique
 * n'importe quelle machine — y compris celles de son propre réseau interne.
 */
const SERVICES_DE_NOTIFICATION = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge récent, Android
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/, // Safari, iPhone
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge ancien
]

export function adresseDeNotificationAcceptee(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && SERVICES_DE_NOTIFICATION.some((motif) => motif.test(url.hostname))
  } catch {
    return false
  }
}

/** « iPhone · Safari », « Mac · Chrome »… pour reconnaître un appareil dans la liste. */
export function libelleAppareil(agent: string): string {
  const appareil = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'Appareil'
  const navigateur = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : null
  return navigateur ? `${appareil} · ${navigateur}` : appareil
}
