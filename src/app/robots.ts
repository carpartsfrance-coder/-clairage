import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/identity'

/**
 * robots.txt
 *
 * En préproduction, tout est refusé. C'est la deuxième barrière : la première
 * est l'en-tête `noindex` posé par la mise en page racine. Deux mécanismes
 * indépendants, parce qu'une boutique indexée par erreur avec des données de
 * démonstration se désindexe lentement et se voit longtemps.
 *
 * En production, le refus porte sur ce qui n'a rien à indexer : back-office,
 * espace client, tunnel de commande, et surtout `/suivi` et `/commande`, dont
 * les URL peuvent porter un jeton d'accès à une commande. Une telle URL
 * crawlée puis publiée dans un rapport d'indexation est une fuite.
 */

export default function robots(): MetadataRoute.Robots {
  if (siteConfig.demoBanner) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api/',
          '/compte',
          '/panier',
          // Le tunnel, pas la page « Moyens de paiement » (/paiement), qui est
          // un contenu public et doit rester indexable.
          '/commande',
          '/suivi',
          '/connexion',
          '/inscription',
          '/mot-de-passe-oublie',
          // Les URL de recherche interne produisent une infinité de
          // combinaisons de filtres sans valeur propre.
          '/recherche',
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}
