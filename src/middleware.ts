import { NextResponse, type NextRequest } from 'next/server'

/**
 * Expose le chemin de la requête aux composants serveur.
 *
 * Next ne donne pas le chemin aux mises en page : une mise en page imbriquée ne
 * peut donc pas savoir qu'elle rend une page du back-office. On le lui dit par
 * un en-tête, ce qui permet à la mise en page racine de ne pas poser l'en-tête
 * et le pied de page de la boutique au-dessus d'un outil de travail.
 *
 * L'autre solution serait deux mises en page racines via des groupes de routes,
 * ce qui obligerait à déplacer toutes les routes publiques. Pour un seul
 * en-tête à poser, le coût ne le vaut pas.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Inutile sur les fichiers statiques et les images optimisées.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|demo/).*)'],
}
