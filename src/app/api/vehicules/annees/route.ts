import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Années couvertes par les générations d'un modèle.
 * Une génération encore produite (yearTo nul) est bornée à l'année courante.
 */
export async function GET(request: Request) {
  const modelId = new URL(request.url).searchParams.get('modelId')
  if (!modelId) return NextResponse.json({ items: [] })
  try {
    const generations = await prisma.vehicleGeneration.findMany({
      where: { modelId, active: true },
      select: { yearFrom: true, yearTo: true },
    })
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
