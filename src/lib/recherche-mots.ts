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

  /*
    Une année (« duster 2015 ») n'est écrite dans aucun nom de fiche : elle
    vidait la recherche (parcours client du 10 novembre 2026). Elle est
    ignorée dès qu'il reste un autre mot ; les fiches portent les années de
    leur génération, que le client vérifie d'un regard.
  */
  const estUneAnnee = (mot: string) => /^(19[5-9]\d|20[0-3]\d)$/.test(mot)
  const sansAnnees = mots.filter((mot) => !estUneAnnee(mot))
  if (sansAnnees.length > 0 && sansAnnees.length < mots.length) mots.splice(0, mots.length, ...sansAnnees)

  return mots.map((mot) => {
    // Le chiffre romain précédé d'une espace : « Clio IV » oui, « Civic » non.
    if (ROMAINS[mot]) return [mot, ` ${ROMAINS[mot]}`]
    return SYNONYMES[mot] ?? [mot]
  })
}

/*
  Les références d'ampoule qu'un client tape seules : « h7 », « ampoule W5W »,
  « led p21w ». Les packs ne les affichent pas — ils se choisissent par
  véhicule, et la bonne ampoule est déjà dedans — donc la recherche n'en
  trouve aucun. Plutôt que « Aucun résultat », la page explique comment
  trouver le pack (voir app/recherche).
*/
const REFERENCE_D_AMPOULE =
  /^(?:(?:ampoules?|led|leds|kit|pack)\s+)*(?:h\d{1,2}|hb[345]|hir2|h\d{1,2}w|9005|9006|9012|880|881|d[1-8][rs]|w5w|t10|t15|t20|t4w|c5w|c10w|c21w|p21w|py21w|p21\/5w|p27w|p27\/7w|w16w|w21w|w21\/5w|r5w|r10w|ba9s|ba15s|bau15s|bay15d|psx24w|psx26w|pw24w)(?:\s+(?:led|leds|xenon|xénon))?$/i

/** Vrai quand la saisie n'est qu'une référence d'ampoule (« h7 », « led w5w »). */
export function estUneReferenceDAmpoule(saisie: string): boolean {
  return REFERENCE_D_AMPOULE.test(saisie.trim().replace(/\s+/g, ' '))
}
