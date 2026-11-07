import type { MetadataRoute } from 'next'

/**
 * Pages fixes, avec la priorité relative qu'on leur accorde.
 *
 * **Seulement des pages ouvertes à Google.** Le plan déclarait aussi /guides,
 * /confidentialite et /cookies alors qu'elles étaient des pages « en
 * préparation » fermées à l'indexation (`noindex`) : Google le signale comme
 * une erreur (« URL envoyée marquée noindex »). La confidentialité et les
 * cookies sont revenues le 7 novembre 2026, avec un vrai contenu ; /guides
 * reviendra de la même façon. tests/sitemap-pages.test.ts vérifie que
 * chaque page listée ici n'est pas en `noindex`.
 */
export const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/vehicule', priority: 0.9, changeFrequency: 'weekly' },
  // /faq n'y figure plus : l'adresse redirige vers /aide, qui porte les
  // questions. Déclarer une redirection dans un plan de site est une erreur
  // que Google signale.
  { path: '/aide', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/livraison-retours', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/garanties', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cgv', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/confidentialite', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.1, changeFrequency: 'yearly' },
]
