/**
 * Arborescence de navigation.
 *
 * Ces entrées sont les valeurs par défaut : la table `MenuEntry` les remplace
 * dès que le back-office en publie une version, sans toucher au code.
 * L'ordre et les libellés reprennent 03-header-final.png.
 */

export type NavItem = {
  label: string
  href: string
  /** Mis en avant en rouge dans la barre de navigation. */
  highlight?: boolean
  description?: string
  children?: NavItem[]
}

export const topNav: Array<NavItem & { icon: 'return' | 'help' }> = [
  { label: 'Livraison & retours', href: '/livraison-retours', icon: 'return' },
  { label: 'Aide & contact', href: '/contact', icon: 'help' },
]

export const mainNav: NavItem[] = [
  {
    label: 'Phares LED',
    href: '/c/phares-led',
    description: 'Feux de croisement, de route et antibrouillards.',
    children: [
      { label: 'Feux de croisement', href: '/c/phares-led/croisement' },
      { label: 'Feux de route', href: '/c/phares-led/route' },
      { label: 'Antibrouillards', href: '/c/phares-led/antibrouillard' },
    ],
  },
  {
    label: 'Intérieur',
    href: '/c/interieur',
    description: 'Habitacle, plafonnier, coffre et boîte à gants.',
    children: [
      { label: 'Plafonniers', href: '/c/interieur/plafonnier' },
      { label: 'Coffre et boîte à gants', href: '/c/interieur/coffre' },
      { label: 'Seuils de porte', href: '/c/interieur/seuils' },
    ],
  },
  {
    label: 'Plaque & recul',
    href: '/c/plaque-recul',
    description: "Éclairage de plaque, feux de recul et veilleuses.",
    children: [
      { label: 'Éclairage de plaque', href: '/c/plaque-recul/plaque' },
      { label: 'Feux de recul', href: '/c/plaque-recul/recul' },
      { label: 'Veilleuses', href: '/c/plaque-recul/veilleuses' },
    ],
  },
  {
    label: 'Clignotants',
    href: '/c/clignotants',
    description: 'Clignotants avant, arrière et répétiteurs.',
    children: [
      { label: 'Clignotants avant', href: '/c/clignotants/avant' },
      { label: 'Clignotants arrière', href: '/c/clignotants/arriere' },
      { label: 'Répétiteurs', href: '/c/clignotants/repetiteurs' },
    ],
  },
  {
    label: 'Xénon',
    href: '/c/xenon',
    description: "Ampoules xénon de remplacement.",
  },
  {
    label: 'Moto',
    href: '/c/moto',
    description: 'Éclairage avant, arrière et clignotants deux-roues.',
  },
  {
    label: 'Packs par véhicule',
    href: '/vehicule',
    highlight: true,
    description: 'Partez de votre véhicule plutôt que du culot.',
  },
]

/** Accessoires : accessibles depuis les fiches et le pied de page. */
export const accessoryNav: NavItem[] = [
  { label: 'Adaptateurs', href: '/c/accessoires/adaptateurs' },
  { label: 'Décodeurs anti-erreur', href: '/c/accessoires/decodeurs' },
  { label: 'Supports et entretoises', href: '/c/accessoires/supports' },
]

export const footerNav: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Acheter',
    items: [
      ...mainNav.map(({ label, href }) => ({ label, href })),
      { label: 'Accessoires', href: '/c/accessoires' },
    ],
  },
  {
    title: 'Aide',
    items: [
      { label: 'Conseils & montage', href: '/guides' },
      { label: 'Questions fréquentes', href: '/faq' },
      { label: 'Nous contacter', href: '/contact' },
      { label: 'Suivre ma commande', href: '/suivi' },
    ],
  },
  {
    title: 'Commander',
    items: [
      { label: 'Livraison & retours', href: '/livraison-retours' },
      { label: 'Garanties', href: '/garanties' },
      { label: 'Moyens de paiement', href: '/paiement' },
      { label: 'Mon compte', href: '/compte' },
    ],
  },
  {
    title: 'Informations',
    items: [
      { label: 'Mentions légales', href: '/mentions-legales' },
      { label: 'Conditions générales de vente', href: '/cgv' },
      { label: 'Confidentialité', href: '/confidentialite' },
      { label: 'Cookies', href: '/cookies' },
    ],
  },
]
