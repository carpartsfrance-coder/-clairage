import { NextResponse, connection } from 'next/server'
import { prisma } from '@/lib/db'
import { GENERATION_VISIBLE, MODELE_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { lectureCatalogue } from '@/lib/cache-catalogue'

/** Modèles d'une marque qui mènent à au moins un produit en ligne. */
export async function GET(request: Request) {
  // Jamais pré-rendu : la réponse dépend de la requête. Remplace
  // `dynamic = 'force-dynamic'`, incompatible avec le pré-rendu partiel.
  await connection()

  const makeId = new URL(request.url).searchParams.get('makeId')
  if (!makeId) return NextResponse.json({ items: [] })
  try {
    const items = await modelesEnCache(makeId)
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[vehicules/modeles]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}

/*
  Cache partagé du catalogue, par marque (voir lib/cache-catalogue.ts).

  Le nom est suivi des années (« Duster (2010–2017) ») : « Duster / Duster 2 /
  Duster 3 » ne disait pas au client lequel est le sien. Les années sont
  celles des générations en ligne du modèle.
*/
const modelesEnCache = lectureCatalogue('selecteur-modeles-v2', async (makeId: string) => {
  const modeles = await prisma.vehicleModel.findMany({
    where: { makeId, ...MODELE_VISIBLE },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      generations: { where: GENERATION_VISIBLE, select: { yearFrom: true, yearTo: true } },
    },
  })
  return modeles.map(({ id, name, generations }) => {
    if (generations.length === 0) return { id, name }
    const debut = Math.min(...generations.map((g) => g.yearFrom))
    const fin = generations.some((g) => g.yearTo === null)
      ? null
      : Math.max(...generations.map((g) => g.yearTo as number))
    const annees = fin === null ? `depuis ${debut}` : debut === fin ? `${debut}` : `${debut}–${fin}`
    return { id, name: `${name} (${annees})` }
  })
})
