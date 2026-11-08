import { typeDeProduit } from './types-produit'
import { formatPrice } from './identity'

/**
 * Référencement de la fiche produit : titre, description, accroche.
 *
 * **Pourquoi ces textes sont fabriqués ici plutôt que lus en base.** L'import
 * des packs par véhicule (`scripts/import-packs-vehicule.ts`) écrivait les
 * mêmes phrases sur les 10 000 fiches : un titre terminé par « — LUMERA »,
 * l'ancien nom de travail, et une description qui finissait par
 * « Compatibilité à vérifier avant commande ». Google lisait donc l'ancien nom
 * dans chaque titre, et une mise en garde à la place d'un argument.
 *
 * La règle est simple :
 *
 * - un titre ou une description **écrits à la main** au back-office passent
 *   toujours en premier ;
 * - ceux que l'import a posés (les anciens comme les nouveaux) sont
 *   reconnus et remplacés par la version construite ici, à partir de ce que
 *   la base sait réellement : le véhicule, ses années de production, la
 *   franchise de port et le délai de retour configurés.
 *
 * Rien n'est inventé : pas de culot (la valeur de la boutique, c'est la
 * compatibilité, pas la référence d'ampoule), pas de puissance, pas de note.
 */

/** Le véhicule pour lequel une fiche est composée — une seule génération. */
export type VehiculeDeLaFiche = {
  marque: { nom: string; slug: string }
  modele: { nom: string; slug: string }
  generation: {
    nom: string
    slug: string
    phase: string | null
    anneeDebut: number
    /** Nul si la génération est toujours produite. */
    anneeFin: number | null
  }
  /** Page « Éclairage » de la génération, ou null si elle n'est pas publiée. */
  chemin: string | null
  /** Page de la marque, ou null si elle n'est pas publiée. */
  cheminMarque: string | null
}

/** « 2010–2018 », ou « depuis 2018 » pour une génération toujours produite. */
export function anneesCourtes(debut: number, fin: number | null): string {
  if (fin === null) return `depuis ${debut}`
  return debut === fin ? String(debut) : `${debut}–${fin}`
}

/** « de 2010 à 2018 », « en 2018 », ou « depuis 2018 ». */
export function anneesEnToutesLettres(debut: number, fin: number | null): string {
  if (fin === null) return `depuis ${debut}`
  return debut === fin ? `en ${debut}` : `de ${debut} à ${fin}`
}

/**
 * « Audi A1 II » : la marque, puis la génération.
 *
 * Certaines générations portent déjà la marque dans leur nom (« Subaru
 * Outback III ») ; on ne la répète pas.
 */
export function nomDuVehicule(vehicule: Pick<VehiculeDeLaFiche, 'marque' | 'generation'>): string {
  const { marque, generation } = vehicule
  const nom = enChiffres(generation.nom)
  return nom.toLocaleLowerCase('fr-FR').startsWith(marque.nom.toLocaleLowerCase('fr-FR'))
    ? nom
    : `${marque.nom} ${nom}`
}

const CHIFFRES_ROMAINS: Record<string, string> = {
  II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9',
}

/**
 * « Berlingo II » → « Berlingo 2 », « Golf VII » → « Golf 7 ».
 *
 * Google Trends, France, 5 ans : « clio 4 » est tapé 29 fois plus que
 * « clio iv », « golf 7 » 75 fois plus que « golf vii ». Le chiffre romain
 * n'est converti que derrière un nom en lettres : « 208 II » reste tel quel,
 * « 208 2 » ne se lit pas (et personne ne le tape). « X » n'est jamais
 * converti : c'est presque toujours un nom (X-Trail, Mokka X, Aygo X), et
 * « Classe V » est un modèle, pas une cinquième génération.
 */
export function enChiffres(nom: string): string {
  return nom.replace(
    /([\p{L}-]*\p{L})\s+(VIII|VII|VI|IV|IX|III|II|V)(?=$|\s)/gu,
    (tout: string, mot: string, romain: string) =>
      mot === 'Classe' ? tout : `${mot} ${CHIFFRES_ROMAINS[romain]}`,
  )
}

/** « Mini Mini Cooper » → « Mini Cooper » : la marque répétée par le relevé. */
export function sansMarqueRepetee(nom: string): string {
  return nom.replace(/^(\S+) \1(?= )/i, '$1')
}

/**
 * L'emplacement dit avec les mots que les clients tapent.
 *
 * Mesuré sur Google Trends (France, 5 ans) : « ampoule plaque immatriculation »
 * est cherché 8 fois plus que « éclairage plaque immatriculation » ; pour
 * l'habitacle, Google lui-même propose « LED intérieur » ; « ampoule feux de
 * croisement » l'emporte largement sur « ampoule phare voiture ». Le synonyme
 * entre parenthèses couvre la seconde façon de chercher.
 */
const EMPLACEMENT_DES_CLIENTS: Record<string, string> = {
  phares: 'feux de croisement (phares)',
  veilleuses: 'veilleuses (feux de position)',
  'éclairage de plaque': 'plaque d’immatriculation',
  habitacle: 'intérieur (plafonnier)',
  antibrouillards: 'antibrouillards',
  'antibrouillard arrière': 'antibrouillard arrière',
  clignotants: 'clignotants',
  'clignotants arrière': 'clignotants arrière',
  'feux de recul': 'feux de recul',
  'feux de jour': 'feux de jour',
  'feux de route': 'feux de route',
}

export type PackParVehicule = {
  /** Ce que contient le pack : des LED, ou des ampoules halogènes effet xénon. */
  technologie: 'LED' | 'effet xénon'
  /** L'emplacement tel qu'il est écrit dans le nom (« phares »). */
  position: string
  /** L'emplacement dit avec les mots des clients. */
  emplacement: string
  vehicule: string
}

/**
 * Le nom d'un pack par véhicule, découpé : « Pack LED veilleuses pour
 * Renault Clio 4 » → LED, emplacement « veilleuses », véhicule « Renault
 * Clio 4 ». Reconnaît aussi « Pack ampoules effet xénon phares pour … »
 * (`lib/effet-xenon.ts`). Null pour tout autre produit, ou un emplacement
 * inconnu.
 */
export function lirePackParVehicule(nom: string): PackParVehicule | null {
  const morceaux = /^Pack (LED|ampoules effet xénon) (.+?) pour (.+)$/.exec(nom.trim())
  if (!morceaux) return null
  const emplacement = EMPLACEMENT_DES_CLIENTS[morceaux[2]]
  if (!emplacement) return null
  return {
    technologie: morceaux[1] === 'LED' ? 'LED' : 'effet xénon',
    position: morceaux[2],
    emplacement,
    vehicule: enChiffres(sansMarqueRepetee(morceaux[3])),
  }
}

/* -------------------------------------------------------------------------- */
/* Ce que l'import a écrit                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Titre posé par l'import, et non par une personne : l'ancien « … — LUMERA »,
 * ou le simple nom du produit recopié.
 */
export function estUnTitreDImport(metaTitle: string, nom: string): boolean {
  const titre = metaTitle.trim()
  return titre === nom.trim() || /\s[—-]\s*LUMERA$/i.test(titre)
}

/**
 * Description posée par l'import : celle qui finit par la mise en garde, ou
 * la description courte recopiée.
 */
export function estUneDescriptionDImport(metaDescription: string, description: string | null): boolean {
  const texte = metaDescription.trim()
  return (
    /Compatibilité à vérifier avant commande/i.test(texte) ||
    (description !== null && texte === description.trim())
  )
}

/** L'accroche que l'import écrit : « Pour les phares de votre Audi A1 ». */
export function estUneAccrocheDImport(accroche: string): boolean {
  return /^Pour les .+ de votre .+$/.test(accroche.trim())
}

/* -------------------------------------------------------------------------- */
/* Textes construits                                                          */
/* -------------------------------------------------------------------------- */

type ProduitPourLeSeo = {
  name: string
  tagline: string | null
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
}

/** Le nom, suivi des années de la génération quand il ne les porte pas déjà. */
export function nomAvecAnnees(nom: string, vehicule: VehiculeDeLaFiche | null): string {
  if (!vehicule) return nom
  const { anneeDebut, anneeFin } = vehicule.generation
  if (nom.includes(String(anneeDebut))) return nom
  return `${nom} (${anneesCourtes(anneeDebut, anneeFin)})`
}

/**
 * Ce que le client tape, dans l'ordre où il le tape : « Ampoules LED plaque
 * d’immatriculation Renault Clio 4 (2012–2019) ».
 *
 * « Ampoule » d'abord : c'est le mot du client (« ampoule clio 4 » est
 * cherché 2 fois plus que « led clio 4 », et « kit » ou « pack » presque
 * jamais). Le nom du produit, lui, ne change pas : le titre affiché sur la
 * page reste « Pack LED … ».
 */
function intituleSeo(produit: ProduitPourLeSeo, vehicule: VehiculeDeLaFiche | null): string {
  const pack = lirePackParVehicule(produit.name)
  if (!pack) return nomAvecAnnees(enChiffres(produit.name), vehicule)
  // Ampoules halogènes : « Ampoules feux de croisement effet xénon Renault
  // Clio 4 », sans LED promise (lib/effet-xenon.ts).
  if (pack.technologie === 'effet xénon') {
    const emplacement = pack.position === 'phares' ? 'feux de croisement' : pack.emplacement
    return nomAvecAnnees(`Ampoules ${emplacement} effet xénon ${pack.vehicule}`, vehicule)
  }
  // Les packs « LED phares » qui restent sont surtout des phares LED
  // additionnels de moto et de SSV : ce ne sont pas des ampoules.
  if (pack.position === 'phares') return nomAvecAnnees(`Phares LED ${pack.vehicule}`, vehicule)
  return nomAvecAnnees(`Ampoules LED ${pack.emplacement} ${pack.vehicule}`, vehicule)
}

/**
 * Balise `<title>`, sans la marque de la boutique : le gabarit du site
 * l'ajoute (« … — LEDVROOM »).
 *
 * « Ampoules LED feux de croisement (phares) Audi A1 (2010–2018) ». Les
 * années départagent deux générations du même modèle (A1 et A1 II).
 */
export function titreSeo(produit: ProduitPourLeSeo, vehicule: VehiculeDeLaFiche | null): string {
  const saisi = produit.metaTitle?.trim()
  if (saisi && !estUnTitreDImport(saisi, produit.name)) return saisi
  return intituleSeo(produit, vehicule)
}

/**
 * Meta description : ce qu'on achète, pour quel véhicule, puis les deux
 * conditions qui décident d'un clic — la livraison et le retour. Une fiche
 * qui n'est pas liée à un seul véhicule garde son texte d'origine.
 */
export function descriptionSeo(
  produit: ProduitPourLeSeo,
  vehicule: VehiculeDeLaFiche | null,
  conditions: {
    seuilFranchiseCents: number | null
    retourJours: number | null
    /** « 5 ans » : la garantie, l'argument le plus fort dans un résultat Google. */
    garantie?: string | null
  },
): string | undefined {
  const saisie = produit.metaDescription?.trim()
  if (saisie && !estUneDescriptionDImport(saisie, produit.description)) return saisie

  if (!vehicule) {
    return [produit.description, produit.tagline]
      .map((texte) => texte?.trim())
      .find((texte) => texte && !/Compatibilité à vérifier avant commande/i.test(texte))
  }

  // Feux additionnels, centrale, clignotants complets : ce qu'on reçoit, pas
  // « sans modifier le câblage » (lib/types-produit.ts).
  const type = typeDeProduit(produit.name)
  const phrases = [
    type
      ? `${intituleSeo(produit, vehicule)}. ${type.contenu}`
      : `${intituleSeo(produit, vehicule)}, en pack prêt à monter sans modifier le câblage.`,
  ]
  const { seuilFranchiseCents, retourJours, garantie } = conditions
  if (garantie && seuilFranchiseCents !== null) {
    // Garantie et livraison offerte : la ligne tient dans l'extrait Google ;
    // les retours restent sur la fiche.
    phrases.push(`Garantie ${garantie}, livraison offerte dès ${formatPrice(seuilFranchiseCents)}.`)
  } else if (garantie) {
    phrases.push(`Garantie ${garantie}${retourJours ? `, retours sous ${retourJours} jours` : ''}.`)
  } else if (seuilFranchiseCents !== null && retourJours) {
    phrases.push(`Livraison offerte dès ${formatPrice(seuilFranchiseCents)}, retours sous ${retourJours} jours.`)
  } else if (seuilFranchiseCents !== null) {
    phrases.push(`Livraison offerte dès ${formatPrice(seuilFranchiseCents)}.`)
  } else if (retourJours) {
    phrases.push(`Retours sous ${retourJours} jours.`)
  }
  return phrases.join(' ')
}

/**
 * La ligne sous le titre.
 *
 * L'accroche de l'import (« Pour les phares de votre Audi A1 ») répétait le
 * titre mot pour mot. Quand la fiche est liée à une génération, elle donne à
 * la place ce que le titre ne dit pas : les années de production. Une
 * accroche écrite à la main reste telle quelle.
 */
export function accrocheSousLeTitre(
  accroche: string | null,
  vehicule: VehiculeDeLaFiche | null,
): string | null {
  if (!vehicule || (accroche && !estUneAccrocheDImport(accroche))) return accroche
  const { anneeDebut, anneeFin } = vehicule.generation
  return `Pour les ${nomDuVehicule(vehicule)} produites ${anneesEnToutesLettres(anneeDebut, anneeFin)}.`
}

/**
 * Le rédactionnel de l'import commençait par « composé pour la Audi A1 ».
 * La tournure « pour votre » vaut pour toutes les marques, sans élision à
 * gérer.
 */
export function corrigerRedactionnelDImport(texte: string): string {
  return texte.replace(/LED composé pour la /g, 'LED composé pour votre ')
}
