import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { siteConfig } from '@/lib/identity'
import {
  listSitemapCategories,
  listSitemapGuides,
  listSitemapPacks,
  listSitemapProducts,
} from '@/lib/queries/sitemap'
import { STATIC_PAGES } from '@/lib/sitemap-pages'

/**
 * Plan de site.
 *
 * Tant que le site est en préproduction (`NEXT_PUBLIC_DEMO_MODE` ≠ « off »),
 * **il ne déclare que l'accueil**. Les pages sont en noindex à ce stade : un
 * plan de site complet qui pointerait sur des pages refusant l'indexation est
 * contradictoire, et Google le signale comme une erreur de configuration.
 *
 * Les pages personnelles (compte, panier, paiement, suivi, administration) n'y
 * figurent jamais : elles n'ont rien à indexer et, pour certaines, leur URL
 * porte un jeton d'accès.
 */

/*
  Construit à la demande, jamais pendant le build.

  Le 7 novembre 2026, deux déploiements ont échoué sur ce plan : pré-rendu au
  build, il lisait la base pendant que d'autres pages la lisaient aussi, et la
  petite base PostgreSQL de Render (256 Mo) a lâché — connexions coupées, puis
  serveur injoignable. Le build s'arrêtait, et le site en ligne ralentissait.
  Lu à la demande, une erreur de base ne casse plus un déploiement ; et les
  lectures se font l'une après l'autre, pour ne tenir qu'une connexion.
*/
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  const now = new Date()

  if (siteConfig.demoBanner) {
    return [{ url: siteConfig.url, lastModified: now, changeFrequency: 'daily', priority: 1 }]
  }

  const products = await listSitemapProducts()
  const categories = await listSitemapCategories()
  const guides = await listSitemapGuides()
  const packs = await listSitemapPacks()

  return [
    ...STATIC_PAGES.map((page) => ({
      url: `${siteConfig.url}${page.path}`,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...categories.map((entry) => ({
      url: `${siteConfig.url}${entry.path}`,
      lastModified: entry.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    // Les pages véhicule (« Éclairage Renault Clio 4 ») : celles qui reçoivent
    // les recherches « led + modèle ».
    ...packs.map((entry) => ({
      url: `${siteConfig.url}${entry.path}`,
      lastModified: entry.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...products.map((entry) => ({
      url: `${siteConfig.url}${entry.path}`,
      lastModified: entry.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...guides.map((entry) => ({
      url: `${siteConfig.url}${entry.path}`,
      lastModified: entry.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ]
}
