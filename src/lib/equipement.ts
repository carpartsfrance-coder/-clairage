/**
 * L'équipement d'origine retenu dit-il quelque chose ?
 *
 * Le référentiel crée une configuration « Non précisé » pour chaque
 * génération (code `NON_PRECISE` ou `UNSPECIFIED` selon l'import). Affiché
 * tel quel — « Équipement d'origine non précisé » dans la barre, le panier, la
 * page du véhicule —, il faisait croire au client qu'il lui restait une
 * information à donner, alors qu'il n'y a rien à choisir pour ce véhicule.
 */
export function equipementPrecise(equipment: { code: string; label: string } | null | undefined): boolean {
  if (!equipment) return false
  if (equipment.code === 'NON_PRECISE' || equipment.code === 'UNSPECIFIED') return false
  return !/non pr[ée]cis[ée]/i.test(equipment.label)
}
