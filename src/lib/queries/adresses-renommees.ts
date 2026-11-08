import 'server-only'
import { prisma } from '../db'

/**
 * Adresses renommées le 8 novembre 2026 : « -photo-manquante », repris des
 * pages du revendeur, a été retiré de 690 adresses de fiches et de 55 pages
 * de génération (migration 20261108200000). Google et les clients qui
 * connaissent l'ancienne adresse sont renvoyés, de façon permanente, vers la
 * nouvelle.
 *
 * On ne renvoie que si l'ancienne adresse n'existe plus du tout : quand le nom
 * sans le suffixe était déjà pris par une autre génération du même modèle,
 * l'adresse n'a pas été renommée, et la page reste servie sous son nom.
 */
const SUFFIXE = '-photo-manquante'

export function sansPhotoManquante(slug: string): string | null {
  return slug.includes(SUFFIXE) ? slug.replaceAll(SUFFIXE, '') : null
}

/** Nouvelle adresse d'une fiche renommée, ou null. */
export async function ficheRenommee(slug: string): Promise<string | null> {
  const nouveau = sansPhotoManquante(slug)
  if (!nouveau) return null
  try {
    const [ancienne, nouvelle] = await Promise.all([
      prisma.product.findUnique({ where: { slug }, select: { id: true } }),
      prisma.product.findUnique({ where: { slug: nouveau }, select: { id: true } }),
    ])
    return !ancienne && nouvelle ? `/p/${nouveau}` : null
  } catch {
    return null
  }
}

/** Nouvelle adresse d'une page de génération renommée, ou null. */
export async function generationRenommee(chemin: {
  type: string
  marque: string
  modele: string
  generation: string
}): Promise<string | null> {
  const nouveau = sansPhotoManquante(chemin.generation)
  if (!nouveau) return null
  try {
    const generations = await prisma.vehicleGeneration.findMany({
      where: {
        slug: { in: [chemin.generation, nouveau] },
        model: { slug: chemin.modele, make: { slug: chemin.marque } },
      },
      select: { slug: true },
    })
    const slugs = new Set(generations.map((generation) => generation.slug))
    return !slugs.has(chemin.generation) && slugs.has(nouveau)
      ? `/packs/${chemin.type}/${chemin.marque}/${chemin.modele}/${nouveau}`
      : null
  } catch {
    return null
  }
}
