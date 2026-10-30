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
  // Vers /aide et non /contact : l'entrée porte les deux mots, et la page
  // d'aide réunit le suivi, les questions publiées et le formulaire.
  //
  // « Livraison & retours » a quitté cette barre pour suivre la maquette.
  // Rien n'est perdu : le pied de page et le panier y mènent toujours, et
  // le seuil de livraison offerte reste annoncé à gauche de cette barre.
  { label: 'Aide & contact', href: '/aide', icon: 'help' },
]

/**
 * Repli statique, utilisé uniquement par la page 404.
 *
 * La navigation du site vient désormais du catalogue
 * (`lib/queries/navigation.ts`). Cette liste ne sert qu'à proposer des
 * sorties sur une page d'erreur, où une requête supplémentaire serait mal
 * venue : on y est déjà parce que quelque chose n'a pas marché.
 *
 * **Les sous-entrées ont été retirées.** Elles étaient écrites à la main —
 * « Feux de croisement », « Plafonniers », « Adaptateurs »… — et pointaient
 * sur des catégories qui n'existent pas : les sept liens du menu mobile
 * répondaient 404. Ce qui se déplie aujourd'hui vient de la base, et ne peut
 * donc pas désigner une page absente.
 */
export const mainNav: NavItem[] = [
  { label: 'Packs Auto & Utilitaires', href: '/packs/auto', highlight: true },
  { label: 'Packs Moto & Scooter', href: '/packs/moto' },
  { label: 'Ampoules & Kits LED', href: '/c/phares-led' },
  { label: 'LED au détail', href: '/c/interieur' },
  { label: 'Xénon & Halogène', href: '/c/xenon' },
  { label: 'Accessoires', href: '/c/accessoires' },
  { label: 'Toutes les catégories', href: '/c' },
]
export const footerNav: Array<{ title: string; items: NavItem[] }> = [
  {
    /*
      Colonne écrite en propre, et non dérivée de `mainNav`.

      Elle l'était, et `mainNav` ayant gagné son entrée « Accessoires », la
      colonne en portait deux : même href, même clé React, un lien affiché en
      double. Les deux listes n'ont pas le même rôle — le pied de page n'a pas
      à suivre l'ordre du menu — et les coupler n'apportait rien.
    */
    title: 'Acheter',
    items: [
      { label: 'Packs Auto & Utilitaires', href: '/packs/auto' },
      { label: 'Packs Moto & Scooter', href: '/packs/moto' },
      { label: 'Ampoules & Kits LED', href: '/c/phares-led' },
      { label: 'LED au détail', href: '/c/interieur' },
      { label: 'Xénon & Halogène', href: '/c/xenon' },
      { label: 'Accessoires', href: '/c/accessoires' },
      { label: 'Toutes les catégories', href: '/c' },
    ],
  },
  {
    /*
      « Questions fréquentes » menait à /faq, un gabarit « page non encore
      construite ». Les questions publiées sont désormais sur /aide, avec le
      suivi et le formulaire autour : l'entrée pointe là, et /faq y redirige.

      « Conseils & montage » reste sur /guides, qui attend toujours ses guides
      et le dit : c'est une page de contenu à écrire, pas un doublon.
    */
    title: 'Aide',
    items: [
      { label: 'Conseils & montage', href: '/guides' },
      { label: 'Aide & contact', href: '/aide' },
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
