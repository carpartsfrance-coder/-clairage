/**
 * Un seul domaine public : ledvroom.com.
 *
 * Render sert aussi le site à son adresse technique, `lumera-web.onrender.com`.
 * Laissée ouverte, elle montre à Google une copie complète du site sous un
 * autre nom — du contenu en double, qui dilue le classement de la vraie
 * adresse. Toute visite sur une adresse `*.onrender.com` est donc renvoyée,
 * chemin et paramètres compris, vers le domaine public (redirection
 * permanente 308).
 *
 * Deux exceptions :
 * - `/api/health`, que le contrôle de santé de Render appelle sur son adresse
 *   technique : il doit recevoir l'état du service, pas une redirection ;
 * - un domaine public qui serait lui-même en `.onrender.com` (environnement de
 *   test) : on ne redirige pas une adresse vers elle-même.
 *
 * Rend l'adresse de destination, ou `null` quand il n'y a rien à faire.
 */
export function redirectionVersDomainePublic(
  hote: string | null,
  url: URL,
  urlPublique: string,
): string | null {
  if (!hote) return null
  const nomHote = hote.split(',')[0].trim().split(':')[0].toLowerCase()
  if (!nomHote.endsWith('.onrender.com')) return null
  if (url.pathname === '/api/health') return null

  let publique: URL
  try {
    publique = new URL(urlPublique)
  } catch {
    return null
  }
  if (publique.hostname.toLowerCase() === nomHote) return null
  if (publique.hostname.endsWith('.onrender.com') || publique.hostname === 'localhost') return null

  return `${publique.origin}${url.pathname}${url.search}`
}
