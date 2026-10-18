/**
 * Destination de redirection après connexion.
 *
 * Isolé de `actions/auth.ts` pour être testable : ce fichier n'importe rien de
 * Next, donc aucune frontière serveur à contourner dans les tests.
 *
 * Le piège que cette fonction existe pour éviter : `/\evil.com` commence bien
 * par « / » et pas par « // », mais les navigateurs normalisent l'antislash en
 * slash. L'en-tête `Location` devient `//evil.com`, c'est-à-dire une URL
 * relative au protocole vers un domaine tiers — et comme la page de connexion
 * recopie `?next=` dans son formulaire, le lien d'hameçonnage s'écrit tout seul.
 *
 * On ne devine donc pas : on résout la valeur contre notre propre origine et
 * on refuse tout ce qui en sort.
 */
export function buildSafeNext(value: string | undefined | null, siteUrl: string): string {
  if (!value) return '/compte'
  try {
    const base = new URL(siteUrl)
    const resolved = new URL(value, base)
    if (resolved.origin !== base.origin) return '/compte'
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return '/compte'
  }
}
