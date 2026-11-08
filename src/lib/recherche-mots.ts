/**
 * Découpe d'une recherche en mots, comme un client la tape.
 *
 * La recherche cherchait la phrase entière : « clio 4 veilleuses », « ampoule
 * golf 7 » ou « led 308 » ne trouvaient rien, alors que les packs existent
 * (« Pack LED veilleuses pour Renault Clio IV »). Désormais, chaque mot utile
 * doit apparaître quelque part dans la fiche, dans n'importe quel ordre :
 *
 * - les mots qui n'apportent rien (« ampoule », « led », « pour »…) sont
 *   ignorés ;
 * - un chiffre de génération se cherche aussi en chiffres romains (« 4 » ↔
 *   « IV ») : les fiches écrivent « Clio IV », les clients « clio 4 » ;
 * - quelques synonymes : plafonnier → habitacle, position → veilleuses,
 *   croisement → phares, xenon → xénon, vw → volkswagen…
 *
 * Rend une liste de mots, chacun avec ses variantes acceptées (OU), tous
 * exigés (ET). Vide si rien d'utile : l'appelant garde alors la phrase.
 */

const MOTS_VIDES = new Set([
  'ampoule', 'ampoules', 'led', 'leds', 'pack', 'packs', 'kit', 'kits', 'pour', 'de', 'des',
  'du', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'à', 'au', 'aux', 'en', 'sur', 'voiture',
  'auto', 'eclairage', 'éclairage', 'lampe', 'lampes', 'feu', 'feux', 'ma', 'mon', 'ma',
])

const ROMAINS: Record<string, string> = {
  '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX',
}

const SYNONYMES: Record<string, string[]> = {
  plafonnier: ['habitacle', 'plafonnier'],
  plafonniers: ['habitacle', 'plafonnier'],
  interieur: ['habitacle', 'intérieur'],
  intérieur: ['habitacle', 'intérieur'],
  position: ['veilleuses', 'position'],
  croisement: ['phares', 'croisement'],
  route: ['feux de route', 'route'],
  brouillard: ['antibrouillard'],
  xenon: ['xénon', 'xenon'],
  immatriculation: ['plaque'],
  drl: ['feux de jour'],
  jour: ['feux de jour', 'jour'],
  marche: ['recul'],
  vw: ['volkswagen'],
  merco: ['mercedes'],
}

export function motsDeRecherche(saisie: string): string[][] {
  const mots = saisie
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .split(/[\s,;/+]+/)
    .map((mot) => mot.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((mot) => mot.length > 0 && !MOTS_VIDES.has(mot))
    .slice(0, 6)

  return mots.map((mot) => {
    // Le chiffre romain précédé d'une espace : « Clio IV » oui, « Civic » non.
    if (ROMAINS[mot]) return [mot, ` ${ROMAINS[mot]}`]
    return SYNONYMES[mot] ?? [mot]
  })
}
