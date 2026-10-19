import { prisma } from '../db'

/**
 * Ce que la page d'aide peut réellement montrer.
 *
 * Chaque fonction renvoie l'état réel de la base, et une valeur vide quand la
 * base ne répond pas : la page décide ensuite d'afficher la rubrique ou de la
 * laisser de côté. C'est la règle appliquée à la fiche produit — une section
 * qui n'a rien à dire ne s'affiche pas, et on ne la remplit pas d'un « aucun
 * contenu pour le moment » qui a coûté un clic pour rien.
 */

export type FaqEntry = { question: string; answer: string }

/**
 * Questions fréquentes publiées, hors contexte produit.
 *
 * `scope: 'general'` est le même filtre que la FAQ de l'accueil : ce sont les
 * questions qui valent pour la boutique entière, pas celles rattachées à une
 * référence ou à une catégorie.
 */
export async function listGeneralFaq(): Promise<FaqEntry[]> {
  try {
    return await prisma.faqItem.findMany({
      where: { published: true, scope: 'general' },
      orderBy: { position: 'asc' },
      select: { question: true, answer: true },
    })
  } catch (error) {
    console.error('[aide] questions fréquentes indisponibles', error)
    return []
  }
}

/**
 * Nombre de guides publiés.
 *
 * Un guide n'a pas de statut : c'est sa date de publication qui le rend
 * public, et une date future le garde invisible — même règle que le plan de
 * site. Le compte suffit ici : la page d'aide ne peut renvoyer que vers la
 * liste `/guides`, faute de page par guide.
 *
 * **Tant qu'il vaut zéro, la rubrique ne s'affiche pas** — ce qui est le cas
 * aujourd'hui, `/guides` étant encore un gabarit. Le jour où un guide est
 * publié, la rubrique apparaît et `/guides` doit exister : la fiche produit
 * tient déjà son bouton « Découvrir les guides » à la même condition.
 */
export async function countPublishedGuides(): Promise<number> {
  try {
    return await prisma.guide.count({
      where: { publishedAt: { not: null, lte: new Date() } },
    })
  } catch (error) {
    console.error('[aide] guides indisponibles', error)
    return 0
  }
}
