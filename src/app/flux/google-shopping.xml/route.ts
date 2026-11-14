import { connection } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { identity, siteConfig } from '@/lib/identity'
import { availabilityForKit, availabilityForVariant } from '@/lib/stock'
import { getOffresParPays } from '@/lib/shipping'
import {
  PIED_FLUX,
  enteteFlux,
  lignesDeLArticle,
  type ArticleFlux,
  type TarifPays,
} from '@/lib/flux-google'
import { imagesTypesPourLeFlux } from '@/lib/images-types'
import { nomAvecPeriode } from '@/lib/seo-fiche'

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
/** Lecture par paquets : 30 000 fiches lues d'un coup faisaient tomber le serveur. */
const PAQUET = 250

const SELECTION = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  description: true,
  brand: true,
  vehicleType: true,
  categories: {
    orderBy: { position: 'asc' as const },
    take: 1,
    select: { category: { select: { name: true, parent: { select: { name: true } } } } },
  },
  media: {
    // Pas les rendus : ils portent le filigrane LEDVROOM, que Google Shopping
    // refuse (lib/storage/filigrane.ts). Le flux part avec les photos produit.
    where: { role: { in: ['PRODUCT', 'KIT_CONTENT'] as Array<'PRODUCT' | 'KIT_CONTENT'> } },
    orderBy: { position: 'asc' as const },
    select: { role: true, media: { select: { url: true } } },
  },
  variants: {
    where: { active: true, isDemo: false },
    orderBy: { position: 'asc' as const },
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
}

type ProduitLu = Awaited<ReturnType<typeof lirePaquet>>[number]
type Periode = { debut: number; fin: number | null }

/**
 * Les années de la génération de chaque fiche du paquet, comme dans le titre
 * de la page : sans elles, les fiches d'un même modèle de moto (YZF-R6 600 de
 * 1999, 2003, 2006…) portaient le même titre dans Google Shopping (1 847
 * titres en double). Une seule requête par paquet ; une fiche documentée sur
 * plusieurs générations (ampoule générique) n'a pas d'années.
 */
async function periodesDuPaquet(ids: string[]): Promise<Map<string, Periode>> {
  if (ids.length === 0) return new Map()
  const lignes = await prisma.$queryRaw<
    Array<{ productId: string; generations: bigint; debut: number; fin: number | null }>
  >`
    SELECT v."productId", COUNT(DISTINCT g."id") AS generations,
           MIN(g."yearFrom") AS debut, MAX(g."yearTo") AS fin
    FROM "ProductVariant" v
    JOIN "Fitment" f ON f."variantId" = v."id" AND f."status" <> 'INCOMPATIBLE'
    JOIN "VehicleConfiguration" c ON c."id" = f."configurationId" AND c."active"
    JOIN "VehicleGeneration" g ON g."id" = c."generationId" AND g."active"
    WHERE v."productId" IN (${Prisma.join(ids)})
    GROUP BY v."productId"
  `
  return new Map(
    lignes
      .filter((ligne) => Number(ligne.generations) === 1)
      .map((ligne) => [ligne.productId, { debut: ligne.debut, fin: ligne.fin }]),
  )
}

function lirePaquet(apres: string | null) {
  return prisma.product.findMany({
    where: { status: 'PUBLISHED', isDemo: false },
    orderBy: { id: 'asc' },
    take: PAQUET,
    ...(apres ? { cursor: { id: apres }, skip: 1 } : {}),
    select: SELECTION,
  })
}

function versArticle(produit: ProduitLu, periode: Periode | undefined): ArticleFlux {
  const categorie = produit.categories[0]?.category
  // Le produit, puis le contenu du kit (les rendus filigranés n'y vont pas).
  const ordre = ['PRODUCT', 'KIT_CONTENT']
  const images = [...produit.media]
    .sort((a, b) => ordre.indexOf(a.role) - ordre.indexOf(b.role))
    .map((entree) => entree.media.url)
  return {
    slug: produit.slug,
    name: periode ? nomAvecPeriode(produit.name, periode.debut, periode.fin) : produit.name,
    description: produit.description ?? produit.tagline,
    brand: produit.brand,
    productType: categorie
      ? categorie.parent
        ? `${categorie.parent.name} > ${categorie.name}`
        : categorie.name
      : null,
    // Sans visuel à elle, la fiche part avec ses images types sans texte
    // (photo du produit, gros plan « après ») : Google accepte les
    // illustrations pour les pièces de véhicules, pas le texte incrusté.
    images: images.length > 0 ? [...new Set(images)] : imagesTypesPourLeFlux(produit),
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
}

/**
 * Le flux est écrit au fil de la lecture, par paquets de 500 fiches : avec
 * près de 30 000 fiches (catalogue « comme LedPerf », 8 novembre 2026), tout
 * lire puis tout assembler en mémoire dépassait la mémoire du serveur, qui
 * redémarrait — le site entier répondait 502 le temps du redémarrage.
 */
export async function GET() {
  // Jamais pré-rendu : la réponse dépend de la requête. `connection()` le dit
  // explicitement, là où l'ancien `dynamic = 'force-dynamic'` le réglait par
  // configuration de segment.
  await connection()

  if (siteConfig.demoBanner) {
    return new Response('Flux désactivé en préproduction.', { status: 404 })
  }

  let tarifs: TarifPays[]
  try {
    const offresParPays = await getOffresParPays()
    tarifs = Object.entries(offresParPays).map(([country, offres]) => ({
      country,
      modes: offres.map((offre) => ({
        label: offre.label,
        priceCents: offre.priceCents,
        freeFromCents: offre.freeFromCents,
      })),
    }))
  } catch (error) {
    console.error('[flux google]', error)
    return new Response('Flux momentanément indisponible.', { status: 503 })
  }

  const encodeur = new TextEncoder()
  const options = { siteUrl: siteConfig.url, titre: identity.name, tarifs }
  let apres: string | null = null
  let debut = true
  let fini = false
  // `pull` : le paquet suivant n'est lu que quand le précédent est parti vers
  // Google. La mémoire reste celle d'un seul paquet, quelle que soit la taille
  // du catalogue.
  const flux = new ReadableStream<Uint8Array>({
    async pull(controleur) {
      try {
        if (fini) return
        const paquet: ProduitLu[] = await lirePaquet(apres)
        const periodes = await periodesDuPaquet(paquet.map((produit) => produit.id))
        const lignes = paquet.flatMap((produit) =>
          lignesDeLArticle(versArticle(produit, periodes.get(produit.id)), options),
        )
        let morceau = debut ? enteteFlux(siteConfig.url, identity.name) : ''
        if (lignes.length > 0) morceau += (debut ? '' : '\n') + lignes.join('\n')
        debut = false
        if (paquet.length < PAQUET) {
          fini = true
          controleur.enqueue(encodeur.encode(morceau + PIED_FLUX))
          controleur.close()
          return
        }
        apres = paquet[paquet.length - 1].id
        controleur.enqueue(encodeur.encode(morceau))
      } catch (error) {
        console.error('[flux google]', error)
        controleur.error(error)
      }
    },
  })

  return new Response(flux, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
