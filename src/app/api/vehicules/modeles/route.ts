import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MODELE_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { lectureCatalogue } from '@/lib/cache-catalogue'

export const dynamic = 'force-dynamic'

/** Modèles d'une marque qui mènent à au moins un produit en ligne. */
export async function GET(request: Request) {
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

/* Cache partagé du catalogue, par marque (voir lib/cache-catalogue.ts). */
const modelesEnCache = lectureCatalogue('selecteur-modeles-v1', (makeId: string) =>
  prisma.vehicleModel.findMany({
    where: { makeId, ...MODELE_VISIBLE },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  }),
)
