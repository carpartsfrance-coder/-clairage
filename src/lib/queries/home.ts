import 'server-only'
import { prisma } from '@/lib/db'
import { demoHomeBlocks } from '../../../prisma/demo-data'

/**
 * Lectures de la page d'accueil.
 *
 * Chaque accès est tolérant à la panne : si PostgreSQL ne répond pas, la
 * section concernée reçoit une liste vide et s'efface, au lieu de faire tomber
 * la page entière. Rien n'est inventé pour compenser.
 */

export type HomeUniverse = {
  slug: string
  name: string
  description: string | null
  image: { url: string; alt: string } | null
}

export type HomeProduct = {
  slug: string
  name: string
  tagline: string | null
  /** Prix du conditionnement le moins cher, en centimes. */
  fromPriceCents: number
  /** Prix du kit complet, s'il existe et coûte plus que l'entrée de gamme. */
  kitPriceCents: number | null
  /** Vrai si le produit propose un kit complet en plus des ampoules seules. */
  hasKit: boolean
  categorySlug: string | null
  categoryName: string | null
  image: { url: string; alt: string } | null
}

export type HomeFaqItem = { question: string; answer: string }

/** Contenus éditoriaux : la table prend le pas sur les valeurs par défaut. */
export async function getHomeBlocks(): Promise<typeof demoHomeBlocks> {
  try {
    const rows = await prisma.homeBlock.findMany({ where: { enabled: true } })
    const fromDb = Object.fromEntries(rows.map((row) => [row.key, row.payload]))
    return { ...demoHomeBlocks, ...fromDb } as typeof demoHomeBlocks
  } catch (error) {
    console.error('[accueil] blocs éditoriaux indisponibles', error)
    return demoHomeBlocks
  }
}

export async function getUniverses(limit = 6): Promise<HomeUniverse[]> {
  try {
    const categories = await prisma.category.findMany({
      where: { published: true, parentId: null, heroMediaId: { not: null } },
      orderBy: { position: 'asc' },
      take: limit,
      include: { heroMedia: true },
    })
    return categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      image: category.heroMedia
        ? { url: category.heroMedia.url, alt: category.heroMedia.alt ?? category.name }
        : null,
    }))
  } catch (error) {
    console.error('[accueil] univers indisponibles', error)
    return []
  }
}

/**
 * Rubriques de la vitrine d'accueil.
 *
 * Elles servent deux fois : les raccourcis affichés au-dessus des cartes, et
 * le repli qui remplit la vitrine quand aucun produit n'est mis en avant. Les
 * tenir ici évite que les deux listes divergent — ce qui arriverait le jour
 * où l'une est modifiée sans l'autre.
 */
export const VITRINE_RUBRIQUES = [
  { slug: 'phares-led', label: 'Phares LED' },
  { slug: 'interieur', label: 'Intérieur' },
  { slug: 'plaque-recul', label: 'Plaque & recul' },
  { slug: 'xenon', label: 'Xénon' },
] as const

/** Ce que la requête doit charger pour composer une carte de vitrine. */
const CARTE_VITRINE = {
  variants: { where: { active: true }, orderBy: { priceCents: 'asc' } },
  media: { where: { role: 'PRODUCT' }, orderBy: { position: 'asc' }, take: 1, include: { media: true } },
  categories: { include: { category: true }, take: 1 },
} as const

/**
 * Produits de la vitrine d'accueil. Le prix affiché est celui du
 * conditionnement le moins cher — « à partir de » — pour ne pas annoncer un
 * total qui ne correspond à aucun panier possible.
 *
 * **Deux sources, dans cet ordre.** D'abord les produits cochés en
 * back-office : c'est le choix de l'exploitant, et il prime. À défaut, un
 * produit par rubrique de la vitrine.
 *
 * Ce repli existe parce que `featured` ne se pose qu'à la main : tout
 * environnement neuf — et la production l'a été pendant des jours — affichait
 * « Aucun produit publié pour le moment » avec des milliers de références au
 * catalogue. Une boutique qui ne montre rien sur sa page d'accueil paraît
 * vide, et elle ne l'est pas.
 *
 * **Le repli ne classe rien.** Une référence par famille, la première
 * référencée de chacune : c'est un échantillon de l'offre, pas un palmarès.
 * Rien ici ne dit qu'un produit se vend mieux qu'un autre, et le jour où
 * quelqu'un coche quatre produits, son choix reprend la main.
 */
export async function getFeaturedProducts(limit = 4): Promise<HomeProduct[]> {
  try {
    const choisis = await prisma.product.findMany({
      // Mise en avant éditoriale uniquement : un produit n'arrive ici que parce
      // qu'il a été coché en back-office, jamais parce qu'il se vendrait bien.
      where: { status: 'PUBLISHED', featured: true, variants: { some: { active: true } } },
      orderBy: [{ kind: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      include: CARTE_VITRINE,
    })

    const products = choisis.length > 0 ? choisis : await echantillonParRubrique(limit)

    return products
      .filter((product) => product.variants.length > 0)
      .map((product) => {
        const cheapest = product.variants[0]
        const cover = product.media[0]?.media
        const category = product.categories[0]?.category
        return {
          slug: product.slug,
          name: product.name,
          tagline: product.tagline,
          fromPriceCents: cheapest.priceCents,
          hasKit: product.variants.some((variant) => variant.packaging === 'KIT'),
          // Même règle que sur les listes : la pastille « kit » ne doit pas
          // surmonter le prix d'un autre conditionnement.
          kitPriceCents: (() => {
            const kits = product.variants
              .filter((variant) => variant.packaging === 'KIT')
              .map((variant) => variant.priceCents)
            if (kits.length === 0) return null
            const moinsCher = Math.min(...kits)
            return moinsCher > cheapest.priceCents ? moinsCher : null
          })(),
          categorySlug: category?.slug ?? null,
          categoryName: category?.name ?? null,
          image: cover ? { url: cover.url, alt: cover.alt ?? product.name } : null,
        }
      })
  } catch (error) {
    console.error('[accueil] produits mis en avant indisponibles', error)
    return []
  }
}

/**
 * Un produit par rubrique de la vitrine, dans l'ordre des rubriques.
 *
 * Les requêtes partent ensemble plutôt qu'en file : quatre lectures d'une
 * ligne chacune, sur un index, et la page d'accueil n'attend qu'un aller-
 * retour. Une rubrique sans produit publié ne rend rien et ne bloque pas les
 * autres — la vitrine se remplit avec ce qui existe.
 *
 * Le tri est `createdAt` croissant : la première référence de la famille.
 * C'est un ordre stable et vérifiable, qui n'affirme rien sur les ventes.
 */
async function echantillonParRubrique(limit: number) {
  const parRubrique = await Promise.all(
    VITRINE_RUBRIQUES.map((rubrique) =>
      prisma.product.findFirst({
        where: {
          status: 'PUBLISHED',
          variants: { some: { active: true } },
          categories: { some: { category: { slug: rubrique.slug, published: true } } },
        },
        orderBy: { createdAt: 'asc' },
        include: CARTE_VITRINE,
      }),
    ),
  )

  /*
    Dédoublonnage : un produit rattaché à deux rubriques de la vitrine
    remonterait deux fois, et la grille afficherait la même carte côte à côte.
  */
  const vus = new Set<string>()
  const retenus: NonNullable<(typeof parRubrique)[number]>[] = []

  for (const produit of parRubrique) {
    if (!produit || vus.has(produit.id)) continue
    vus.add(produit.id)
    retenus.push(produit)
    if (retenus.length === limit) break
  }

  return retenus
}

export async function getHomeFaq(limit = 4): Promise<HomeFaqItem[]> {
  try {
    const items = await prisma.faqItem.findMany({
      where: { published: true, scope: 'general' },
      orderBy: { position: 'asc' },
      take: limit,
      select: { question: true, answer: true },
    })
    return items
  } catch (error) {
    console.error('[accueil] FAQ indisponible', error)
    return []
  }
}
