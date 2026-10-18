import 'server-only'

/**
 * Contrôle d'accès à une commande.
 *
 * Sans lui, l'identifiant de commande suffit à lire l'adresse, le téléphone,
 * l'e-mail et le montant du client — les identifiants circulent dans les URL de
 * retour du prestataire, les journaux et l'historique du navigateur. C'est une
 * fuite de données personnelles, pas seulement une commodité manquante.
 *
 * Tant qu'il n'y a pas d'authentification, le jeton de la commande est la seule
 * preuve de légitimité. Il est généré à la création, transmis dans les URL de
 * retour, et comparé ici à temps constant pour ne pas fuiter sa valeur par la
 * durée de la comparaison.
 *
 * Quand l'espace client existera, un utilisateur connecté propriétaire de la
 * commande devra pouvoir y accéder sans jeton : c'est le rôle du paramètre
 * `viewerUserId`.
 */

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Récupère le jeton d'accès depuis les paramètres d'URL. */
export function accessTokenFrom(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const raw = searchParams?.t
  if (typeof raw === 'string' && raw.length > 0) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].length > 0) return raw[0]
  return null
}

export function canViewOrder(
  order: { guestToken: string | null; userId: string | null },
  token: string | null,
  viewerUserId: string | null = null,
): boolean {
  if (viewerUserId && order.userId && viewerUserId === order.userId) return true
  if (!order.guestToken || !token) return false
  return constantTimeEquals(order.guestToken, token)
}
