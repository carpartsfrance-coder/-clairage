import 'server-only'
import { prisma } from '../db'

/**
 * Lectures du plan de site.
 *
 * Deux règles qui expliquent les filtres ci-dessous :
 *
 *  1. **Rien de démonstration n'entre dans le plan de site.** Une fiche de
 *     démonstration déclarée à Google serait indexée, puis proposée à des
 *     visiteurs comme une offre réelle. Le filtre porte sur `isDemo`, pas sur
 *     le bandeau : le bandeau peut être retiré par erreur, le drapeau non.
 *
 *  2. **Une erreur de lecture ne produit pas un plan de site vide.** Elle est
 *     propagée : un sitemap vide servi en 200 dit à Google que le site n'a
 *     plus de pages, ce qui coûte beaucoup plus cher qu'une erreur visible.
 */

export type SitemapEntry = { path: string; lastModified: Date }

export async function listSitemapProducts(): Promise<SitemapEntry[]> {
  const rows = await prisma.product.findMany({
    where: { status: 'PUBLISHED', isDemo: false },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((row) => ({ path: `/p/${row.slug}`, lastModified: row.updatedAt }))
}

export async function listSitemapCategories(): Promise<SitemapEntry[]> {
  const rows = await prisma.category.findMany({
    where: {
      published: true,
      // Une catégorie dont tous les produits sont en démonstration ou en
      // brouillon mènerait à une page vide : on ne la déclare pas.
      products: { some: { product: { status: 'PUBLISHED', isDemo: false } } },
    },
    select: { slug: true, updatedAt: true },
  })
  return rows.map((row) => ({ path: `/c/${row.slug}`, lastModified: row.updatedAt }))
}

export async function listSitemapGuides(): Promise<SitemapEntry[]> {
  const rows = await prisma.guide.findMany({
    // Un guide n'a pas de statut : c'est la présence d'une date de publication
    // qui le rend public, et une date future le garde hors du plan de site.
    where: { publishedAt: { not: null, lte: new Date() } },
    select: { slug: true, updatedAt: true },
  })
  return rows.map((row) => ({ path: `/guides/${row.slug}`, lastModified: row.updatedAt }))
}
