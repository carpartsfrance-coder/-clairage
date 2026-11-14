import { NextResponse, connection } from 'next/server'
import { prisma } from '@/lib/db'
import { MARQUE_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { lectureCatalogue } from '@/lib/cache-catalogue'

/**
 * Marques proposées par le sélecteur, pour un type de véhicule.
 *
 * Seules celles qui mènent à au moins un produit en ligne : proposer une marque
 * pour n'annoncer, trois écrans plus loin, qu'aucun éclairage n'est disponible
 * fait perdre au client le temps qu'il a passé à se reconnaître.
 */
export async function GET(request: Request) {
  // Jamais pré-rendu : la réponse dépend de la requête. `connection()` le dit
  // explicitement, là où l'ancien `dynamic = 'force-dynamic'` le réglait par
  // configuration de segment.
  await connection()

  const type = new URL(request.url).searchParams.get('type') === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR'
  try {
    const items = await marquesEnCache(type)
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[vehicules/marques]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}

/*
  La liste ne dépend que du type de véhicule : elle passe par le cache partagé
  du catalogue (lib/cache-catalogue.ts). Le filtre de visibilité descend
  jusqu'aux compatibilités de chaque génération, et chaque ouverture du
  sélecteur le rejouait sur la base.
*/
const marquesEnCache = lectureCatalogue('selecteur-marques-v2', async (type: 'CAR' | 'MOTORCYCLE') => {
  const marques = await prisma.vehicleMake.findMany({
    where: { type, ...MARQUE_VISIBLE },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    // Le logo, quand l'exploitant en a téléversé un : la grille du sélecteur
    // se reconnaît au coup d'œil plutôt qu'en lisant 47 noms.
    select: { id: true, name: true, slug: true, logo: { select: { url: true } } },
  })
  return marques.map((m) => ({ id: m.id, name: m.name, slug: m.slug, logo: m.logo?.url ?? null }))
})
