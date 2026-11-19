/**
 * Les gestes que la mesure sait reconnaître, et leur nom.
 *
 * **Pourquoi une liste close.** Jusqu'ici un geste n'était connu que par le
 * texte du bouton cliqué : « Ajouter au panier », « Vérifier avec mon
 * véhicule ». C'est fragile de deux façons. Le jour où le texte change, la
 * série repart de zéro et les mois précédents deviennent incomparables. Et
 * surtout, un clic ne dit pas si le geste a abouti : un clic sur « Ajouter au
 * panier » compte pareil que l'ajout ait réussi ou qu'il ait été refusé pour
 * rupture — or ce sont deux histoires opposées.
 *
 * Un nom stable règle les deux : il ne bouge pas quand l'interface bouge, et
 * il est émis à l'endroit où l'on connaît le résultat.
 *
 * **Ce qui reste interdit, comme partout dans la mesure.** Aucun nom ne porte
 * de donnée personnelle, et les précisions (`label`) sont nettoyées comme les
 * textes cliqués : jamais d'e-mail, jamais de chiffres sur les pages privées
 * (lib/mesure-chemins.ts). Un `value` est un prix en centimes ou un compte,
 * jamais un identifiant.
 */

/** Un événement, et comment le back-office le raconte. */
export type DescriptionEvenement = {
  /** Phrase affichée dans le fil d'une visite et dans les tableaux. */
  libelle: string
  /** Ce que `label` contient, quand il y en a un. */
  precision?: string
  /** Ce que `value` compte, quand il y en a une. */
  chiffre?: 'centimes' | 'nombre'
  /**
   * Un geste que l'on souhaite voir dans l'entonnoir d'intention : il dit que
   * le visiteur a fait un pas vers l'achat, même s'il n'a pas changé de page.
   */
  intention?: boolean
}

export const EVENEMENTS = {
  /* ------------------------------- Le panier ------------------------------ */
  'ajout-panier': {
    libelle: 'A ajouté au panier',
    precision: 'le produit ajouté',
    chiffre: 'centimes',
    intention: true,
  },
  'ajout-panier-refuse': {
    libelle: 'Ajout au panier refusé',
    precision: 'la raison du refus',
  },
  'ajout-pack': {
    libelle: 'A ajouté un pack complet',
    precision: 'le véhicule',
    chiffre: 'centimes',
    intention: true,
  },
  'retrait-panier': { libelle: 'A retiré un article du panier', precision: 'le produit' },
  'quantite-modifiee': { libelle: 'A changé une quantité', chiffre: 'nombre' },

  /* ---------------------------- La compatibilité -------------------------- */
  'verif-compatibilite': {
    libelle: 'A vérifié la compatibilité',
    precision: 'le résultat',
    intention: true,
  },
  'vehicule-choisi': { libelle: 'A choisi son véhicule', precision: 'le véhicule' },
  'vehicule-retire': { libelle: 'A retiré son véhicule' },
  'vehicule-absent': {
    libelle: 'N’a pas trouvé son véhicule',
    precision: 'ce qui était cherché',
  },

  /* ------------------------------ Le catalogue ---------------------------- */
  'recherche-vide': { libelle: 'Recherche sans résultat', precision: 'les termes' },
  'filtre-pose': { libelle: 'A posé un filtre', precision: 'le filtre' },
  'tri-change': { libelle: 'A changé le tri', precision: 'le tri' },
  'rupture-vue': { libelle: 'A vu une rupture de stock', precision: 'le produit' },
  'alerte-stock-posee': { libelle: 'A demandé une alerte de retour en stock' },
  'photo-zoomee': { libelle: 'A agrandi une photo' },
  'description-depliee': { libelle: 'A déplié la description' },
  'option-changee': { libelle: 'A changé d’option', precision: 'l’option' },

  /* ------------------------------ La commande ----------------------------- */
  'code-promo-accepte': { libelle: 'Code promo accepté' },
  'code-promo-refuse': { libelle: 'Code promo refusé' },
  'livraison-choisie': { libelle: 'A choisi un mode de livraison', precision: 'le mode' },
  'commande-envoyee': { libelle: 'A validé la commande', intention: true },
  'commande-refusee': {
    libelle: 'Validation de commande refusée',
    precision: 'ce qui manquait',
  },
  'paiement-abandonne': { libelle: 'A quitté le paiement sans payer' },
  'commande-payee': { libelle: 'Commande payée', chiffre: 'centimes', intention: true },

  /* -------------------------- Les signaux de gêne ------------------------- */
  'clic-rage': {
    libelle: 'Clics répétés au même endroit (agacement)',
    precision: 'ce qui était cliqué',
    chiffre: 'nombre',
  },
  'clic-mort': {
    libelle: 'A cliqué sur quelque chose qui ne réagit pas',
    precision: 'ce qui était cliqué',
  },
  'champ-abandonne': {
    libelle: 'A quitté un formulaire en cours de saisie',
    precision: 'le dernier champ touché',
  },
  'erreur-formulaire': {
    libelle: 'Erreur de saisie signalée',
    precision: 'le champ en faute',
  },
  'retour-arriere': { libelle: 'Est revenu en arrière' },
} as const satisfies Record<string, DescriptionEvenement>

export type NomEvenement = keyof typeof EVENEMENTS

/** Les noms acceptés par /api/mesure. Un nom hors liste est jeté. */
export const NOMS_EVENEMENTS: ReadonlySet<string> = new Set(Object.keys(EVENEMENTS))

export function estUnEvenement(nom: string): nom is NomEvenement {
  return NOMS_EVENEMENTS.has(nom)
}

/** La phrase du back-office pour un nom, ou le nom brut s'il est inconnu. */
export function libelleEvenement(nom: string): string {
  return nom in EVENEMENTS ? EVENEMENTS[nom as NomEvenement].libelle : nom
}

/**
 * Les gestes qui marquent une intention d'achat sans forcément changer de
 * page. L'entonnoir classique ne voit que les pages : quelqu'un qui ajoute au
 * panier depuis une fiche et s'en va n'y apparaît nulle part entre « fiche »
 * et « panier ». Ces noms-là comblent le trou.
 */
export const EVENEMENTS_INTENTION: readonly NomEvenement[] = (
  Object.keys(EVENEMENTS) as NomEvenement[]
).filter((nom) => 'intention' in EVENEMENTS[nom] && EVENEMENTS[nom].intention === true)
