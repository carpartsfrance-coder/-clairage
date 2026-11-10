/**
 * Un seul produit par emplacement, pour les boutons « tout ajouter ».
 *
 * Sur le Dacia Duster, « Ajouter les 15 packs » mettait au panier trois
 * produits pour le même feu de croisement — ampoules effet xénon, kit xénon et
 * kit LED — qui ne se montent pas ensemble (parcours client du 10 novembre
 * 2026). Ces produits sont des alternatives : on n'en garde qu'un, le moins
 * cher, c'est-à-dire le plus simple à monter. Les autres restent sur la page,
 * à ajouter un par un.
 *
 * Les répétiteurs et les feux de jour ont leur propre ampoule même quand le
 * référentiel les range sous « Clignotants avant » ou « Veilleuses » : ils
 * forment leur propre groupe.
 *
 * Volontairement sans 'server-only' : utilisé par des composants client.
 */
export function cleDEmplacement(emplacement: string, nomDuProduit: string): string {
  const nom = nomDuProduit.toLowerCase()
  if (/répétiteur/.test(nom)) return `${emplacement}|répétiteurs`
  if (/feux de jour/.test(nom)) return `${emplacement}|feux de jour`
  return emplacement
}

export function unParEmplacement<T>(
  produits: T[],
  cle: (produit: T) => string,
  prixCents: (produit: T) => number,
): T[] {
  const retenus = new Map<string, T>()
  for (const produit of produits) {
    const k = cle(produit)
    const deja = retenus.get(k)
    if (!deja || prixCents(produit) < prixCents(deja)) retenus.set(k, produit)
  }
  // Dans l'ordre de la page.
  const gardes = new Set(retenus.values())
  return produits.filter((produit) => gardes.has(produit))
}
