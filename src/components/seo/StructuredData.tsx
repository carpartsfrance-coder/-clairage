import { identity, siteConfig } from '@/lib/identity'
import type { ProductView } from '@/lib/queries/product'

/**
 * Données structurées (schema.org, JSON-LD).
 *
 * Règle unique et sans exception ici : **on ne déclare que ce qui existe en
 * base.** Pas de note moyenne sans avis réels, pas de marque déduite du nom de
 * la boutique, pas de délai de livraison inventé, pas de `priceValidUntil`
 * arbitraire. Un balisage qui affirme plus que la page est une fausse
 * déclaration faite à un moteur de recherche — et, depuis les pages de
 * résultats enrichies, au visiteur.
 *
 * C'est aussi la raison du filtre de préproduction : en mode démonstration,
 * aucun balisage n'est émis. Déclarer un prix et une disponibilité pour une
 * fiche fictive serait exactement l'inverse de ce que le bandeau annonce.
 */

/**
 * schema.org attend des URL absolues. Une image déclarée « /demo/x.jpg » est
 * ignorée en silence par les validateurs, et la fiche perd son visuel dans les
 * résultats enrichis.
 */
function absolute(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${siteConfig.url}${url.startsWith('/') ? '' : '/'}${url}`
}

/** Sérialisation sûre : `<` échappé pour qu'aucun contenu ne ferme la balise. */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Le contenu est produit par `serialize`, pas par un tiers.
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Fiche produit                                                              */
/* -------------------------------------------------------------------------- */

/** Correspondance stock réel → vocabulaire schema.org. */
const AVAILABILITY_URLS: Record<string, string> = {
  IN_STOCK: 'https://schema.org/InStock',
  LOW_STOCK: 'https://schema.org/LimitedAvailability',
  BACKORDER: 'https://schema.org/BackOrder',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
}

export function ProductStructuredData({ product }: { product: ProductView }) {
  if (siteConfig.demoBanner) return null
  // Deuxième barrière, la même que celle du plan de site : une fiche de
  // démonstration ne doit pas être déclarée à un moteur de recherche avec un
  // prix et une disponibilité, même si le bandeau a été retiré par erreur.
  if (product.isDemo) return null

  const url = `${siteConfig.url}/p/${product.slug}`

  // Une offre par conditionnement réellement vendable, avec SON prix et SA
  // disponibilité. Un `AggregateOffer` avec une fourchette cacherait qu'un
  // conditionnement est en rupture.
  const offers = product.variants.map((variant) => ({
    '@type': 'Offer',
    url,
    sku: variant.sku,
    name: variant.name,
    priceCurrency: identity.locale.currency,
    price: (variant.priceCents / 100).toFixed(2),
    availability: AVAILABILITY_URLS[variant.availability.state] ?? 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: identity.name },
  }))

  // Note moyenne : calculée depuis les avis publiés, et absente s'il n'y en a
  // aucun. `product.reviews` ne contient que des avis réels et publiés.
  const published = product.reviews.filter((review) => review.publishedAt !== null)
  const aggregateRating =
    published.length > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: (
            published.reduce((sum, review) => sum + review.rating, 0) / published.length
          ).toFixed(1),
          reviewCount: published.length,
        }
      : undefined

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    description: product.metaDescription ?? product.description ?? product.tagline ?? undefined,
    image: product.gallery.map((item) => absolute(item.url)),
    // Renseignée seulement si la fiche porte une marque. Le nom de la boutique
    // n'est pas la marque de la pièce.
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    category: product.category?.name,
    // Caractéristiques techniques réelles, pas de valeur de remplissage.
    additionalProperty: [
      product.bulbBase ? { '@type': 'PropertyValue', name: 'Culot', value: product.bulbBase } : null,
      product.colorTemperature
        ? {
            '@type': 'PropertyValue',
            name: 'Température de couleur',
            value: `${product.colorTemperature} K`,
          }
        : null,
    ].filter(Boolean),
    offers,
    aggregateRating,
  }

  return <JsonLd data={data} />
}

/* -------------------------------------------------------------------------- */
/* Questions fréquentes de la fiche                                           */
/* -------------------------------------------------------------------------- */

export function FaqStructuredData({
  items,
}: {
  items: Array<{ question: string; answer: string }>
}) {
  if (siteConfig.demoBanner || items.length === 0) return null

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Fil d'Ariane                                                               */
/* -------------------------------------------------------------------------- */

export function BreadcrumbStructuredData({
  items,
}: {
  items: Array<{ label: string; href?: string }>
}) {
  if (siteConfig.demoBanner || items.length < 2) return null

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          item: item.href ? `${siteConfig.url}${item.href}` : undefined,
        })),
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Organisation (accueil)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Identité de l'organisation.
 *
 * Rendue uniquement si l'identité légale est renseignée : une `Organization`
 * sans dénomination réelle ni coordonnées ne déclare rien d'utile, et un
 * `telephone` ou une `address` inventés seraient trompeurs.
 */
export function OrganizationStructuredData() {
  if (siteConfig.demoBanner) return null
  if (!identity.legal.companyName) return null

  const contactPoints = []
  if (identity.contact.phone || identity.contact.email) {
    contactPoints.push({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: identity.contact.phone ?? undefined,
      email: identity.contact.email ?? undefined,
      availableLanguage: ['fr'],
    })
  }

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: identity.name,
        legalName: identity.legal.companyName,
        url: siteConfig.url,
        vatID: identity.legal.vatNumber ?? undefined,
        address: identity.legal.address
          ? { '@type': 'PostalAddress', streetAddress: identity.legal.address, addressCountry: 'FR' }
          : undefined,
        contactPoint: contactPoints.length > 0 ? contactPoints : undefined,
      }}
    />
  )
}
