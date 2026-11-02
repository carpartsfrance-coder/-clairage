import type { ParseResult } from './catalogue'

/**
 * Règles des liens d'une fiche produit : compléments, composition d'un kit,
 * compatibilités véhicule.
 *
 * Après le bloc achat (que vend-on, à quel prix) et le contenu (ce que la
 * fiche raconte), il reste ce qui rattache une fiche au reste de la boutique.
 * Rien de tout cela ne s'écrivait depuis le back-office : les compléments
 * facultatifs venaient du jeu de données, la composition d'un kit n'était
 * affichée qu'en lecture dans le bloc des conditionnements, et les
 * compatibilités ne s'éditaient que depuis l'écran Véhicules — génération par
 * génération, ce qui convient quand on documente un véhicule et pas quand on
 * documente une référence qui en équipe quarante.
 *
 * Cinq décisions structurent ce fichier :
 *
 * 1. **Un lien se choisit dans dix mille lignes.** Le catalogue compte
 *    9 904 produits, 9 905 références et 2 180 configurations véhicule. Une
 *    liste déroulante les chargerait toutes dans la page — c'est ce que fait
 *    encore l'écran Véhicules, et sa page en pèse le prix. Ici on cherche, et
 *    un terme de moins de deux caractères est refusé plutôt que d'aller
 *    ramener la moitié du catalogue.
 * 2. **Un seul des trois types de relations est offert.** `OPTIONAL_ADDON`,
 *    `ALTERNATIVE` et `UPSELL` existent au schéma ; la fiche publique ne lit
 *    que le premier (`relatedFrom` filtré sur `OPTIONAL_ADDON`). Offrir les
 *    deux autres donnerait un réglage sans effet, exactement comme le groupe
 *    des caractéristiques.
 * 3. **Un composant qui est lui-même un kit est refusé.** La disponibilité
 *    d'un kit se calcule depuis le stock physique de ses composants
 *    (`availabilityForKit`), et le stock d'un kit n'est pas physique : il est
 *    lui-même calculé. Un kit dans un kit ferait donc lire un stock de zéro,
 *    et la boutique annoncerait une rupture que rien ne justifie.
 * 4. **Un lien vers quelque chose d'invisible est accepté, mais dit.** Un
 *    complément en brouillon, une configuration désactivée : le lien se
 *    prépare souvent avant la mise en ligne, mais l'écran doit dire qu'il ne
 *    se voit pas encore, sinon le rattachement paraît sans effet.
 * 5. **Les compatibilités gardent les règles de l'écran Véhicules.** Elles
 *    sont dans `lib/admin/vehicles.ts` (`parseFitment`) et ne sont pas
 *    recopiées ici : un statut « confirmé » exige sa source et sa date, quel
 *    que soit l'écran par lequel on passe. Deux jeux de règles pour une même
 *    table finiraient par diverger, et c'est la plus permissive qui ferait foi.
 */

export type { ParseResult }

/* -------------------------------------------------------------------------- */
/* Chercher dans un grand catalogue                                           */
/* -------------------------------------------------------------------------- */

export const TERME_MIN = 2

/** Nombre de propositions affichées. Au-delà, on affine la recherche. */
export const RESULTATS_MAX = 20

/**
 * Terme de recherche tel qu'il part dans la requête.
 *
 * Les espaces en trop sont retirés — un terme recopié depuis un tableur en
 * traîne souvent — mais la casse est conservée : c'est la requête qui compare
 * sans tenir compte de la casse, et normaliser ici empêcherait d'afficher à
 * l'exploitant ce qu'il a tapé.
 */
export function normaliserTerme(valeur: string): string {
  return valeur.trim().replace(/\s+/g, ' ')
}

export function termeSuffisant(terme: string): boolean {
  return normaliserTerme(terme).length >= TERME_MIN
}

export const RAISON_TERME_COURT = `Tapez au moins ${TERME_MIN} caractères : le catalogue compte près de dix mille références, une lettre seule les ramènerait presque toutes.`

/* -------------------------------------------------------------------------- */
/* Compléments facultatifs                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de compléments proposés sur une fiche.
 *
 * La fiche publique les affiche tous, cochables, sous le bloc d'achat. Huit
 * tiennent dans un regard ; vingt font un second catalogue au milieu de la
 * fiche, et plus rien n'y est choisi.
 */
export const COMPLEMENTS_MAX = 8

/**
 * Pourquoi ce produit ne peut pas être rattaché comme complément, ou `null`.
 *
 * Trois refus, dans l'ordre où ils se présentent à l'usage :
 *
 * - **Un produit n'est pas son propre complément.** La table l'accepterait
 *   (`sourceId` et `targetId` ne sont contraints qu'ensemble), et la fiche
 *   proposerait alors d'ajouter au panier ce que le client regarde déjà.
 * - **Un complément déjà rattaché est refusé**, et non signalé : la contrainte
 *   `@@unique([sourceId, targetId, type])` lèverait de toute façon, et son
 *   message n'apprendrait rien à personne.
 * - **Le plafond bloque l'ajout, jamais la correction** : on peut toujours
 *   détacher, puis rattacher autrement.
 */
export function raisonComplementRefuse(contexte: {
  produitId: string
  cibleId: string
  dejaLies: readonly string[]
  nombreActuel: number
}): string | null {
  if (contexte.cibleId.length === 0) {
    return 'Choisissez un produit à rattacher.'
  }
  if (contexte.cibleId === contexte.produitId) {
    return "Un produit ne peut pas être son propre complément : la fiche proposerait d'ajouter au panier ce que le client regarde déjà."
  }
  if (contexte.dejaLies.includes(contexte.cibleId)) {
    return 'Ce produit est déjà rattaché comme complément à cette fiche.'
  }
  if (contexte.nombreActuel >= COMPLEMENTS_MAX) {
    return `Cette fiche propose déjà ${COMPLEMENTS_MAX} compléments : au-delà, le bloc devient un second catalogue. Détachez-en un d'abord.`
  }
  return null
}

/**
 * Ce qui empêche un complément déjà rattaché d'apparaître sur la fiche.
 *
 * Deux causes, et aucune des deux ne se devine depuis l'écran :
 *
 * - **La cible n'est pas publiée.** La fiche ne propose que des compléments
 *   publiés : un brouillon proposé mènerait vers une adresse qui répond 404,
 *   et un produit archivé vers une page que la boutique ne sert plus.
 * - **La cible n'a aucune référence active.** Un complément s'ajoute au panier
 *   par sa référence ; sans référence vendable, il n'y a rien à ajouter, et la
 *   fiche l'écarte (`variants.length > 0`).
 */
export function noteComplementInvisible(cible: {
  statut: string
  referencesActives: number
}): string | null {
  if (cible.statut === 'DRAFT') {
    return "Ce produit est un brouillon : le complément n'apparaîtra sur la fiche qu'une fois le produit publié."
  }
  if (cible.statut === 'ARCHIVED') {
    return "Ce produit est archivé : la boutique ne le sert plus, et le complément n'apparaît pas."
  }
  if (cible.referencesActives === 0) {
    return "Ce produit n'a aucune référence active : il n'y a rien à ajouter au panier, et la fiche n'affiche pas le complément."
  }
  return null
}

/**
 * Pourquoi les alternatives et les montées en gamme ne sont pas offertes.
 *
 * Affiché à l'écran plutôt que tu dans le code : un exploitant qui a lu le
 * schéma, ou qui vient d'une autre boutique, cherchera ces deux listes.
 */
export const RAISON_AUTRES_RELATIONS =
  'Le schéma prévoit aussi des alternatives et des montées en gamme, mais aucune page ne les lit : les proposer ici serait offrir un réglage sans effet.'

/* -------------------------------------------------------------------------- */
/* Composition d'un kit                                                       */
/* -------------------------------------------------------------------------- */

export const COMPOSANT_QUANTITE_MAX = 99

export type ComposantSaisie = { quantity: string; required: boolean }
export type ComposantWriteData = { quantity: number; required: boolean }

/**
 * Quantité et caractère indispensable d'un composant, tels qu'ils seront
 * écrits — et les trois refus qui protègent le calcul de stock.
 *
 * Ce bloc ne décrit pas une fiche : il décide d'un stock. `availabilityForKit`
 * divise le stock vendable de chaque composant obligatoire par la quantité
 * inscrite ici, et retient le plus petit résultat. Une quantité fausse ne
 * produit donc pas un affichage faux, elle produit une vente qu'on ne peut pas
 * honorer, ou un kit déclaré en rupture avec les pièces en rayon.
 *
 * - **Une référence ne se contient pas elle-même.** Le stock du kit se
 *   calculerait depuis son propre stock, qui se calcule depuis lui-même.
 * - **Un composant qui est lui-même un kit est refusé** : son stock physique
 *   vaut zéro, et le kit parent passerait en rupture pour toujours.
 * - **Un composant déjà présent est refusé** plutôt que de doubler sa
 *   quantité dans le dos de l'exploitant ; `@@unique([kitId, componentId])`
 *   lèverait de toute façon.
 */
export function parseComposant(
  saisie: ComposantSaisie,
  contexte: {
    varianteId: string
    composantId: string
    dejaComposants: readonly { composantId: string; libelle: string }[]
    composantEstKit: boolean
  },
): ParseResult<ComposantWriteData> {
  if (contexte.composantId.length === 0) {
    return { ok: false, error: 'Choisissez une référence à inclure.' }
  }
  if (contexte.composantId === contexte.varianteId) {
    return {
      ok: false,
      error:
        "Une référence ne peut pas se contenir elle-même : son stock se calculerait depuis lui-même.",
    }
  }
  if (contexte.composantEstKit) {
    return {
      ok: false,
      error:
        "Cette référence est elle-même un kit. Le stock d'un kit n'est pas physique, il se calcule depuis ses composants : l'inclure ferait lire un stock nul, et le kit parent resterait en rupture. Incluez ses composants directement.",
    }
  }
  const doublon = contexte.dejaComposants.find(
    (composant) => composant.composantId === contexte.composantId,
  )
  if (doublon) {
    return {
      ok: false,
      error: `« ${doublon.libelle} » fait déjà partie de ce kit. Modifiez sa quantité au lieu de l'ajouter une seconde fois.`,
    }
  }

  const brute = saisie.quantity.trim()
  const quantity = brute === '' ? 1 : Number(brute)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > COMPOSANT_QUANTITE_MAX) {
    return {
      ok: false,
      error: `La quantité doit être un nombre entier compris entre 1 et ${COMPOSANT_QUANTITE_MAX}.`,
    }
  }

  return { ok: true, value: { quantity, required: saisie.required } }
}

/**
 * Pourquoi ce conditionnement ne peut pas recevoir de composition, ou `null`.
 *
 * Le refus du kit dans un kit se prend des deux côtés, et celui-ci est le
 * moins évident : une référence qui entre dans d'autres kits ne peut pas
 * devenir un kit à son tour. `parseComposant` empêche d'ajouter un kit comme
 * composant ; sans cette règle, il suffirait de faire l'inverse — ajouter
 * d'abord la référence simple au kit parent, puis lui donner une composition —
 * pour obtenir la même impasse, par la porte de derrière. Les kits parents
 * liraient alors un stock physique nul et resteraient en rupture.
 */
export function raisonCompositionImpossible(contexte: { dansDesKits: number }): string | null {
  if (contexte.dansDesKits === 0) return null
  return `Cette référence fait partie de ${contexte.dansDesKits} kit${contexte.dansDesKits > 1 ? 's' : ''} : lui donner une composition ferait un kit dans un kit, et le stock des kits qui la contiennent tomberait à zéro.`
}

/**
 * Ce qu'une composition dit au client, quand elle est bancale.
 *
 * `availabilityForKit` refuse de déclarer disponible un kit sans composant
 * obligatoire — « un kit sans composant obligatoire n'est pas un kit » — et
 * renvoie une rupture. Une composition faite uniquement de compléments
 * facultatifs met donc le kit en rupture définitive, sans que rien à l'écran
 * ne l'explique. C'est le seul avertissement de ce fichier : il ne refuse
 * rien, parce qu'une composition s'écrit ligne par ligne et qu'elle est
 * forcément incomplète entre deux ajouts.
 */
export function avertissementComposition(
  composants: readonly { required: boolean }[],
): string | null {
  if (composants.length === 0) return null
  if (composants.some((composant) => composant.required)) return null
  return "Aucun composant n'est indispensable : la boutique déclare ce kit en rupture, car elle calcule son stock depuis ses composants obligatoires."
}

/* -------------------------------------------------------------------------- */
/* Compatibilités véhicule                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Comment nommer un véhicule en une ligne.
 *
 * Le référentiel répète presque toujours le modèle dans le nom de la
 * génération — 2 863 générations sur 2 876 commencent par le nom de leur
 * modèle. Concaténer les trois niveaux donne « Volkswagen Golf 2 Golf 2 », et
 * une liste de dix propositions ainsi libellées est illisible.
 *
 * Le modèle n'est donc écrit que lorsque la génération ne le porte pas déjà :
 * « Volkswagen Golf VII », mais « Peugeot 208 II » si la génération s'appelle
 * seulement « II ». La comparaison exige une coupure après le nom du modèle —
 * un modèle « 20 » ne doit pas disparaître devant une génération « 208 », qui
 * est un autre véhicule.
 */
export function libelleVehicule(vehicule: {
  marque: string
  modele: string
  generation: string
}): string {
  const marque = vehicule.marque.trim()
  const modele = vehicule.modele.trim()
  const generation = vehicule.generation.trim()

  const debut = generation.slice(0, modele.length).toLowerCase()
  const suite = generation.slice(modele.length)
  const porteLeModele =
    modele.length > 0 && debut === modele.toLowerCase() && !/^[a-z0-9]/i.test(suite)

  return [marque, porteLeModele ? '' : modele, generation].filter(Boolean).join(' ')
}

/**
 * Pourquoi cette compatibilité ne peut pas être créée, ou `null`.
 *
 * La table porte `@@unique([configurationId, positionId, variantId])` : une
 * même référence, sur un même emplacement, pour une même configuration, n'a
 * qu'une ligne. Le doublon est refusé en désignant la ligne existante, parce
 * que c'est elle qu'il faut modifier — et parce qu'un statut écrasé sans
 * prévenir ferait disparaître une vérification datée.
 */
export function raisonCompatibiliteRefusee(contexte: {
  configurationId: string
  positionId: string
  variantId: string
  existantes: readonly {
    configurationId: string
    positionId: string
    variantId: string
    libelle: string
  }[]
}): string | null {
  if (
    contexte.configurationId.length === 0 ||
    contexte.positionId.length === 0 ||
    contexte.variantId.length === 0
  ) {
    return 'Choisissez un véhicule, un emplacement et une référence.'
  }

  const doublon = contexte.existantes.find(
    (ligne) =>
      ligne.configurationId === contexte.configurationId &&
      ligne.positionId === contexte.positionId &&
      ligne.variantId === contexte.variantId,
  )
  if (doublon) {
    return `Cette compatibilité est déjà documentée : ${doublon.libelle}. Modifiez la ligne existante.`
  }
  return null
}

/**
 * Une configuration désactivée accepte une compatibilité, mais le site ne la
 * propose pas : les pages de packs filtrent les configurations sur `active`.
 * Le dire sur la ligne concernée est tout ce qui distingue un travail
 * d'anticipation d'un travail perdu.
 */
export function noteConfigurationInactive(configuration: { active: boolean }): string | null {
  if (configuration.active) return null
  return "Cette configuration est désactivée : le parcours véhicule ne la propose pas, et la compatibilité ne se voit donc pas encore."
}
