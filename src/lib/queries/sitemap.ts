import 'server-only'
import { prisma } from '../db'
import { CHEMIN_PAR_TYPE } from './packs'
import { GENERATION_VISIBLE, MARQUE_VISIBLE, MODELE_VISIBLE } from './vehicules-visibles'

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

/**
 * Pages « Éclairage » par véhicule : marques, modèles, générations.
 *
 * Ce sont les pages qui répondent aux recherches « led + modèle » : elles
 * étaient absentes du plan de site. Mêmes filtres de visibilité que les pages
 * elles-mêmes (`vehicules-visibles.ts`), pour ne déclarer aucune adresse qui
 * répondrait « introuvable ».
 *
 * **Un modèle à une seule génération n'est pas déclaré.** Sa page ne fait que
 * renvoyer vers cette génération (51 mots pour la Clio 4) : la déclarer, c'est
 * proposer à Google une page mince en double de la suivante. La génération,
 * elle, l'est toujours.
 *
 * Une marque « auto et moto » (`BOTH`) n'a pas de pages de packs : elle est
 * laissée de côté, comme sur le site.
 */
export async function listSitemapPacks(): Promise<SitemapEntry[]> {
  const generations = await prisma.vehicleGeneration.findMany({
    where: {
      ...GENERATION_VISIBLE,
      model: { ...MODELE_VISIBLE, make: { ...MARQUE_VISIBLE, type: { in: ['CAR', 'MOTORCYCLE'] } } },
    },
    select: {
      slug: true,
      model: { select: { slug: true, make: { select: { slug: true, type: true } } } },
    },
  })

  const maintenant = new Date()
  const types = new Set<string>()
  const marques = new Set<string>()
  const generationsParModele = new Map<string, number>()
  const pages: SitemapEntry[] = []

  for (const generation of generations) {
    const { model } = generation
    const type = CHEMIN_PAR_TYPE[model.make.type as 'CAR' | 'MOTORCYCLE']
    const marque = `/packs/${type}/${model.make.slug}`
    const modele = `${marque}/${model.slug}`
    types.add(`/packs/${type}`)
    marques.add(marque)
    generationsParModele.set(modele, (generationsParModele.get(modele) ?? 0) + 1)
    pages.push({ path: `${modele}/${generation.slug}`, lastModified: maintenant })
  }

  return [
    ...[...types].map((path) => ({ path, lastModified: maintenant })),
    ...[...marques].map((path) => ({ path, lastModified: maintenant })),
    ...[...generationsParModele]
      .filter(([, nombre]) => nombre > 1)
      .map(([path]) => ({ path, lastModified: maintenant })),
    ...pages,
  ]
}
