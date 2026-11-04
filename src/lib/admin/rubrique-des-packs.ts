/**
 * À quelle rubrique appartient un pack, d'après son nom.
 *
 * Les 9 866 packs par véhicule ont été créés par `import-packs-vehicule.ts`,
 * qui ne pose aucune rubrique : il indexe le catalogue sur le véhicule, pas sur
 * la famille. Résultat, les pages de rubrique sont restées vides alors que le
 * catalogue est plein — `/c/modules-plaque` n'affichait qu'un produit sur les
 * 1 341 qui lui revenaient.
 *
 * Le nom est le seul critère disponible, et il suffit : ces fiches sont
 * engendrées, leur nom suit un gabarit — « Pack LED <position> pour <véhicule>
 * ». Neuf préfixes couvrent les 9 866 packs sans en laisser un seul de côté,
 * et ne touchent aucun des 32 autres produits du catalogue, qui sont déjà
 * rangés.
 *
 * **Le préfixe le plus long gagne.** « Pack LED feux de recul », « ... de
 * route » et « ... de jour » partagent leurs premiers mots ; comparer dans
 * l'ordre de déclaration ferait dépendre le résultat de cet ordre. Trier par
 * longueur décroissante rend la règle indépendante de la façon dont elle est
 * écrite.
 */

export type RegleRubrique = {
  /** Début du nom du produit, littéral, tel qu'il est en base. */
  prefixe: string
  /** Slug de la rubrique d'accueil. */
  rubrique: string
}

export const REGLES_RUBRIQUE: RegleRubrique[] = [
  { prefixe: 'Pack LED clignotants', rubrique: 'clignotants' },
  { prefixe: 'Pack LED antibrouillards', rubrique: 'antibrouillards' },
  { prefixe: 'Pack LED feux de route', rubrique: 'feux-de-route' },
  { prefixe: 'Pack LED feux de recul', rubrique: 'feux-recul' },
  { prefixe: 'Pack LED feux de jour', rubrique: 'feux-de-jour' },
  { prefixe: 'Pack LED éclairage de plaque', rubrique: 'modules-plaque' },
  { prefixe: 'Pack LED veilleuses', rubrique: 'veilleuses' },
  { prefixe: 'Pack LED habitacle', rubrique: 'interieur' },
  /*
    En dernier dans l'intention, mais l'ordre ne compte pas : « Pack LED
    phares » est le préfixe le plus court de la famille des phares, il ne doit
    l'emporter que si aucun préfixe plus précis ne s'applique.
  */
  { prefixe: 'Pack LED phares', rubrique: 'phares-led' },
]

/** Les règles du préfixe le plus long au plus court. */
const PAR_PRECISION = [...REGLES_RUBRIQUE].sort((a, b) => b.prefixe.length - a.prefixe.length)

/**
 * La rubrique d'un produit, ou `null` s'il ne relève d'aucune règle — c'est le
 * cas des produits saisis à la main, qui ont leur propre rangement.
 */
export function rubriquePour(nom: string): string | null {
  return PAR_PRECISION.find((regle) => nom.startsWith(regle.prefixe))?.rubrique ?? null
}

/** Les rubriques citées par les règles, sans doublon. */
export function rubriquesCitees(): string[] {
  return [...new Set(REGLES_RUBRIQUE.map((regle) => regle.rubrique))]
}
