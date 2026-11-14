import { NextResponse, connection } from 'next/server'
import { prisma } from '@/lib/db'
import { GENERATION_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { CHEMIN_PAR_TYPE } from '@/lib/queries/packs'
import { motsDeRecherche } from '@/lib/recherche-mots'

type Suggestion = { label: string; href: string; kind: 'véhicule' | 'produit' | 'référence' | 'culot' }

/**
 * Suggestions de recherche : véhicules, produits et culots.
 *
 * Rien n'est inventé. Si la requête ne correspond à aucune donnée réelle, la
 * liste revient vide et le champ n'ouvre pas de panneau.
 *
 * Parcours client du 10 novembre 2026 (Dacia Duster) :
 * - « duster » proposait six fiches, mais pas la page du véhicule, qui
 *   regroupe tout ce qui lui va : les véhicules passent en premier ;
 * - les mots se cherchent séparément (« dacia duster », « duster veilleuses ») ;
 *   une année tapée avec (« duster 2015 ») ne vide plus la liste ;
 * - les références internes (« LV-REPETITEURS-… ») ne sont plus proposées,
 *   sauf si le client tape lui-même une référence.
 */
export async function GET(request: Request) {
  // Jamais pré-rendu : la réponse dépend de la requête. `connection()` le dit
  // explicitement, là où l'ancien `dynamic = 'force-dynamic'` le réglait par
  // configuration de segment.
  await connection()

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (query.length < 2) return NextResponse.json({ items: [] })

  // Mêmes mots que la page de résultats : mots vides retirés (« pack »,
  // « led », « pour »…), synonymes, années ignorées s'il reste un autre mot.
  const mots = motsDeRecherche(query).slice(0, 5)
  const annee = query.split(/\s+/).map(Number).find((n) => n >= 1950 && n <= 2039) ?? null
  const referenceSaisie = /^lv-/i.test(query)
  if (mots.length === 0 && !referenceSaisie) return NextResponse.json({ items: [] })

  try {
    const [generations, products, variants, bases] = await Promise.all([
      prisma.vehicleGeneration.findMany({
        where: {
          ...GENERATION_VISIBLE,
          ...(annee
            ? { yearFrom: { lte: annee }, OR: [{ yearTo: null }, { yearTo: { gte: annee } }] }
            : {}),
          AND: mots.map((variantes) => ({
            OR: variantes.flatMap((mot) => [
              { name: { contains: mot.trim(), mode: 'insensitive' as const } },
              { model: { name: { contains: mot.trim(), mode: 'insensitive' as const } } },
              { model: { make: { name: { contains: mot.trim(), mode: 'insensitive' as const } } } },
            ]),
          })),
        },
        orderBy: [{ yearFrom: 'asc' }],
        select: {
          slug: true,
          name: true,
          yearFrom: true,
          yearTo: true,
          model: { select: { slug: true, make: { select: { slug: true, name: true, type: true } } } },
        },
        take: 3,
      }),
      prisma.product.findMany({
        where: {
          status: 'PUBLISHED',
          AND: mots.map((variantes) => ({
            OR: variantes.map((mot) => ({ name: { contains: mot, mode: 'insensitive' as const } })),
          })),
        },
        select: { slug: true, name: true },
        take: 6,
      }),
      referenceSaisie
        ? prisma.productVariant.findMany({
            where: {
              active: true,
              product: { status: 'PUBLISHED' },
              sku: { contains: query, mode: 'insensitive' },
            },
            select: { sku: true, product: { select: { slug: true, name: true } } },
            take: 4,
          })
        : Promise.resolve([]),
      prisma.product.findMany({
        where: { status: 'PUBLISHED', bulbBase: { startsWith: query, mode: 'insensitive' } },
        distinct: ['bulbBase'],
        select: { bulbBase: true },
        take: 4,
      }),
    ])

    const items: Suggestion[] = [
      ...generations.flatMap((g) => {
        const { make } = g.model
        if (make.type === 'BOTH') return []
        const annees = g.yearTo ? `${g.yearFrom}–${g.yearTo}` : `depuis ${g.yearFrom}`
        return [
          {
            label: `Tout l'éclairage ${make.name} ${g.name} (${annees})`,
            href: `/packs/${CHEMIN_PAR_TYPE[make.type]}/${make.slug}/${g.model.slug}/${g.slug}`,
            kind: 'véhicule' as const,
          },
        ]
      }),
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
