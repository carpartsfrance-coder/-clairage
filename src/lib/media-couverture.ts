import type { MediaRole } from '@prisma/client'

/**
 * Le visuel qui représente un produit partout ailleurs que sur sa fiche :
 * carte du catalogue, résultats véhicule, panier, commandes, accueil.
 *
 * **Le rendu passe devant le produit.** Un pack d'ampoules photographié seul
 * montre deux culots sur fond blanc : c'est exact, et ça ne dit rien à qui
 * cherche de la lumière pour sa voiture. Le rendu montre le feu concerné,
 * allumé, sur le véhicule — c'est ce que le client achète. Quand une fiche en
 * a un, c'est lui qu'on met en avant ; sinon, le visuel produit reprend sa
 * place.
 *
 * L'ordre ne peut pas se demander à la base : il faudrait trier sur le rôle, et
 * l'ordre d'un énuméré tient à l'ordre de sa déclaration dans le schéma. Un
 * jour où quelqu'un réordonnerait `MediaRole` pour faire propre, la couverture
 * de toutes les fiches changerait sans que rien ne le signale. On rapatrie donc
 * les quelques visuels de tête et on choisit ici, en toutes lettres.
 */

/** Les rôles qui peuvent servir de couverture, du plus parlant au moins. */
const ORDRE_ROLES: MediaRole[] = ['RESULT', 'PRODUCT']

/**
 * À passer tel quel au `include` Prisma des listes de produits.
 *
 * Pas de `as const` : Prisma attend des tableaux modifiables, et un littéral
 * figé se fait refuser à la compilation.
 */
export const ARGS_COUVERTURE = {
  where: { role: { in: ORDRE_ROLES } },
  orderBy: { position: 'asc' as const },
  /** De quoi tenir les deux rôles ; au-delà, rien ne peut plus l'emporter. */
  take: 6,
}

type Entree = { role: string; media: unknown }

/**
 * La couverture parmi les visuels rapatriés, ou `undefined` s'il n'y en a
 * aucun. Les entrées sont supposées déjà triées par position.
 */
export function couverture<T extends Entree>(entrees: readonly T[]): T | undefined {
  for (const role of ORDRE_ROLES) {
    const trouve = entrees.find((entree) => entree.role === role)
    if (trouve) return trouve
  }
  return undefined
}
