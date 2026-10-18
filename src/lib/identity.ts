/**
 * Identité commerciale et coordonnées — point unique de modification.
 *
 * « LUMERA » est un nom de travail. Changer la marque, le domaine, les
 * coordonnées ou les conditions affichées se fait ici (ou, une fois la base en
 * place, depuis la table `Setting` qui reprend les mêmes clés et prend le pas
 * sur ces valeurs par défaut).
 *
 * Rien dans ce fichier ne doit affirmer un délai garanti, une certification ou
 * un volume de ventes : les champs correspondants restent vides tant que
 * l'information n'a pas été validée.
 */

export const identity = {
  /** Nom affiché partout : header, footer, e-mails, documents. */
  name: 'LUMERA',
  /** Le point final fait partie du logotype des maquettes. */
  wordmarkSuffix: '.',
  baseline: 'Éclairage auto & moto',
  tagline: 'Le bon éclairage pour votre véhicule, avec les bons accessoires.',

  /** Renseigner avant toute ouverture commerciale. */
  legal: {
    companyName: null as string | null,
    legalForm: null as string | null,
    siret: null as string | null,
    vatNumber: null as string | null,
    capital: null as string | null,
    address: null as string | null,
    rcs: null as string | null,
    publicationDirector: null as string | null,
    hostingProvider: 'Render Services, Inc.',
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
