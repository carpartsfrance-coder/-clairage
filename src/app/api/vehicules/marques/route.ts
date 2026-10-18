import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Marques actives pour un type de véhicule (voiture ou moto). */
export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get('type') === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR'
  try {
    const items = await prisma.vehicleMake.findMany({
      where: { active: true, type },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    })
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[vehicules/marques]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}
