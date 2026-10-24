/**
 * Identité commerciale et coordonnées — point unique de modification.
 *
 * La marque est **LEDVROOM**, sur le domaine ledvroom.com. « LUMERA » était le
 * nom de travail du projet ; il ne subsiste que dans le nom du dépôt et des
 * ressources Render, qui n'apparaissent nulle part côté client.
 *
 * Changer la marque, le domaine, les coordonnées ou les conditions affichées
 * se fait ici (ou, une fois la base en place, depuis la table `Setting` qui
 * reprend les mêmes clés et prend le pas sur ces valeurs par défaut).
 *
 * Rien dans ce fichier ne doit affirmer un délai garanti, une certification ou
 * un volume de ventes : les champs correspondants restent vides tant que
 * l'information n'a pas été validée.
 */

export const identity = {
  /** Nom affiché partout : header, footer, e-mails, documents. */
  name: 'LEDVROOM',
  /**
   * Suffixe du mot-symbole écrit en texte (e-mails, documents).
   *
   * Vide : le logotype fourni ne porte aucun point final, contrairement aux
   * maquettes de travail. Le champ demeure pour que les rendus textuels n'aient
   * pas à savoir s'il y en a un.
   */
  wordmarkSuffix: '',
  /**
   * Début du nom porté en rouge dans les rendus textuels — « LED » de
   * LEDVROOM, comme sur le logotype.
   *
   * Les e-mails ne peuvent pas poser l'image du logotype : beaucoup de
   * messageries bloquent les images distantes par défaut, et un en-tête qui
   * disparaît laisse un message anonyme. Le mot est donc réécrit en texte, et
   * ce champ dit où le couper pour retrouver les deux couleurs.
   */
  wordmarkAccent: 'LED',
  baseline: 'Éclairage auto & moto',
  tagline: 'Le bon éclairage pour votre véhicule, avec les bons accessoires.',

  /**
   * Identité légale de l'éditeur.
   *
   * Les champs à `null` ne sont **pas affichés** : une mention légale fausse
   * expose davantage qu'une mention absente, et le numéro d'immatriculation
   * d'une société ne se devine pas. Les pages légales signalent explicitement
   * ce qui manque, et `readiness.ts` le compte parmi les points bloquants
   * tant que ce n'est pas renseigné.
   *
   * Les champs obligatoires pour vendre en ligne en France (art. L111-1 du
   * code de la consommation et art. 6 III de la LCEN) sont : la dénomination,
   * la forme juridique, le capital, l'adresse du siège, le RCS, le numéro de
   * TVA intracommunautaire et le directeur de la publication.
   */
  legal: {
    /*
      Vérifié au répertoire Sirene le 24 octobre 2026, à partir du SIREN
      907 510 838 : la dénomination exacte est CAR PARTS FRANCE, en trois mots.
      L'adresse du siège et le dirigeant y sont marqués « non-diffusible » —
      la société a exercé son droit d'opposition — et proviennent donc de
      l'exploitant, pas du registre.
    */
    companyName: 'CAR PARTS FRANCE' as string | null,
    legalForm: 'SASU — société par actions simplifiée à associé unique' as string | null,
    /** SIRET du siège. Le SIREN seul ne désigne pas un établissement. */
    siret: '907 510 838 00028' as string | null,
    vatNumber: 'FR61907510838' as string | null,
    capital: '1 €' as string | null,
    /** Adresse complète du siège. La ville seule ne suffit pas. */
    address: '50 boulevard Stalingrad, 06300 Nice, France' as string | null,
    city: 'Nice' as string | null,
    /*
      Le numéro d'immatriculation au RCS est le SIREN ; ce qui le complète est
      la ville du greffe, celle du siège — Nice.
    */
    rcs: 'RCS Nice 907 510 838' as string | null,
    /*
      Pour une personne morale, la loi de 1982 désigne le représentant légal :
      ici le président de la SASU.
    */
    publicationDirector: 'Killian Belabbes' as string | null,
    hostingProvider: 'Render Services, Inc.',
    /** Hébergeur : adresse et téléphone sont exigés par la LCEN. */
    hostingAddress: '525 Brannan Street, Suite 300, San Francisco, CA 94107, États-Unis' as
      | string
      | null,
    /**
     * Médiateur de la consommation. Obligatoire pour un vendeur en ligne
     * (art. L612-1) : l'adhésion à un médiateur agréé est à souscrire, et son
     * nom ne s'invente pas.
     */
    mediator: null as { name: string; url: string; address: string } | null,
  },

  contact: {
    email: null as string | null,
    phone: null as string | null,
    /** Horaires d'assistance, affichés seulement s'ils sont renseignés. */
    hours: null as string | null,
    contactPath: '/contact',
    helpPath: '/aide',
  },

  locale: {
    lang: 'fr',
    country: 'FR',
    currency: 'EUR',
    currencySymbol: '€',
  },
} as const

/**
 * Conditions commerciales affichées dans le bandeau haut et les réassurances.
 * Elles sont volontairement pilotées par des valeurs configurables : aucune
 * formulation définitive n'est écrite en dur dans les composants.
 *
 * `null` = information non validée → la mention correspondante n'est pas
 * affichée plutôt que d'être inventée.
 */
export const commercialTerms = {
  /** Seuil de livraison offerte en centimes TTC. */
  freeShippingThresholdCents: 8000 as number | null,
  /** Délai de rétractation légal en France. */
  returnWindowDays: 14 as number | null,
  /** Garantie commerciale éventuelle, en mois. Null tant que non arbitrée. */
  warrantyMonths: null as number | null,
  /**
   * Estimation d'expédition affichée en fiche produit.
   * Null tant qu'aucune méthode de livraison réelle n'est configurée : les
   * délais doivent provenir de ShippingMethod, pas d'une promesse générique.
   */
  dispatchEstimate: null as string | null,
} as const

export const siteConfig = {
  /** Utilisé pour les URL canoniques, les sitemaps et les e-mails. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400',
  defaultMetaTitle: 'LUMERA — Éclairage LED auto & moto',
  defaultMetaDescription:
    'Kits et ampoules LED pour phares, intérieur, plaque, recul, clignotants, xénon et moto. Sélectionnez votre véhicule pour voir ce qui lui correspond.',
  /**
   * Bandeau « maquette » : visible tant que le site n'est pas ouvert.
   * Les maquettes fournies l'affichaient ; on le garde tant que des données de
   * démonstration sont présentes, pour qu'aucun visiteur ne les prenne pour
   * des données réelles.
   */
  demoBanner: process.env.NEXT_PUBLIC_DEMO_MODE !== 'off',
  demoBannerLabel: 'Préproduction · données de démonstration',
} as const

/**
 * Formate un montant en centimes : « 99,90 € », et « 80 € » pour un montant
 * rond — c'est la graphie des maquettes, et la plus lisible dans un bandeau.
 * `alwaysDecimals` force les deux décimales, pour les totaux et les documents
 * comptables où l'alignement des colonnes prime.
 */
export function formatPrice(
  cents: number,
  { withCurrency = true, alwaysDecimals = false }: { withCurrency?: boolean; alwaysDecimals?: boolean } = {},
): string {
  const isRound = cents % 100 === 0
  const value = (cents / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: alwaysDecimals || !isRound ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return withCurrency ? `${value} ${identity.locale.currencySymbol}` : value
}
