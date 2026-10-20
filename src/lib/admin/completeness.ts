/**
 * Ce qui manque à une fiche produit, et ce qui interdit de la publier.
 *
 * Le back-office dit déjà « non renseigné » champ par champ. C'est utile quand
 * on lit une fiche en entier ; ça ne l'est plus quand on en administre deux
 * cents et qu'il faut savoir laquelle est prête. Ce module répond à la seule
 * question qui compte avant publication : **qu'est-ce qui empêche ce produit
 * d'être vendu correctement ?**
 *
 * Trois niveaux, et la distinction n'est pas cosmétique :
 *
 * - `bloquant` : la fiche serait fausse ou inutilisable en ligne. Un prix sans
 *   taux de TVA affiche un HT faux ; un produit sans rubrique n'a pas de fil
 *   d'Ariane et n'apparaît dans aucun menu ; sans variante vendable il n'y a
 *   rien à acheter. On refuse la publication.
 * - `important` : la fiche fonctionne, mais elle dessert le produit ou le
 *   client — pas de visuel, pas de texte alternatif, aucune caractéristique,
 *   une compatibilité affirmée sans source.
 * - `confort` : ce qui améliore sans manquer.
 *
 * **Rien ici n'invente de contenu.** Le relevé dit ce qui est absent ; il ne
 * remplit rien et ne publie rien. C'est une liste de travail pour
 * l'administrateur, pas un correcteur automatique.
 *
 * La règle vit à part des écrans parce qu'elle se teste, et parce que deux
 * endroits s'en servent : le bouton de publication, qui doit refuser, et la
 * fiche d'administration, qui doit expliquer.
 */

export type NiveauManque = 'bloquant' | 'important' | 'confort'

export type Manque = {
  niveau: NiveauManque
  /** Ce qui manque, nommé comme l'administrateur le cherchera. */
  champ: string
  /** Pourquoi ça compte, en une phrase. Jamais « champ obligatoire ». */
  consequence: string
}

/** Forme minimale attendue : celle que `getAdminProduct` renvoie déjà. */
export type ProduitExamine = {
  status: string
  tagline: string | null
  description: string | null
  body: string | null
  metaTitle: string | null
  metaDescription: string | null
  bulbBase: string | null
  categories: Array<unknown>
  specs: Array<unknown>
  media: Array<{ media: { alt: string | null } }>
  variants: Array<{
    active: boolean
    priceCents: number
    vatRateId: string | null
    sku: string
    stockOnHand: number
    backorder: boolean
    fitments: Array<{ status: string; source: string | null; verifiedAt: Date | null }>
  }>
}

export function releverManques(produit: ProduitExamine): Manque[] {
  const manques: Manque[] = []
  const variantesActives = produit.variants.filter((variante) => variante.active)

  /* ---- Bloquants : la fiche serait fausse ou inutilisable en ligne ---- */

  if (variantesActives.length === 0) {
    manques.push({
      niveau: 'bloquant',
      champ: 'Conditionnement',
      consequence: "Aucune variante active : il n'y a rien à acheter sur la fiche.",
    })
  }

  for (const variante of variantesActives) {
    if (variante.priceCents <= 0) {
      manques.push({
        niveau: 'bloquant',
        champ: `Prix — ${variante.sku}`,
        consequence: 'Un conditionnement à 0 € serait vendu gratuitement.',
      })
    }
    if (!variante.vatRateId) {
      manques.push({
        niveau: 'bloquant',
        champ: `Taux de TVA — ${variante.sku}`,
        consequence: "Sans taux, le HT affiché sur la fiche et la facture est faux.",
      })
    }
  }

  if (produit.categories.length === 0) {
    manques.push({
      niveau: 'bloquant',
      champ: 'Rubrique',
      consequence:
        "Sans rubrique, le produit n'a pas de fil d'Ariane et n'apparaît dans aucun menu.",
    })
  }

  /* ---- Importants : la fiche dessert le produit ou le client ---- */

  if (produit.media.length === 0) {
    manques.push({
      niveau: 'important',
      champ: 'Visuels',
      consequence: "La fiche s'affiche sans galerie : le client achète sans rien voir.",
    })
  }

  const sansAlt = produit.media.filter((entree) => !entree.media.alt?.trim()).length
  if (sansAlt > 0) {
    manques.push({
      niveau: 'important',
      champ: `Texte alternatif — ${sansAlt} visuel${sansAlt > 1 ? 's' : ''}`,
      consequence: 'Un visuel sans texte alternatif est invisible pour un lecteur d’écran.',
    })
  }

  if (!produit.tagline?.trim()) {
    manques.push({
      niveau: 'important',
      champ: 'Accroche',
      consequence: 'La ligne sous le titre reste vide, en haut de la fiche.',
    })
  }

  if (produit.specs.length === 0) {
    manques.push({
      niveau: 'important',
      champ: 'Caractéristiques',
      consequence: "La section caractéristiques ne s'affiche pas : culot, teinte et tension manquent.",
    })
  }

  /*
    Une compatibilité CONFIRMÉE engage la boutique : c'est la seule qui fasse
    disparaître l'invitation à vérifier. L'affirmer sans source ni date, c'est
    s'exposer à ne plus savoir d'où elle vient le jour où elle est contestée.
  */
  const confirmeesSansSource = produit.variants
    .flatMap((variante) => variante.fitments)
    .filter((fitment) => fitment.status === 'CONFIRMED' && (!fitment.source || !fitment.verifiedAt))
  if (confirmeesSansSource.length > 0) {
    manques.push({
      niveau: 'important',
      champ: `Source de compatibilité — ${confirmeesSansSource.length} ligne${confirmeesSansSource.length > 1 ? 's' : ''}`,
      consequence:
        'Compatibilité confirmée sans source ni date de vérification : elle ne sera pas défendable.',
    })
  }

  /* ---- Confort ---- */

  if (!produit.metaTitle?.trim() || !produit.metaDescription?.trim()) {
    manques.push({
      niveau: 'confort',
      champ: 'Référencement',
      consequence: 'Sans titre ni description, les moteurs reprennent un extrait au hasard.',
    })
  }

  if (!produit.body?.trim() && !produit.description?.trim()) {
    manques.push({
      niveau: 'confort',
      champ: 'Rédactionnel',
      consequence: 'La fiche n’a aucun texte long : la section « La référence » reste absente.',
    })
  }

  return manques
}

/** Vrai quand rien n'interdit la publication. */
export function publiable(manques: Manque[]): boolean {
  return !manques.some((manque) => manque.niveau === 'bloquant')
}
