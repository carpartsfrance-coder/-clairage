import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Suggestions de recherche : produits, références (SKU) et culots.
 *
 * Rien n'est inventé. Si la requête ne correspond à aucune donnée réelle, la
 * liste revient vide et le champ n'ouvre pas de panneau.
 */
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (query.length < 2) return NextResponse.json({ items: [] })

  try {
    const [products, variants, bases] = await Promise.all([
      prisma.product.findMany({
        where: { status: 'PUBLISHED', name: { contains: query, mode: 'insensitive' } },
        select: { slug: true, name: true },
        take: 6,
      }),
      prisma.productVariant.findMany({
        where: { active: true, sku: { contains: query, mode: 'insensitive' } },
        select: { sku: true, product: { select: { slug: true, name: true } } },
        take: 4,
      }),
      prisma.product.findMany({
        where: { status: 'PUBLISHED', bulbBase: { startsWith: query, mode: 'insensitive' } },
        distinct: ['bulbBase'],
        select: { bulbBase: true },
        take: 4,
      }),
    ])

    const items = [
      ...products.map((p) => ({ label: p.name, href: `/p/${p.slug}`, kind: 'produit' as const })),
      ...variants.map((v) => ({
        label: `${v.sku} — ${v.product.name}`,
        href: `/p/${v.product.slug}`,
        kind: 'référence' as const,
      })),
      ...bases
        .filter((b): b is { bulbBase: string } => Boolean(b.bulbBase))
        .map((b) => ({
          label: `Culot ${b.bulbBase}`,
          href: `/recherche?culot=${encodeURIComponent(b.bulbBase)}`,
          kind: 'culot' as const,
        })),
    ]

    return NextResponse.json({ items: items.slice(0, 8) })
  } catch (error) {
    console.error('[recherche/suggestions]', error)
    return NextResponse.json({ items: [] })
  }
}
