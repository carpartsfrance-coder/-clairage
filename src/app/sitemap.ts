import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/identity'
import {
  listSitemapCategories,
  listSitemapGuides,
  listSitemapProducts,
} from '@/lib/queries/sitemap'

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

export const revalidate = 3600

/** Pages fixes, avec la priorité relative qu'on leur accorde. */
const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/vehicule', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/guides', priority: 0.7, changeFrequency: 'weekly' },
  // /faq n'y figure plus : l'adresse redirige vers /aide, qui porte les
  // questions. Déclarer une redirection dans un plan de site est une erreur
  // que Google signale.
  { path: '/aide', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/livraison-retours', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/garanties', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cgv', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/confidentialite', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.2, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  if (siteConfig.demoBanner) {
    return [{ url: siteConfig.url, lastModified: now, changeFrequency: 'daily', priority: 1 }]
  }

  const [products, categories, guides] = await Promise.all([
    listSitemapProducts(),
    listSitemapCategories(),
    listSitemapGuides(),
  ])

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
