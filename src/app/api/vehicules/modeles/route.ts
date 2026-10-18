import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const makeId = new URL(request.url).searchParams.get('makeId')
  if (!makeId) return NextResponse.json({ items: [] })
  try {
    const items = await prisma.vehicleModel.findMany({
      where: { makeId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[vehicules/modeles]', error)
    return NextResponse.json({ items: [], error: 'Catalogue véhicules indisponible' }, { status: 503 })
  }
}
