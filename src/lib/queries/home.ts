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
 * Produits mis en avant. Le prix affiché est celui du conditionnement le moins
 * cher — « à partir de » — pour ne pas annoncer un total qui ne correspond à
 * aucun panier possible.
 */
export async function getFeaturedProducts(limit = 4): Promise<HomeProduct[]> {
  try {
    const products = await prisma.product.findMany({
      // Mise en avant éditoriale uniquement : un produit n'arrive ici que parce
      // qu'il a été coché en back-office, jamais parce qu'il se vendrait bien.
      where: { status: 'PUBLISHED', featured: true, variants: { some: { active: true } } },
      orderBy: [{ kind: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      include: {
        variants: { where: { active: true }, orderBy: { priceCents: 'asc' } },
        media: { where: { role: 'PRODUCT' }, orderBy: { position: 'asc' }, take: 1, include: { media: true } },
        categories: { include: { category: true }, take: 1 },
      },
    })

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
