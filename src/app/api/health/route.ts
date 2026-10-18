import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assessEnvironment } from '@/lib/readiness'

export const dynamic = 'force-dynamic'

/**
 * Route de vérification de santé consommée par Render.
 *
 * Elle teste la base : un serveur qui répond alors que PostgreSQL est
 * injoignable n'est pas sain, et Render doit le voir. Le corps reste court et
 * ne divulgue ni URL de connexion ni version.
 *
 * Elle rapporte aussi l'état de la configuration, mais **sans faire échouer le
 * contrôle** : un paiement simulé ou un stockage mal réglé n'empêche pas
 * l'instance de servir des pages, et refuser le déploiement pour cela
 * empêcherait précisément de corriger la configuration depuis le back-office.
 * Le détail reste donc visible dans le corps — seules les clés manquantes sont
 * nommées, jamais une valeur.
 */
export async function GET() {
  const startedAt = performance.now()
  const environment = assessEnvironment()

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        status: 'ok',
        database: 'up',
        latencyMs: Math.round(performance.now() - startedAt),
        commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
        configuration: {
          readyToOpen: environment.mayOpen,
          blocking: environment.checks
            .filter((check) => check.state === 'blocking')
            .map((check) => check.key),
          warnings: environment.checks
            .filter((check) => check.state === 'warn')
            .map((check) => check.key),
        },
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
