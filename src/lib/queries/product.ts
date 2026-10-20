import 'server-only'
import { prisma } from '../db'
import {
  resolveFitments,
  type FitmentResult,
  type FitmentStatus,
  type RequiredAccessory,
} from '../fitment'
import {
  availabilityForKit,
  availabilityForVariant,
  isPurchasable,
  type Availability,
} from '../stock'
import { recommendPackaging } from '../recommendation'

/**
 * Lecture d'une fiche produit.
 *
 * Deux principes gouvernent ce fichier :
 *
 * 1. **Aucune recommandation sans véhicule.** Tant qu'aucune configuration
 *    n'est sélectionnée, `recommendedVariantId` reste nul et la fiche ne
 *    désigne pas de conditionnement « pour votre véhicule ».
 * 2. **Les accessoires nécessaires sont ceux que le kit ne contient pas.** Un
 *    kit qui inclut déjà ses adaptateurs ne doit pas les reproposer à l'achat.
 */

export type GalleryItem = {
  url: string
  alt: string
  caption: string | null
  role: 'PRODUCT' | 'RESULT' | 'KIT_CONTENT' | 'INSTALL'
  /** Libellé de la vignette, repris de la maquette. */
  thumbLabel: string
  /**
   * Nature du visuel, telle qu'elle est enregistrée dans la médiathèque.
   *
   * Elle remonte jusqu'à la fiche parce que le schéma l'exige : une
   * illustration ou un rendu simulé « doit être signalé au client »
   * (`MediaNature`). La galerie ne peut pas tenir cette promesse si elle ne
   * sait pas ce qu'elle affiche.
   */
  nature: 'UNSPECIFIED' | 'PRODUCT_PHOTO' | 'ILLUSTRATION' | 'TEST_PHOTO' | 'DIAGRAM'
}

export type VariantView = {
  id: string
  sku: string
  name: string
  packaging: 'UNIT' | 'PAIR' | 'PACK' | 'KIT'
  priceCents: number
  compareAtCents: number | null
  availability: Availability
  /** Composition, pour un kit. */
  components: Array<{
    sku: string
    productSlug: string
    productName: string
    variantName: string
    quantity: number
    required: boolean
    /**
     * Prix de ce composant vendu seul, pour la quantité incluse.
     *
     * Il sert à montrer ce que le kit réunit, pas à décomposer son prix : la
     * somme des composants ne fait pas le prix du kit, et c'est précisément ce
     * qu'il faut pouvoir dire au client.
     */
    priceCents: number
  }>
  fitment: FitmentResult
  /** Accessoires exigés par le montage et absents de ce conditionnement. */
  missingAccessories: RequiredAccessory[]
}

export type ProductView = {
  slug: string
  name: string
  tagline: string | null
  description: string | null
  body: string | null
  /** Marque de la pièce, quand elle est renseignée. Jamais déduite. */
  brand: string | null
  /** Fiche de démonstration : exclue du plan de site et des données structurées. */
  isDemo: boolean
  bulbBase: string | null
  colorTemperature: number | null
  difficulty: 'UNKNOWN' | 'EASY' | 'MEDIUM' | 'HARD'
  vehicleType: 'CAR' | 'MOTORCYCLE' | 'BOTH'
  metaTitle: string | null
  metaDescription: string | null
  category: { slug: string; name: string } | null
  gallery: GalleryItem[]
  specs: Array<{ label: string; value: string; group: string | null }>
  variants: VariantView[]
  /** Conditionnement conseillé, seulement si un véhicule est sélectionné. */
  recommendedVariantId: string | null
  guides: Array<{ slug: string; title: string; difficulty: string; durationMinutes: number | null }>
  faq: Array<{ question: string; answer: string }>
  /** Avis réels et publiés. Vide tant qu'aucun avis n'a été collecté. */
  reviews: Array<{
    authorName: string
    rating: number
    title: string | null
    body: string
    verifiedPurchase: boolean
    publishedAt: Date | null
  }>
  /**
   * Compléments facultatifs, jamais ajoutés d'office.
   *
   * Chacun porte de quoi décider sans quitter la fiche : ce que c'est, dans
   * quel conditionnement, à quel prix réel, s'il est disponible, et ce qu'on
   * sait de sa compatibilité avec le véhicule retenu — `null` quand aucun
   * véhicule n'est sélectionné, parce qu'on n'affirme rien dans ce cas.
   */
  optionalAddons: Array<{
    slug: string
    name: string
    tagline: string | null
    /** Conditionnement proposé à l'ajout (le moins cher). */
    variantId: string
    variantName: string
    packaging: VariantView['packaging']
    priceCents: number
    /** Vrai quand plusieurs conditionnements existent : le prix est un minimum. */
    hasOtherPackagings: boolean
    availability: Availability
    fitment: FitmentStatus | null
    image: { url: string; alt: string } | null
  }>
}

const THUMB_LABELS: Record<GalleryItem['role'], string> = {
  PRODUCT: 'Le produit',
  RESULT: 'Le rendu',
  KIT_CONTENT: 'Le kit complet',
  INSTALL: 'Le montage',
}

const ROLE_ORDER: GalleryItem['role'][] = ['PRODUCT', 'RESULT', 'KIT_CONTENT', 'INSTALL']

export async function getProduct(
  slug: string,
  configurationId: string | null = null,
): Promise<ProductView | null> {
  try {
    const product = await prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        categories: { include: { category: true }, orderBy: { position: 'asc' }, take: 1 },
        media: { include: { media: true }, orderBy: { position: 'asc' } },
        specs: { orderBy: { position: 'asc' } },
        faqItems: { orderBy: { position: 'asc' } },
        guides: { include: { guide: true } },
        reviews: {
          where: { status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
          take: 10,
        },
        relatedFrom: {
          where: { type: 'OPTIONAL_ADDON' },
          orderBy: { position: 'asc' },
          include: {
            target: {
              include: {
                variants: {
                  where: { active: true },
                  orderBy: { priceCents: 'asc' },
                  include: {
                    components: { include: { component: true } },
                  },
                },
                media: {
                  where: { role: 'PRODUCT' },
                  orderBy: { position: 'asc' },
                  take: 1,
                  include: { media: true },
                },
              },
            },
          },
        },
        variants: {
          where: { active: true },
          orderBy: { position: 'asc' },
          include: {
            components: {
              orderBy: { position: 'asc' },
              include: {
                component: { include: { product: { select: { slug: true, name: true } } } },
              },
            },
          },
        },
      },
    })

    if (!product || product.variants.length === 0) return null

    const fitments = await resolveFitments(
      configurationId,
      product.variants.map((variant) => variant.id),
    )

    /*
      Compatibilité des compléments facultatifs.

      Résolue par le même moteur, et séparément : un pack d'éclairage
      intérieur n'a pas la même compatibilité que le kit de phares auquel il
      est rattaché. Proposer un complément en lui prêtant le statut du produit
      principal reviendrait à affirmer une compatibilité que personne n'a
      vérifiée.
    */
    const addonVariantIds = product.relatedFrom.flatMap((relation) =>
      relation.target.variants.map((variant) => variant.id),
    )
    const addonFitments = await resolveFitments(configurationId, addonVariantIds)

    const variants: VariantView[] = product.variants.map((variant) => {
      const isKit = variant.components.length > 0
      const availability = isKit
        ? availabilityForKit(
            variant.components.map((entry) => ({
              quantity: entry.quantity,
              required: entry.required,
              component: entry.component,
            })),
          )
        : availabilityForVariant(variant)

      const fitment = fitments.get(variant.id)!
      const includedIds = new Set(variant.components.map((entry) => entry.componentId))

      return {
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        packaging: variant.packaging,
        priceCents: variant.priceCents,
        compareAtCents: variant.compareAtCents,
        availability,
        components: variant.components.map((entry) => ({
          sku: entry.component.sku,
          productSlug: entry.component.product.slug,
          productName: entry.component.product.name,
          variantName: entry.component.name,
          quantity: entry.quantity,
          required: entry.required,
          priceCents: entry.component.priceCents * entry.quantity,
        })),
        fitment,
        // Un accessoire obligatoire déjà présent dans le kit n'est pas manquant.
        missingAccessories: fitment.accessories.filter(
          (accessory) => accessory.required && !includedIds.has(accessory.variantId),
        ),
      }
    })

    /*
      Conditionnement conseillé : règle unique, partagée avec les résultats
      véhicule et les cartes de listing (`lib/recommendation.ts`). Elle
      préférait ici le kit par principe, et le moins cher ailleurs — d'où deux
      conseils contraires pour la même pièce et le même véhicule.
    */
    const recommended = configurationId
      ? recommendPackaging(
          variants.map((variant) => ({
            id: variant.id,
            priceCents: variant.priceCents,
            status: variant.fitment.status,
            purchasable: isPurchasable(variant.availability),
            missingRequired: variant.missingAccessories.length,
          })),
        )
      : null

    const gallery: GalleryItem[] = product.media
      .map((entry) => ({
        url: entry.media.url,
        alt: entry.media.alt ?? product.name,
        caption: entry.media.caption,
        role: entry.role as GalleryItem['role'],
        thumbLabel: THUMB_LABELS[entry.role as GalleryItem['role']] ?? 'Visuel',
        nature: entry.media.nature as GalleryItem['nature'],
      }))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))

    return {
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      body: product.body,
      brand: product.brand,
      isDemo: product.isDemo,
      bulbBase: product.bulbBase,
      colorTemperature: product.colorTemperature,
      difficulty: product.difficulty,
      vehicleType: product.vehicleType,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      category: product.categories[0]
        ? { slug: product.categories[0].category.slug, name: product.categories[0].category.name }
        : null,
      gallery,
      specs: product.specs.map((spec) => ({
        label: spec.label,
        value: spec.value,
        group: spec.group,
      })),
      variants,
      recommendedVariantId: recommended?.id ?? null,
      guides: product.guides
        .filter((entry) => entry.guide.publishedAt !== null)
        .map((entry) => ({
          slug: entry.guide.slug,
          title: entry.guide.title,
          difficulty: entry.guide.difficulty,
          durationMinutes: entry.guide.durationMinutes,
        })),
      faq: product.faqItems.map((item) => ({ question: item.question, answer: item.answer })),
      reviews: product.reviews.map((review) => ({
        authorName: review.authorName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        verifiedPurchase: review.verifiedPurchase,
        publishedAt: review.publishedAt,
      })),
      optionalAddons: product.relatedFrom
        .filter((relation) => relation.target.variants.length > 0)
        .map((relation) => {
          const cover = relation.target.media[0]?.media
          const variant = relation.target.variants[0]
          const isKit = variant.components.length > 0

          return {
            slug: relation.target.slug,
            name: relation.target.name,
            tagline: relation.target.tagline,
            variantId: variant.id,
            variantName: variant.name,
            packaging: variant.packaging,
            priceCents: variant.priceCents,
            hasOtherPackagings: relation.target.variants.length > 1,
            availability: isKit
              ? availabilityForKit(
                  variant.components.map((entry) => ({
                    quantity: entry.quantity,
                    required: entry.required,
                    component: entry.component,
                  })),
                )
              : availabilityForVariant(variant),
            /*
              Compatibilité du complément avec le véhicule retenu.

              `addonFitments` a été résolu avec le même moteur que la fiche
              elle-même. Sans véhicule, il vaut `null` : on ne propose pas un
              complément en laissant croire qu'il a été vérifié.
            */
            fitment: configurationId
              ? (addonFitments.get(variant.id)?.status ?? 'UNKNOWN')
              : null,
            image: cover ? { url: cover.url, alt: cover.alt ?? relation.target.name } : null,
          }
        }),
    }
  } catch (error) {
    console.error('[fiche produit] lecture impossible', error)
    return null
  }
}

/** Slugs publiés, pour le sitemap et la pré-génération éventuelle. */
export async function listPublishedProductSlugs(): Promise<string[]> {
  try {
    const rows = await prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true },
    })
    return rows.map((row) => row.slug)
  } catch {
    return []
  }
}
