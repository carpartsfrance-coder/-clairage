import type { FitmentStatus } from './fitment'

/**
 * Quel conditionnement mettre en avant pour un véhicule donné.
 *
 * Cette règle vivait en trois exemplaires — résultats véhicule, cartes de
 * listing, fiche produit — et les trois ne disaient pas la même chose. Sur une
 * Golf VII à phares halogènes, les résultats conseillaient les ampoules seules
 * à 69,90 € tout en précisant que les adaptateurs et décodeurs n'étaient pas
 * inclus, pendant que la fiche recommandait le kit complet à 99,90 €. Le
 * client lisait deux conseils contraires pour la même pièce et le même
 * véhicule.
 *
 * Il n'y a donc plus qu'une règle, et elle tient en une phrase : **on
 * recommande le conditionnement qui se monte sans rien aller chercher
 * ailleurs, et le moins cher de ceux-là.**
 *
 * Ce qui en découle, et qui n'est pas un effet de bord :
 *
 * - Quand aucun accessoire n'est nécessaire, tous les conditionnements sont
 *   autonomes : c'est le moins cher qui gagne. Un kit complet n'est donc PAS
 *   recommandé par principe — seulement quand il évite un achat séparé.
 * - Quand le montage exige des accessoires, le conditionnement qui les
 *   contient passe devant, même s'il coûte plus cher : l'autre n'est pas
 *   montable en l'état, et afficher son prix comme « conseillé » revient à
 *   annoncer un prix qui ne suffit pas.
 * - Quand aucun conditionnement n'est autonome, le prix tranche de nouveau :
 *   il faudra de toute façon compléter, autant partir du moins cher.
 * - Sans compatibilité confirmée, aucune recommandation. Une donnée manquante
 *   ne vaut pas confirmation, et conseiller sans savoir est pire que se taire.
 *
 * Rien ici ne connaît de marque, de modèle ni de référence : tout vient du
 * catalogue et des compatibilités enregistrées.
 */

export type PackagingCandidate = {
  id: string
  priceCents: number
  /** Compatibilité de CE conditionnement avec la configuration visée. */
  status: FitmentStatus
  /** Faux pour une rupture : on ne conseille pas ce qu'on ne peut pas vendre. */
  purchasable: boolean
  /**
   * Nombre d'accessoires indispensables que ce conditionnement ne fournit pas.
   *
   * Zéro signifie « se monte tel quel ». La valeur vient des compatibilités,
   * desquelles on a déduit la composition du conditionnement lui-même.
   */
  missingRequired: number
}

/** Le conditionnement à mettre en avant, ou `null` s'il n'y a rien à conseiller. */
export function recommendPackaging<T extends PackagingCandidate>(candidates: T[]): T | null {
  const confirmes = candidates.filter(
    (candidate) => candidate.status === 'CONFIRMED' && candidate.purchasable,
  )
  if (confirmes.length === 0) return null

  const autonomes = confirmes.filter((candidate) => candidate.missingRequired === 0)
  const retenus = autonomes.length > 0 ? autonomes : confirmes

  return retenus.reduce((meilleur, candidat) =>
    candidat.priceCents < meilleur.priceCents ? candidat : meilleur,
  )
}

/**
 * Pourquoi ce conditionnement est conseillé, en une ligne affichable.
 *
 * `null` quand il n'y a rien à expliquer : le conseil se réduit alors au prix,
 * et une phrase de plus n'apprendrait rien.
 */
export function recommendationReason(
  recommande: PackagingCandidate,
  candidats: PackagingCandidate[],
): string | null {
  if (recommande.missingRequired > 0) return null

  const autresIncomplets = candidats.some(
    (candidat) => candidat.id !== recommande.id && candidat.missingRequired > 0,
  )
  return autresIncomplets ? 'Contient les accessoires exigés par ce montage' : null
}
