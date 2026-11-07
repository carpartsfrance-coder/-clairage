import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MARQUE_VISIBLE } from '@/lib/queries/vehicules-visibles'

export const dynamic = 'force-dynamic'

/**
 * Marques proposées par le sélecteur, pour un type de véhicule.
 *
 * Seules celles qui mènent à au moins un produit en ligne : proposer une marque
 * pour n'annoncer, trois écrans plus loin, qu'aucun éclairage n'est disponible
 * fait perdre au client le temps qu'il a passé à se reconnaître.
 */
export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get('type') === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR'
  try {
    const items = await prisma.vehicleMake.findMany({
      where: { type, ...MARQUE_VISIBLE },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    })
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[vehicules/marques]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}
