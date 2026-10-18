import { NextResponse } from 'next/server'
import { VEHICLE_COOKIE } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Retire le véhicule de la session.
 *
 * Le panier n'est pas vidé : les lignes déjà choisies restent, et c'est la page
 * panier qui signale les lignes dont la compatibilité n'est plus vérifiable.
 * Supprimer silencieusement des articles serait pire que d'afficher le conflit.
 */
export async function POST(request: Request) {
  const referer = request.headers.get('referer')
  const response = NextResponse.redirect(new URL(referer ?? '/', request.url), { status: 303 })
  response.cookies.set(VEHICLE_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
