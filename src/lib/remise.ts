/**
 * Pourcentage de remise affiché à côté d'un prix barré.
 *
 * Toujours un chiffre rond — 5, 10, 15… — sur demande de l'exploitant
 * (21 novembre 2026) : « −23 % » faisait calculé à la machine. Et toujours
 * arrondi vers le BAS : on n'annonce jamais plus que la remise réelle. Une
 * remise de 25,7 % s'affiche « −25 % », jamais « −26 % » ni « −30 % ».
 *
 * Les prix soldés sont posés pour tomber juste au-dessus d'un palier
 * (migration 20261121020000_black_friday_prix_ronds) : 10,90 € soldé 8,10 €
 * fait 25,7 %, affiché −25 %.
 *
 * Calcul en entiers (centimes) : `1 - 800 / 1000` donne 0,19999… en flottant,
 * qui tomberait au palier de 15 %.
 *
 * Renvoie null quand il n'y a pas de remise à annoncer (pas de prix barré,
 * prix barré inférieur ou égal, ou remise sous 5 %).
 */
export function remiseAffichee(prixCents: number, barreCents: number | null | undefined): number | null {
  if (!barreCents || barreCents <= prixCents || prixCents < 0) return null
  const pourcent = Math.floor(((barreCents - prixCents) * 100) / barreCents)
  const palier = Math.floor(pourcent / 5) * 5
  return palier >= 5 ? palier : null
}
