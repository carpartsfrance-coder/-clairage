/**
 * Comment une page de liste paginée se présente à Google.
 *
 * Les rubriques (`/c/[slug]`) et les pages de culot (`/culot/[base]`) ont le
 * même besoin, et s'étaient trompées de la même façon : la canonique renvoyait
 * toute page 2 sur la page 1, et un `noindex` l'accompagnait. Or une page 2
 * n'est pas un doublon de la page 1 — elle montre d'autres produits. Dire le
 * contraire à Google, puis lui demander d'ignorer la page, revenait à fermer
 * l'un des deux chemins internes vers les 30 000 fiches : il explore de moins
 * en moins les pages marquées `noindex`, et finit par ne plus suivre leurs
 * liens.
 *
 * Trois cas, et un seul se comporte différemment des autres :
 *
 * - **filtrée** — des cases sont cochées : la page n'est qu'un sous-ensemble,
 *   et il y en a autant que de combinaisons. Hors index, canonique sur la
 *   liste nue.
 * - **au-delà de la dernière page** — le listing est vide mais répond 200.
 *   Hors index, sinon `?page=5000` ouvrirait un nombre illimité de pages
 *   vides à explorer.
 * - **page 2 et suivantes, sans filtre, dans la plage** — indexable, canonique
 *   sur elle-même, numéro dans le titre pour ne pas en présenter 178
 *   identiques.
 */
export type EtatDeListe = {
  /** Numéro demandé, déjà ramené à 1 au minimum. */
  page: number;
  /** Dernière page qui contient des produits, 1 au minimum. */
  dernierePage: number;
  /** Au moins un filtre est actif. */
  filtree: boolean;
  /** La liste n'a aucun produit en ligne, filtres mis à part. */
  vide?: boolean;
};

export type IndexationDeListe = {
  /** Canonique sur elle-même et numéro dans le titre. */
  numerotee: boolean;
  /** `robots: noindex, follow` — on garde `follow` pour les liens produits. */
  horsIndex: boolean;
};

export function indexationDeListe({
  page,
  dernierePage,
  filtree,
  vide = false,
}: EtatDeListe): IndexationDeListe {
  const horsPlage = page > dernierePage;
  return {
    numerotee: page > 1 && !filtree && !horsPlage,
    horsIndex: filtree || horsPlage || vide,
  };
}
