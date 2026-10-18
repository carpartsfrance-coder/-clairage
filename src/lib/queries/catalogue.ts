import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import {
  bestStatus,
  fitmentSortWeight,
  resolveFitments,
  type FitmentStatus,
} from '../fitment'
import { availabilityForKit, availabilityForVariant, type Availability } from '../stock'

/**
 * Lectures du catalogue : index des catégories, listes filtrées, recherche.
 *
 * La compatibilité n'est jamais un critère SQL. Elle est résolue après coup,
 * pour une raison de fond : filtrer en base sur l'existence d'une ligne
 * `Fitment` reviendrait à faire disparaître silencieusement tout ce qui n'est
 * pas documenté. Or « non documenté » doit se voir, et se dire.
 */

export type CatalogueCategory = {
  slug: string
  name: string
  description: string | null
  family: string
  image: { url: string; alt: string } | null
  productCount: number
  children: Array<{ slug: string; name: string }>
}

export type ProductListItem = {
  slug: string
  name: string
  tagline: string | null
  bulbBase: string | null
  colorTemperature: number | null
  categoryName: string | null
  categorySlug: string | null
  image: { url: string; alt: string } | null
  fromPriceCents: number
  hasKit: boolean
  /** Nombre de conditionnements proposés (ampoules seules, kit…). */
  variantCount: number
  availability: Availability
  /** `null` tant qu'aucun véhicule n'est sélectionné : on n'affirme rien. */
  fitment: FitmentStatus | null
}

export type SortKey = 'pertinence' | 'prix-croissant' | 'prix-decroissant' | 'nouveautes'

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'pertinence', label: 'Pertinence' },
  { value: 'prix-croissant', label: 'Prix croissant' },
  { value: 'prix-decroissant', label: 'Prix décroissant' },
  { value: 'nouveautes', label: 'Nouveautés' },
]

export type CatalogueFilters = {
  categorySlug?: string
  query?: string
  /** Culots retenus (H7, D1S, W5W…). */
  bases?: string[]
  /** Températures de couleur en kelvins. */
  temperatures?: number[]
  packagings?: string[]
  vehicleType?: 'CAR' | 'MOTORCYCLE'
  sort?: SortKey
  page?: number
  perPage?: number
}

export type Facet = { value: string; label: string; count: number }

export type CatalogueResult = {
  items: ProductListItem[]
  total: number
  page: number
  perPage: number
  pageCount: number
  facets: {
    bases: Facet[]
    temperatures: Facet[]
    packagings: Facet[]
  }
}

const PER_PAGE = 24

const PACKAGING_LABELS: Record<string, string> = {
  UNIT: "À l'unité",
  PAIR: 'La paire',
  PACK: 'Pack',
  KIT: 'Kit complet',
}

/** Index des catégories racines, avec le nombre de produits publiés. */
export async function getCategoryTree(): Promise<CatalogueCategory[]> {
  try {
    const categories = await prisma.category.findMany({
      where: { published: true, parentId: null },
      orderBy: { position: 'asc' },
      include: {
        heroMedia: true,
        children: {
          where: { published: true },
          orderBy: { position: 'asc' },
          select: { slug: true, name: true },
        },
      },
    })

    /**
     * Le compteur doit annoncer exactement ce que la page de catégorie
     * listera : les produits de la catégorie ET de ses sous-catégories, et
     * seulement ceux qui ont au moins une variante active. Compter autrement
     * promet « 7 produits » et en affiche 23, ou l'inverse.
     */
    const counts = await Promise.all(
      categories.map((category) =>
        prisma.product.count({
          where: {
            status: 'PUBLISHED',
            variants: { some: { active: true } },
            categories: {
              some: {
                category: {
                  OR: [{ slug: category.slug }, { parent: { slug: category.slug } }],
                },
              },
            },
          },
        }),
      ),
    )

    return categories.map((category, index) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      family: category.family,
      image: category.heroMedia
        ? { url: category.heroMedia.url, alt: category.heroMedia.alt ?? category.name }
        : null,
      productCount: counts[index],
      children: category.children,
    }))
  } catch (error) {
    console.error('[catalogue] arborescence indisponible', error)
    return []
  }
}

export async function getCategory(slug: string) {
  try {
    return await prisma.category.findFirst({
      where: { slug, published: true },
      include: {
        heroMedia: true,
        parent: { select: { slug: true, name: true } },
        children: {
          where: { published: true },
          orderBy: { position: 'asc' },
          select: { slug: true, name: true },
        },
      },
    })
  } catch (error) {
    console.error('[catalogue] catégorie indisponible', error)
    return null
  }
}

/**
 * Liste filtrée et paginée.
 *
 * `configurationId` ne restreint pas les résultats : il sert uniquement à
 * teinter chaque produit de son statut de compatibilité, et à remonter les
 * compatibles en tête quand le tri est « pertinence ».
 */
export async function listProducts(
  filters: CatalogueFilters,
  configurationId: string | null = null,
): Promise<CatalogueResult> {
  const page = Math.max(1, filters.page ?? 1)
  const perPage = Math.min(60, filters.perPage ?? PER_PAGE)
  const sort = filters.sort ?? 'pertinence'

  /**
   * Le `where` se compose à la carte, parce que les facettes ont besoin de
   * variantes de ce même filtre : une facette doit être comptée avec SON
   * propre critère retiré. Sinon, cocher « H7 » fait disparaître tous les
   * autres culots de la liste, et la sélection multiple devient impossible —
   * alors même que l'interface la promet.
   */
  function buildWhere(skip?: 'bases' | 'temperatures' | 'packagings'): Prisma.ProductWhereInput {
    const clause: Prisma.ProductWhereInput = { status: 'PUBLISHED' }

    if (filters.categorySlug) {
      // Une catégorie racine ramène aussi les produits de ses sous-catégories.
      clause.categories = {
        some: {
          category: {
            OR: [{ slug: filters.categorySlug }, { parent: { slug: filters.categorySlug } }],
          },
        },
      }
    }

    if (filters.query) {
      const q = filters.query.trim()
      clause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { tagline: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { bulbBase: { contains: q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
      ]
    }

    if (filters.vehicleType) clause.vehicleType = { in: [filters.vehicleType, 'BOTH'] }
    if (skip !== 'bases' && filters.bases?.length) clause.bulbBase = { in: filters.bases }
    if (skip !== 'temperatures' && filters.temperatures?.length) {
      clause.colorTemperature = { in: filters.temperatures }
    }

    // Un produit sans variante active n'est pas achetable : il ne doit
    // apparaître ni dans la liste, ni dans les compteurs.
    clause.variants =
      skip !== 'packagings' && filters.packagings?.length
        ? {
            some: {
              active: true,
              packaging: { in: filters.packagings as Prisma.EnumPackagingFilter['in'] },
            },
          }
        : { some: { active: true } }

    return clause
  }

  const where = buildWhere()

  try {
    const [total, rows, facetRows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy:
          sort === 'nouveautes'
            ? { publishedAt: 'desc' }
            : sort === 'pertinence'
              ? [{ featured: 'desc' }, { name: 'asc' }]
              : { name: 'asc' },
        // Le tri par prix et le classement par compatibilité portent sur des
        // valeurs dérivées (prix mini des variantes, statut du fitment) : ils
        // sont appliqués après lecture, sur la page courante.
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          variants: {
            where: { active: true },
            orderBy: { priceCents: 'asc' },
            include: { components: { include: { component: true } } },
          },
          media: {
            where: { role: 'PRODUCT' },
            orderBy: { position: 'asc' },
            take: 1,
            include: { media: true },
          },
          categories: { include: { category: true }, take: 1 },
        },
      }),
      // Les facettes se calculent sur l'ensemble du périmètre, pas sur la page,
      // et chacune avec son propre critère neutralisé (voir buildWhere).
      Promise.all([
        prisma.product.findMany({
          where: buildWhere('bases'),
          select: { bulbBase: true },
        }),
        prisma.product.findMany({
          where: buildWhere('temperatures'),
          select: { colorTemperature: true },
        }),
        prisma.product.findMany({
          where: buildWhere('packagings'),
          select: { variants: { where: { active: true }, select: { packaging: true } } },
        }),
      ]),
    ])

    const variantIds = rows.flatMap((product) => product.variants.map((variant) => variant.id))
    const fitments = await resolveFitments(configurationId, variantIds)

    let items: ProductListItem[] = rows
      .filter((product) => product.variants.length > 0)
      .map((product) => {
        // Quand un conditionnement est filtré, le prix annoncé doit être celui
        // d'un conditionnement retenu. Sans cela, filtrer sur « Kit complet »
        // afficherait « à partir de 69,90 € » alors qu'aucun kit ne coûte ce
        // prix — un prix que le client ne retrouvera nulle part.
        const eligible = filters.packagings?.length
          ? product.variants.filter((variant) =>
              filters.packagings!.includes(variant.packaging),
            )
          : product.variants
        const cheapest = eligible[0] ?? product.variants[0]
        const cover = product.media[0]?.media
        const category = product.categories[0]?.category

        // La disponibilité affichée est celle du conditionnement le moins cher :
        // c'est celui dont le prix est annoncé.
        const availability =
          cheapest.components.length > 0
            ? availabilityForKit(
                cheapest.components.map((entry) => ({
                  quantity: entry.quantity,
                  required: entry.required,
                  component: entry.component,
                })),
              )
            : availabilityForVariant(cheapest)

        const statuses = product.variants
          .map((variant) => fitments.get(variant.id)?.status)
          .filter((status): status is FitmentStatus => Boolean(status))

        return {
          slug: product.slug,
          name: product.name,
          tagline: product.tagline,
          bulbBase: product.bulbBase,
          colorTemperature: product.colorTemperature,
          categoryName: category?.name ?? null,
          categorySlug: category?.slug ?? null,
          image: cover ? { url: cover.url, alt: cover.alt ?? product.name } : null,
          fromPriceCents: cheapest.priceCents,
          hasKit: product.variants.some((variant) => variant.packaging === 'KIT'),
          variantCount: product.variants.length,
          availability,
          fitment: configurationId ? bestStatus(statuses) : null,
        }
      })

    if (sort === 'prix-croissant') {
      items = items.sort((a, b) => a.fromPriceCents - b.fromPriceCents)
    } else if (sort === 'prix-decroissant') {
      items = items.sort((a, b) => b.fromPriceCents - a.fromPriceCents)
    } else if (sort === 'pertinence' && configurationId) {
      // Confirmé d'abord, incompatible en dernier — mais rien n'est caché.
      items = items.sort(
        (a, b) =>
          fitmentSortWeight[a.fitment ?? 'UNKNOWN'] - fitmentSortWeight[b.fitment ?? 'UNKNOWN'],
      )
    }

    return {
      items,
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
      facets: buildFacets(facetRows),
    }
  } catch (error) {
    console.error('[catalogue] liste indisponible', error)
    return {
      items: [],
      total: 0,
      page,
      perPage,
      pageCount: 1,
      facets: { bases: [], temperatures: [], packagings: [] },
    }
  }
}

function buildFacets(
  sets: [
    Array<{ bulbBase: string | null }>,
    Array<{ colorTemperature: number | null }>,
    Array<{ variants: Array<{ packaging: string }> }>,
  ],
): CatalogueResult['facets'] {
  const [baseRows, temperatureRows, packagingRows] = sets
  const bases = new Map<string, number>()
  const temperatures = new Map<number, number>()
  const packagings = new Map<string, number>()

  for (const row of baseRows) {
    if (row.bulbBase) bases.set(row.bulbBase, (bases.get(row.bulbBase) ?? 0) + 1)
  }
  for (const row of temperatureRows) {
    if (row.colorTemperature) {
      temperatures.set(row.colorTemperature, (temperatures.get(row.colorTemperature) ?? 0) + 1)
    }
  }
  for (const row of packagingRows) {
    // Un produit n'est compté qu'une fois par conditionnement, même s'il a
    // plusieurs variantes du même type.
    for (const packaging of new Set(row.variants.map((variant) => variant.packaging))) {
      packagings.set(packaging, (packagings.get(packaging) ?? 0) + 1)
    }
  }

  return {
    bases: [...bases.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    temperatures: [...temperatures.entries()]
      // Séparateur de milliers français : « 6 000 K », pas « 6000 K ».
      .map(([value, count]) => ({
        value: String(value),
        label: `${value.toLocaleString('fr-FR')} K`,
        count,
      }))
      .sort((a, b) => Number(a.value) - Number(b.value)),
    packagings: [...packagings.entries()]
      .map(([value, count]) => ({ value, label: PACKAGING_LABELS[value] ?? value, count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  }
}

/**
 * Alternatives à proposer quand une recherche ne donne rien.
 * On part du culot deviné dans la requête, puis on retombe sur les catégories.
 */
export async function getSearchFallbacks(query: string): Promise<{
  bases: string[]
  categories: Array<{ slug: string; name: string }>
}> {
  const trimmed = query.trim()

  async function basesMatching(prefix: string | null) {
    const rows = await prisma.product.findMany({
      where: {
        status: 'PUBLISHED',
        bulbBase: prefix
          ? { startsWith: prefix, mode: 'insensitive' }
          : { not: null },
      },
      distinct: ['bulbBase'],
      select: { bulbBase: true },
      take: 6,
    })
    return rows.map((row) => row.bulbBase).filter((base): base is string => Boolean(base))
  }

  try {
    const [bases, categories] = await Promise.all([
      // D'abord les culots qui ressemblent à la requête ; si elle ne ressemble
      // à rien de connu, on propose quand même les culots réellement au
      // catalogue, plutôt que de laisser le client sans porte de sortie.
      basesMatching(trimmed.length >= 2 ? trimmed.slice(0, 2) : null).then((found) =>
        found.length > 0 ? found : basesMatching(null),
      ),
      prisma.category.findMany({
        where: { published: true, parentId: null },
        orderBy: { position: 'asc' },
        select: { slug: true, name: true },
        take: 6,
      }),
    ])

    return { bases, categories }
  } catch (error) {
    console.error('[catalogue] alternatives indisponibles', error)
    return { bases: [], categories: [] }
  }
}
