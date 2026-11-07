import { prisma } from '@/lib/db'
import { identity, siteConfig } from '@/lib/identity'
import { availabilityForKit, availabilityForVariant } from '@/lib/stock'
import { getOffresParPays } from '@/lib/shipping'
import { construireFlux, type ArticleFlux } from '@/lib/flux-google'

export const dynamic = 'force-dynamic'

/**
 * Flux produits pour Google Merchant Center (fiches gratuites et Shopping).
 *
 * Adresse à donner dans Merchant Center : `/flux/google-shopping.xml`, en
 * récupération planifiée (une fois par jour suffit). Le contenu est construit
 * par `lib/flux-google.ts`.
 *
 * Mêmes barrières que le plan de site : produits publiés, hors démonstration,
 * et rien du tout tant que le site est en préproduction.
 */
export async function GET() {
  if (siteConfig.demoBanner) {
    return new Response('Flux désactivé en préproduction.', { status: 404 })
  }

  try {
    const [produits, offresParPays] = await Promise.all([
      prisma.product.findMany({
        where: { status: 'PUBLISHED', isDemo: false },
        orderBy: { createdAt: 'asc' },
        select: {
          slug: true,
          name: true,
          tagline: true,
          description: true,
          brand: true,
          categories: {
            orderBy: { position: 'asc' },
            take: 1,
            select: { category: { select: { name: true, parent: { select: { name: true } } } } },
          },
          media: {
            where: { role: { in: ['RESULT', 'PRODUCT', 'KIT_CONTENT'] } },
            orderBy: { position: 'asc' },
            select: { role: true, media: { select: { url: true } } },
          },
          variants: {
            where: { active: true, isDemo: false },
            orderBy: { position: 'asc' },
            select: {
              sku: true,
              name: true,
              priceCents: true,
              stockOnHand: true,
              stockReserved: true,
              lowStockThreshold: true,
              backorder: true,
              components: {
                select: {
                  quantity: true,
                  required: true,
                  component: {
                    select: {
                      sku: true,
                      name: true,
                      stockOnHand: true,
                      stockReserved: true,
                      lowStockThreshold: true,
                      backorder: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      getOffresParPays(),
    ])

    const articles: ArticleFlux[] = produits.map((produit) => {
      const categorie = produit.categories[0]?.category
      // La couverture d'abord, comme partout ailleurs sur le site : le rendu
      // (feu allumé sur le véhicule), puis le produit, puis le contenu du kit.
      const ordre = ['RESULT', 'PRODUCT', 'KIT_CONTENT']
      const images = [...produit.media]
        .sort((a, b) => ordre.indexOf(a.role) - ordre.indexOf(b.role))
        .map((entree) => entree.media.url)
      return {
        slug: produit.slug,
        name: produit.name,
        description: produit.description ?? produit.tagline,
        brand: produit.brand,
        productType: categorie
          ? categorie.parent
            ? `${categorie.parent.name} > ${categorie.name}`
            : categorie.name
          : null,
        images: [...new Set(images)],
        variants: produit.variants.map((variante) => ({
          sku: variante.sku,
          name: variante.name,
          priceCents: variante.priceCents,
          etat: (variante.components.length > 0
            ? availabilityForKit(variante.components)
            : availabilityForVariant(variante)
          ).state,
        })),
      }
    })

    const tarifs = Object.entries(offresParPays).map(([country, offres]) => ({
      country,
      modes: offres.map((offre) => ({
        label: offre.label,
        priceCents: offre.priceCents,
        freeFromCents: offre.freeFromCents,
      })),
    }))

    const { xml } = construireFlux({
      siteUrl: siteConfig.url,
      titre: identity.name,
      articles,
      tarifs,
    })

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[flux google]', error)
    return new Response('Flux momentanément indisponible.', { status: 503 })
  }
}
