import 'server-only'
import { prisma } from '../db'
import { CHEMIN_PAR_TYPE } from './packs'
import { GENERATION_VISIBLE, MARQUE_VISIBLE, MODELE_VISIBLE } from './vehicules-visibles'

/**
 * Où envoyer le visiteur d'une fiche qui n'est plus en ligne.
 *
 * Le 7 novembre 2026, le catalogue est passé de 10 320 fiches publiées à
 * 1 001 (seules celles dont les photos sont prêtes). Google avait déjà indexé
 * une partie des autres : un client qui cherchait « led recul Hilux »
 * tombait sur « Page introuvable ». Ces fiches reviendront en ligne au fur et
 * à mesure des photos ; d'ici là, le visiteur est envoyé — en redirection
 * **temporaire** — vers ce qui existe pour son véhicule.
 *
 * Dans l'ordre :
 * 1. la page de la génération du véhicule, si elle a au moins un produit en
 *    ligne (mêmes règles de visibilité que le site, donc jamais vers une page
 *    vide) ;
 * 2. sinon la rubrique de la fiche, si elle a des produits en ligne ;
 * 3. sinon rien : la page reste introuvable (404).
 *
 * Une fiche qui n'existe plus du tout en base (retirée lors de la bascule)
 * est reconnue à son adresse : « pack-led-feux-de-recul-toyota-hilux-viii »
 * se termine par la marque et la génération du véhicule. Seule une génération
 * en ligne peut être retenue ; sinon, 404. Une fiche de démonstration reste
 * en 404.
 */
export async function pageDeRepliFiche(slug: string): Promise<string | null> {
  try {
    const produit = await prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
        isDemo: true,
        categories: {
          orderBy: { position: 'asc' },
          select: { category: { select: { slug: true, published: true } } },
        },
      },
    })
    if (produit?.isDemo) return null
    if (!produit) return pageDuVehiculeDansLAdresse(slug)

    const generation = await prisma.vehicleGeneration.findFirst({
      where: {
        ...GENERATION_VISIBLE,
        configurations: { some: { fitments: { some: { variant: { productId: produit.id } } } } },
        model: { ...MODELE_VISIBLE, make: { ...MARQUE_VISIBLE, type: { in: ['CAR', 'MOTORCYCLE'] } } },
      },
      select: { slug: true, model: { select: { slug: true, make: { select: { slug: true, type: true } } } } },
    })
    if (generation) {
      const { model } = generation
      const type = CHEMIN_PAR_TYPE[model.make.type as 'CAR' | 'MOTORCYCLE']
      return `/packs/${type}/${model.make.slug}/${model.slug}/${generation.slug}`
    }

    for (const { category } of produit.categories) {
      if (!category.published) continue
      const enLigne = await prisma.product.count({
        where: {
          status: 'PUBLISHED',
          categories: {
            some: { category: { OR: [{ slug: category.slug }, { parent: { slug: category.slug } }] } },
          },
        },
      })
      if (enLigne > 0) return `/c/${category.slug}`
    }
    // Fiche sans compatibilité ni rubrique utilisable : l'adresse dit encore
    // pour quel véhicule elle était faite.
    return pageDuVehiculeDansLAdresse(slug)
  } catch (error) {
    console.error('[fiche] repli introuvable', error)
    return null
  }
}

/**
 * La génération en ligne dont « marque-génération » termine l'adresse de la
 * fiche, la plus longue si plusieurs conviennent. Seulement pour les
 * adresses de packs (`pack-…`) : une adresse quelconque reste introuvable.
 */
async function pageDuVehiculeDansLAdresse(slug: string): Promise<string | null> {
  if (!slug.startsWith('pack-')) return null
  const generations = await prisma.vehicleGeneration.findMany({
    where: {
      ...GENERATION_VISIBLE,
      model: { ...MODELE_VISIBLE, make: { ...MARQUE_VISIBLE, type: { in: ['CAR', 'MOTORCYCLE'] } } },
    },
    select: { slug: true, model: { select: { slug: true, make: { select: { slug: true, type: true } } } } },
  })
  const retenue = generations
    .filter((generation) => slug.endsWith(`-${generation.model.make.slug}-${generation.slug}`))
    .sort((a, b) => b.slug.length + b.model.make.slug.length - (a.slug.length + a.model.make.slug.length))[0]
  if (!retenue) return null
  const type = CHEMIN_PAR_TYPE[retenue.model.make.type as 'CAR' | 'MOTORCYCLE']
  return `/packs/${type}/${retenue.model.make.slug}/${retenue.model.slug}/${retenue.slug}`
}
