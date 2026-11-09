import 'server-only'
import { prisma } from '../db'
import { lectureCatalogue } from '../cache-catalogue'
import { MODELE_VISIBLE } from './vehicules-visibles'

/**
 * Le nombre de modèles de véhicules pour lesquels au moins un produit en ligne
 * est référencé (même règle que les listes de véhicules du site). Sert à
 * « Plus de 2 100 modèles de véhicules référencés » sur la fiche : un chiffre
 * lu dans la base, jamais écrit à la main. `null` si la base ne répond pas.
 */
const compter = lectureCatalogue('modeles-references-v1', async () => prisma.vehicleModel.count({ where: MODELE_VISIBLE }))

export async function getModelesReferences(): Promise<number | null> {
  try {
    return await compter()
  } catch {
    return null
  }
}

/** « 2 184 » → « plus de 2 100 » : arrondi vers le bas, à la centaine. */
export function plusDe(n: number): string | null {
  if (n < 100) return null
  return `Plus de ${(Math.floor(n / 100) * 100).toLocaleString('fr-FR')}`
}
