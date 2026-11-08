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
 * Une adresse qui n'a jamais existé, ou une fiche de démonstration, reste en
 * 404 : on ne redirige que ce qu'on connaît.
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
    if (!produit || produit.isDemo) return null

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
    return null
  } catch (error) {
    console.error('[fiche] repli introuvable', error)
    return null
  }
}
