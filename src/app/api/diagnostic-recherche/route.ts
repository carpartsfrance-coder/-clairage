import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * TEMPORAIRE (8 novembre 2026) : mesure de la recherche en production, pour
 * comprendre pourquoi une recherche nouvelle prend 3 à 20 s. Lecture seule ;
 * à retirer une fois la cause trouvée.
 */
const JETON = 'j6OLeLHbyfXQ6TDQ31wF7FG'

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('jeton') !== JETON) return new NextResponse('Introuvable', { status: 404 })
  const mots = (url.searchParams.get('q') ?? 'clignotant moto')
    .toLowerCase()
    .split(/\s+/)
    .filter((mot) => /^[a-z0-9éèêàùç-]{2,30}$/.test(mot))
    .slice(0, 4)
  const ou = (mot: string) => {
    const m = `'%${mot}%'`
    return `(p."name" ILIKE ${m} OR p."tagline" ILIKE ${m} OR p."description" ILIKE ${m} OR p."bulbBase" ILIKE ${m})`
  }
  const filtre = `p."status" = 'PUBLISHED' AND ${mots.map(ou).join(' AND ')} AND EXISTS (SELECT 1 FROM "ProductVariant" t2 WHERE t2."active" AND t2."productId" = p."id")`
  const resultat: Record<string, unknown> = { mots }
  const mesure = async (nom: string, sql: string) => {
    const debut = performance.now()
    const lignes = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(sql)
    resultat[nom] = { ms: Math.round(performance.now() - debut), plan: lignes.map((ligne) => Object.values(ligne)[0]) }
  }
  try {
    resultat.reglages = await prisma.$queryRawUnsafe(
      `SELECT name, setting FROM pg_settings WHERE name IN ('jit', 'jit_above_cost', 'shared_buffers', 'work_mem', 'effective_cache_size', 'server_version', 'max_parallel_workers_per_gather', 'random_page_cost')`,
    )
    resultat.tailles = await prisma.$queryRawUnsafe(
      `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total, pg_size_pretty(pg_relation_size(oid)) AS tas FROM pg_class WHERE relname IN ('Product', 'ProductVariant', 'ProductMedia', 'Fitment', 'ProductCategory', 'KitComponent') ORDER BY pg_total_relation_size(oid) DESC`,
    )
    await mesure('facette', `EXPLAIN (ANALYZE, BUFFERS) SELECT p."id", p."colorTemperature" FROM "Product" p WHERE ${filtre}`)
    await mesure(
      'liste_page2',
      `EXPLAIN (ANALYZE, BUFFERS) SELECT p."id" FROM "Product" p LEFT JOIN (SELECT "productId", COUNT(*) AS n FROM "ProductMedia" GROUP BY "productId") m ON m."productId" = p."id" WHERE ${filtre} ORDER BY p."featured" DESC, COALESCE(m.n, 0) DESC, p."name" ASC LIMIT 24 OFFSET 24`,
    )
  } catch (error) {
    resultat.erreur = String(error)
  }
  return NextResponse.json(resultat, { headers: { 'cache-control': 'no-store' } })
}
