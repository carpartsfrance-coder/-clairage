import { siteConfig } from './identity'

/**
 * L'origine publique d'une requête : « https://ledvroom.com ».
 *
 * **Pourquoi pas `new URL(request.url).origin`.** Derrière le proxy de Render,
 * Next reçoit la requête sur son adresse interne : `request.url` vaut
 * « http://localhost:10000/… ». Une redirection construite dessus envoie le
 * visiteur hors du site — c'est arrivé au retour du premier paiement de test
 * (7 novembre 2026) : « localhost n'autorise pas la connexion ».
 *
 * L'origine se lit donc dans ce que le proxy transmet : `x-forwarded-host` (ou
 * `host`) et `x-forwarded-proto`. C'est déjà ce que fait le tunnel de commande
 * (`actions/checkout.ts`) pour construire les adresses de retour. À défaut,
 * l'adresse publique configurée (`NEXT_PUBLIC_SITE_URL`).
 */
export function origineDeLaRequete(request: Request): string {
  const entetes = request.headers
  const hote = premiere(entetes.get('x-forwarded-host')) ?? premiere(entetes.get('host'))
  if (!hote) return siteConfig.url.replace(/\/$/, '')

  const protocole =
    premiere(entetes.get('x-forwarded-proto')) ?? new URL(request.url).protocol.replace(':', '')
  return `${protocole}://${hote}`
}

/** Un en-tête relayé par plusieurs proxys est une liste : le premier est le client. */
function premiere(valeur: string | null): string | null {
  const premier = valeur?.split(',')[0]?.trim()
  return premier ? premier : null
}
