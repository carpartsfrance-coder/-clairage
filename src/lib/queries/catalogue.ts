import 'server-only'
import { motsDeRecherche } from '../recherche-mots'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { lectureCatalogue } from '../cache-catalogue'
import {
  bestStatus,
  fitmentSortWeight,
  resolveFitments,
  type FitmentStatus,
} from '../fitment'
import {
  availabilityForKit,
  availabilityForVariant,
  isPurchasable,
  type Availability,
} from '../stock'
import { recommendPackaging, recommendationReason } from '../recommendation'
import { ARGS_COUVERTURE, couverture } from '../media-couverture'
import { couvertureType } from '../images-types'

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
  /** Prix du conditionnement le moins cher. */
  fromPriceCents: number
  hasKit: boolean
  /**
   * Prix du kit complet, quand il en existe un ET qu'il coûte plus cher que
   * l'entrée de gamme.
   *
   * Sans lui, la carte portait la pastille « Le kit complet » au-dessus du
   * prix des ampoules seules : deux informations vraies, qui ensemble
   * annonçaient un kit à 69,90 € alors qu'il en coûte 99,90 €. Les deux prix
   * sont désormais affichés côte à côte, chacun avec son intitulé.
   */
  kitPriceCents: number | null
  /** Nombre de conditionnements proposés (ampoules seules, kit…). */
  variantCount: number
  availability: Availability
  /** `null` tant qu'aucun véhicule n'est sélectionné : on n'affirme rien. */
  fitment: FitmentStatus | null
  /**
   * Conditionnement conseillé pour le véhicule retenu.
   *
   * `null` sans véhicule, ou tant qu'aucun conditionnement n'est confirmé. La
   * règle est celle de `lib/recommendation.ts`, partagée avec la fiche produit
   * et les résultats véhicule : la carte met donc en avant le même prix que
   * ces deux écrans.
   */
  recommended: { priceCents: number; name: string; reason: string | null } | null
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
    // Une requête de comptage par rubrique : passe par le cache partagé du
    // catalogue (lib/cache-catalogue.ts), rien n'y dépend du visiteur.
    return await arborescenceEnCache()
  } catch (error) {
    console.error('[catalogue] arborescence indisponible', error)
    return []
  }
}

const arborescenceEnCache = lectureCatalogue('catalogue-arborescence-v1', lireArborescence)

async function lireArborescence(): Promise<CatalogueCategory[]> {
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
  try {
    /*
      Sans véhicule choisi, la liste ne dépend que des filtres : elle passe par
      le cache partagé du catalogue (lib/cache-catalogue.ts). C'est le cas de
      la plupart des visiteurs et de tous les robots d'indexation. Les
      facettes relisent tout le périmètre de la rubrique — plusieurs milliers
      de produits pour les phares — et cela se payait à chaque page vue.
      Avec un véhicule, la compatibilité de chaque produit est propre au
      visiteur : la lecture reste directe.
    */
    return configurationId
      ? await lireListe(filters, configurationId)
      : await listeEnCache(filters)
  } catch (error) {
    console.error('[catalogue] liste indisponible', error)
    return {
      items: [],
      total: 0,
      page: Math.max(1, filters.page ?? 1),
      perPage: Math.min(60, filters.perPage ?? PER_PAGE),
      pageCount: 1,
      facets: { bases: [], temperatures: [], packagings: [] },
    }
  }
}

const listeEnCache = lectureCatalogue('catalogue-liste-v2', (filters: CatalogueFilters) =>
  lireListe(filters, null),
)

/**
 * Le `where` se compose à la carte, parce que les facettes ont besoin de
 * variantes de ce même filtre : une facette doit être comptée avec SON
 * propre critère retiré. Sinon, cocher « H7 » fait disparaître tous les
 * autres culots de la liste, et la sélection multiple devient impossible —
 * alors même que l'interface la promet.
 */
function buildWhere(
  filters: CatalogueFilters,
  skip?: 'bases' | 'temperatures' | 'packagings',
): Prisma.ProductWhereInput {
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
    /*
      La référence (SKU) n'est cherchée que si la saisie y ressemble
      (« LUM-PK-HEAD-…-1683 ») : c'était la partie la plus lente de chaque
      recherche (toute la table des variantes relue pour chaque mot, sans index
      possible), pour des mots — marque, modèle, emplacement — que le nom de la
      fiche porte déjà. Les quatre champs restants ont un index trigrammes
      (migration 20261108230000).
    */
    const referenceSaisie = /^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)+$/u.test(q) && /\d/.test(q)
    const champs = (texte: string): Prisma.ProductWhereInput[] => [
      { name: { contains: texte, mode: 'insensitive' } },
      { tagline: { contains: texte, mode: 'insensitive' } },
      { description: { contains: texte, mode: 'insensitive' } },
      { bulbBase: { contains: texte, mode: 'insensitive' } },
      ...(referenceSaisie
        ? [{ variants: { some: { sku: { contains: texte, mode: 'insensitive' as const } } } }]
        : []),
    ]
    // Chaque mot utile doit se trouver dans la fiche, dans n'importe quel
    // ordre (lib/recherche-mots.ts) ; sans mot utile, la phrase entière.
    const mots = motsDeRecherche(q)
    if (mots.length > 0) {
      // Un nombre ou un mot très court (« 4 », « 308 », « H7 ») ne se cherche
      // que dans le nom et le culot : ailleurs, il se retrouvait dans toutes
      // les références (SKU) et les descriptions.
      const court = (texte: string) => /^\s?[\p{N}IVX]+$/iu.test(texte) || texte.trim().length <= 3
      clause.AND = mots.map((variantes) => ({
        OR: variantes.flatMap((texte) =>
          court(texte)
            ? [
                { name: { contains: texte, mode: 'insensitive' as const } },
                { bulbBase: { contains: texte, mode: 'insensitive' as const } },
              ]
            : champs(texte),
        ),
      }))
    } else {
      clause.OR = champs(q)
    }
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


/** Lit une page de la liste et ses facettes. Lève si la base ne répond pas. */
async function lireListe(
  filters: CatalogueFilters,
  configurationId: string | null,
): Promise<CatalogueResult> {
  const page = Math.max(1, filters.page ?? 1)
  const perPage = Math.min(60, filters.perPage ?? PER_PAGE)
  const sort = filters.sort ?? 'pertinence'

  const where = buildWhere(filters)

  const [{ total, facets }, rows] = await Promise.all([
    /*
      Le total et les facettes ne dépendent que des filtres — ni de la page,
      ni du tri, ni du véhicule : ils passent par le cache partagé même pour
      un visiteur qui a choisi son véhicule. Ce sont les lectures les plus
      lourdes de la liste (tout le périmètre de la rubrique, trois fois).
    */
    comptesEnCache(perimetre(filters)),
    prisma.product.findMany({
      where,
      orderBy:
        sort === 'nouveautes'
          ? { publishedAt: 'desc' }
          : sort === 'pertinence'
            ? /*
                Après la mise en avant du back-office, les fiches qui ont
                leurs propres visuels (le feu allumé sur leur véhicule)
                passent devant celles qui n'ont que les images types. Par
                ordre alphabétique seul, une rubrique s'ouvrait sur des Alfa
                Romeo sans photo, et les packs les mieux montrés étaient
                relégués en page 20.
              */
              [{ featured: 'desc' }, { media: { _count: 'desc' } }, { name: 'asc' }]
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
          ...ARGS_COUVERTURE,
          include: { media: true },
        },
        categories: { include: { category: true }, take: 1 },
      },
    }),
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
      const cover = couverture(product.media)?.media ?? couvertureType(product)
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
        // Le moins cher des kits : c'est celui que la pastille désigne. On ne
        // le renvoie que s'il est plus cher que l'entrée de gamme, sinon les
        // deux prix affichés seraient le même nombre.
        kitPriceCents: (() => {
          const kits = product.variants
            .filter((variant) => variant.packaging === 'KIT')
            .map((variant) => variant.priceCents)
          if (kits.length === 0) return null
          const moinsCher = Math.min(...kits)
          return moinsCher > cheapest.priceCents ? moinsCher : null
        })(),
        variantCount: product.variants.length,
        availability,
        fitment: configurationId ? bestStatus(statuses) : null,
        recommended: (() => {
          if (!configurationId) return null

          const candidats = product.variants.map((variant) => {
            const fitment = fitments.get(variant.id)
            const fournis = new Set(variant.components.map((entry) => entry.componentId))
            return {
              id: variant.id,
              name: variant.name,
              priceCents: variant.priceCents,
              status: fitment?.status ?? 'UNKNOWN',
              purchasable: isPurchasable(
                variant.components.length > 0
                  ? availabilityForKit(
                      variant.components.map((entry) => ({
                        quantity: entry.quantity,
                        required: entry.required,
                        component: entry.component,
                      })),
                    )
                  : availabilityForVariant(variant),
              ),
              missingRequired: (fitment?.accessories ?? []).filter(
                (accessoire) => accessoire.required && !fournis.has(accessoire.variantId),
              ).length,
            }
          })

          const retenu = recommendPackaging(candidats)
          if (!retenu) return null
          return {
            priceCents: retenu.priceCents,
            name: retenu.name,
            reason: recommendationReason(retenu, candidats),
          }
        })(),
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
    facets,
  }
}

/** Le périmètre d'une liste : ses filtres, sans la page, le tri ni la taille de page. */
function perimetre(filters: CatalogueFilters): CatalogueFilters {
  const { page: _page, sort: _tri, perPage: _taille, ...reste } = filters
  return reste
}

const comptesEnCache = lectureCatalogue('catalogue-comptes-v1', lireComptes)

/** Total et facettes d'un périmètre. Lève si la base ne répond pas. */
async function lireComptes(
  filters: CatalogueFilters,
): Promise<{ total: number; facets: CatalogueResult['facets'] }> {
  const [total, facetRows] = await Promise.all([
    prisma.product.count({ where: buildWhere(filters) }),
    // Les facettes se calculent sur l'ensemble du périmètre, pas sur la page,
    // et chacune avec son propre critère neutralisé (voir buildWhere).
    Promise.all([
      prisma.product.findMany({
        where: buildWhere(filters, 'bases'),
        select: { bulbBase: true },
      }),
      prisma.product.findMany({
        where: buildWhere(filters, 'temperatures'),
        select: { colorTemperature: true },
      }),
      prisma.product.findMany({
        where: buildWhere(filters, 'packagings'),
        select: { variants: { where: { active: true }, select: { packaging: true } } },
      }),
    ]),
  ])
  return { total, facets: buildFacets(facetRows) }
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
