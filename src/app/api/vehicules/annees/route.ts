import { NextResponse, connection } from 'next/server'
import { prisma } from '@/lib/db'
import { GENERATION_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { lectureCatalogue } from '@/lib/cache-catalogue'

/**
 * Années couvertes par les générations d'un modèle.
 * Une génération encore produite (yearTo nul) est bornée à l'année courante.
 *
 * Seules les générations visibles comptent : une année qui ne mène qu'à des
 * véhicules sans produit serait un cul-de-sac proposé en toute confiance.
 */
export async function GET(request: Request) {
  // Jamais pré-rendu : la réponse dépend de la requête. `connection()` le dit
  // explicitement, là où l'ancien `dynamic = 'force-dynamic'` le réglait par
  // configuration de segment.
  await connection()

  const modelId = new URL(request.url).searchParams.get('modelId')
  if (!modelId) return NextResponse.json({ items: [] })
  try {
    const generations = await generationsEnCache(modelId)
    const currentYear = new Date().getFullYear()
    const years = new Set<number>()
    for (const generation of generations) {
      const end = Math.min(generation.yearTo ?? currentYear, currentYear)
      for (let year = generation.yearFrom; year <= end; year += 1) years.add(year)
    }
    return NextResponse.json({ items: [...years].sort((a, b) => b - a) })
  } catch (error) {
    console.error('[vehicules/annees]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}

/*
  Cache partagé du catalogue, par modèle (voir lib/cache-catalogue.ts). Seules
  les bornes sont gardées : la liste des années, elle, dépend de l'année en
  cours et se recalcule à chaque appel.
*/
const generationsEnCache = lectureCatalogue('selecteur-generations-v1', (modelId: string) =>
  prisma.vehicleGeneration.findMany({
    where: { modelId, ...GENERATION_VISIBLE },
    select: { yearFrom: true, yearTo: true },
  }),
)
