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
  return generation.nom.toLocaleLowerCase('fr-FR').startsWith(marque.nom.toLocaleLowerCase('fr-FR'))
    ? generation.nom
    : `${marque.nom} ${generation.nom}`
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
 * Balise `<title>`, sans la marque de la boutique : le gabarit du site
 * l'ajoute (« … — LEDVROOM »).
 *
 * « Pack LED phares pour Audi A1 (2010–2018) ». Les années départagent deux
 * générations du même modèle (A1 et A1 II), et c'est ce que le client tape.
 */
export function titreSeo(produit: ProduitPourLeSeo, vehicule: VehiculeDeLaFiche | null): string {
  const saisi = produit.metaTitle?.trim()
  if (saisi && !estUnTitreDImport(saisi, produit.name)) return saisi
  return nomAvecAnnees(produit.name, vehicule)
}

/**
 * Meta description : ce qu'on achète, pour quel véhicule, puis les deux
 * conditions qui décident d'un clic — la livraison et le retour. Une fiche
 * qui n'est pas liée à un seul véhicule garde son texte d'origine.
 */
export function descriptionSeo(
  produit: ProduitPourLeSeo,
  vehicule: VehiculeDeLaFiche | null,
  conditions: { seuilFranchiseCents: number | null; retourJours: number | null },
): string | undefined {
  const saisie = produit.metaDescription?.trim()
  if (saisie && !estUneDescriptionDImport(saisie, produit.description)) return saisie

  if (!vehicule) {
    return [produit.description, produit.tagline]
      .map((texte) => texte?.trim())
      .find((texte) => texte && !/Compatibilité à vérifier avant commande/i.test(texte))
  }

  const phrases = [
    `${nomAvecAnnees(produit.name, vehicule)} : kit plug & play composé pour ce véhicule, sans modifier le câblage.`,
  ]
  const { seuilFranchiseCents, retourJours } = conditions
  if (seuilFranchiseCents !== null && retourJours) {
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
