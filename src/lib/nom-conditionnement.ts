/**
 * Le nom d'un conditionnement, quand il apprend quelque chose.
 *
 * Les écrans affichaient le nom du produit, puis celui du conditionnement
 * retenu — identique au premier sur les 10 320 conditionnements du catalogue,
 * sans une exception, parce qu'aucun produit n'en a plus d'un aujourd'hui. La
 * fiche annonçait donc « 17,90 € TTC · pack led éclairage de plaque pour
 * mercedes-benz classe c (w203) » sous un titre disant déjà la même chose, en
 * minuscules par-dessus le marché.
 *
 * Le jour où un produit aura « Les ampoules seules » et « Le kit complet », la
 * mention reparaîtra d'elle-même : c'est là qu'elle sert, et seulement là.
 */
export function nomUtileDuConditionnement(
  nomDuConditionnement: string | null | undefined,
  nomDuProduit: string,
): string | null {
  if (!nomDuConditionnement) return null
  // Une combinaison d'options (« Ballasts : … · Température … ») n'est pas un nom à afficher.
  if (nomDuConditionnement.includes(' : ')) return null
  return nomDuConditionnement === nomDuProduit ? null : nomDuConditionnement
}
