/**
 * Compléments facultatifs : ce qu'on peut encore proposer.
 *
 * Un complément déjà fourni par le conditionnement retenu n'est pas un
 * complément. Le proposer à l'achat ferait payer deux fois la même pièce au
 * client qui vient précisément de choisir le pack qui la contient — et les
 * deux listes sont tenues séparément : la composition d'un kit vit dans
 * `KitComponent`, les compléments dans `ProductRelation`. Rien n'empêche un
 * exploitant de désigner comme complément un accessoire qu'il inclut déjà.
 *
 * Le rapprochement se fait par **produit**, pas par variante : un pack peut
 * inclure l'adaptateur en paire quand la fiche complément le vend à l'unité.
 * C'est le même accessoire, et c'est lui qu'il ne faut pas revendre.
 *
 * La règle est ici, et non dans le composant, parce qu'elle se teste : c'est
 * une décision commerciale, pas un détail d'affichage.
 */
export function addonsProposables<T extends { slug: string }>(
  addons: readonly T[],
  /** Slugs des produits composant le conditionnement retenu. */
  composants: Iterable<string>,
): T[] {
  const inclus = new Set(composants)
  return addons.filter((addon) => !inclus.has(addon.slug))
}
