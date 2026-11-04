/**
 * Rapprochement des photos LEDVROOM et des fiches du catalogue.
 *
 * Les photos sont produites à part, véhicule par véhicule, et rangées dans un
 * dossier dont le chemin dit `<marque>/<modèle-années>/<produit>`. Les packs du
 * catalogue viennent du même relevé chez le revendeur partenaire et gardent,
 * eux, `<marque>`, `<génération>` et `<position>`. Les deux côtés portent donc
 * la même clé sans le savoir : il suffit d'enlever les années et de traduire la
 * famille en position.
 *
 * **Une correspondance exacte, ou rien.** Pas de rapprochement par ressemblance
 * de titres ni de score : une photo posée sur la mauvaise fiche serait un
 * mensonge commercial — le client verrait l'éclairage d'une autre voiture que la
 * sienne — et personne ne s'en apercevrait avant une réclamation.
 */

/** Familles du suivi photo → positions lumineuses du catalogue. */
export const POSITION_PAR_TYPE: Record<string, string> = {
  plaque: 'PLATE',
  recul: 'REVERSE',
  'veilleuses-feux-de-jour': 'SIDELIGHT',
  interieur: 'INTERIOR_DOME',
  'clignotants-avant': 'TURN_FRONT',
  phares: 'LOW_BEAM',
  'antibrouillard-avant': 'FOG',
}

/*
  Les années en fin de segment, et elles seules. Le bornage à 1950–2035 évite de
  prendre une cylindrée ou un code moteur pour un millésime : « tiger-sport-1050 »
  est un modèle, pas un modèle de 1050.
*/
const ANNEES = /-(\d{4})(?:-(\d{4}))?$/

/** Retire les années d'un segment de modèle : `duster-2010-2017` → `duster`. */
export function sansAnnees(segment: string): string {
  const trouve = ANNEES.exec(segment)
  if (!trouve) return segment
  const debut = Number(trouve[1])
  if (debut < 1950 || debut > 2035) return segment
  return segment.slice(0, trouve.index)
}

/**
 * Marques dont le suivi photo et le catalogue n'écrivent pas le slug pareil.
 *
 * Le suivi dit « mercedes », le catalogue « mercedes-benz ». Un seul mot, et
 * 759 lignes de suivi qui ne retombaient sur rien — au point de faire croire
 * que la marque était absente alors que ses 62 générations étaient en base.
 * Une table explicite vaut mieux qu'un rapprochement approximatif, qui
 * finirait par confondre deux marques voisines.
 */
export const ALIAS_MARQUE: Record<string, string> = {
  mercedes: 'mercedes-benz',
}

export type CleVehicule = { marque: string; generation: string }

/**
 * La clé véhicule d'un dossier de photos, ou `null` si le chemin n'a pas la
 * forme attendue.
 */
export function cleDuDossier(dossier: string): CleVehicule | null {
  const parts = dossier.split('/')
  if (parts.length < 3) return null
  const [marque, modele] = parts
  if (!marque || !modele) return null
  return { marque: ALIAS_MARQUE[marque] ?? marque, generation: sansAnnees(modele) }
}

/**
 * Les trois vues, dans l'ordre où la fiche les montre.
 *
 * Le comparatif passe devant : c'est l'argument, le reste l'explique. Vient
 * ensuite le gros plan, qui montre la pièce allumée, puis la voiture entière,
 * qui situe. Les trois portent le rôle « rendu » — elles ne montrent pas le
 * produit mais son effet — et la nature « illustration », qui fait afficher au
 * client « Visuel d'illustration — il ne montre pas un montage réalisé ».
 * C'est exact : ces images sont fabriquées, pas photographiées.
 */
export type Vue = {
  fichier: string
  /** Vue par vue, puisque les trois partagent l'intitulé « Le rendu ». */
  legende: string
  /**
   * Alt bâti sur le véhicule et la position réels du pack.
   *
   * La position arrive après un tiret, en apposition, et jamais introduite par
   * un article ou suivie d'un participe : les intitulés du catalogue mêlent le
   * singulier et le pluriel — « éclairage de plaque », « veilleuses »,
   * « habitacle » — et toute phrase qui les accorde sonnera faux pour la moitié
   * d'entre eux.
   */
  alt: (position: string, vehicule: string) => string
}

export const VUES: Vue[] = [
  {
    fichier: '01-avant-apres.jpg',
    legende: 'Avant et après',
    alt: (p, v) =>
      `Comparatif avant et après sur une ${v} — ${p} : ampoules d'origine en haut, lumière jaune ; LED en bas, lumière blanche.`,
  },
  {
    fichier: '03-gros-plan.jpg',
    legende: 'Gros plan',
    alt: (p, v) => `Gros plan sur une ${v} — ${p} en LED blanche.`,
  },
  {
    fichier: '02-vehicule-complet.jpg',
    legende: 'Véhicule entier',
    alt: (p, v) => `${v} entière, vue de face — ${p} en LED blanche.`,
  },
]

export type LignePhoto = { rang: string; type: string; dossier: string; statut: string }

/**
 * Parmi plusieurs jeux de photos visant la même fiche, celui du meilleur rang.
 *
 * Le revendeur partenaire sépare ce que le catalogue réunit : un restylé et un
 * non-restylé, un blanc xénon et un blanc pur, pour un seul pack ici. Il faut
 * trancher, et le rang est le nombre d'avis : le jeu retenu est celui du
 * produit le plus vendu, donc celui qui ressemble le plus à ce que les clients
 * achètent.
 */
export function meilleurRang<T extends LignePhoto>(lignes: T[]): T | null {
  let garde: T | null = null
  for (const ligne of lignes) {
    const rang = Number(ligne.rang)
    if (!Number.isFinite(rang)) continue
    if (!garde || rang < Number(garde.rang)) garde = ligne
  }
  return garde
}
