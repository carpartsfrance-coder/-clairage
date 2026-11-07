import { NextResponse } from 'next/server'
import { VEHICLE_COOKIE } from '@/lib/session'
import { origineDeLaRequete } from '@/lib/origine'

export const dynamic = 'force-dynamic'

/**
 * Retire le véhicule de la session.
 *
 * Le panier n'est pas vidé : les lignes déjà choisies restent, et c'est la page
 * panier qui signale les lignes dont la compatibilité n'est plus vérifiable.
 * Supprimer silencieusement des articles serait pire que d'afficher le conflit.
 */
export async function POST(request: Request) {
  // Retour à la page d'où vient le client, sur l'origine publique du site
  // (lib/origine.ts) — et seulement si cette page est bien sur le site : un
  // `referer` venu d'ailleurs ne doit pas faire de cette route une redirection
  // ouverte.
  const base = origineDeLaRequete(request)
  let cible = '/'
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const page = new URL(referer)
      if (page.host === new URL(base).host) cible = `${page.pathname}${page.search}`
    } catch {
      // Referer illisible : retour à l'accueil.
    }
  }
  const response = NextResponse.redirect(new URL(cible, base), { status: 303 })
  response.cookies.set(VEHICLE_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
