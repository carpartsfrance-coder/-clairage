import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Route de vérification de santé consommée par Render.
 *
 * Elle teste la base : un serveur qui répond alors que PostgreSQL est
 * injoignable n'est pas sain, et Render doit le voir. Le corps reste court et
 * ne divulgue ni URL de connexion ni version.
 */
export async function GET() {
  const startedAt = performance.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        status: 'ok',
        database: 'up',
        latencyMs: Math.round(performance.now() - startedAt),
        commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    console.error('[health] base injoignable', error)
    return NextResponse.json(
      { status: 'degraded', database: 'down' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
