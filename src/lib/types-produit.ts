/**
 * Les fiches qui ne sont pas des packs d'ampoules.
 *
 * Le catalogue par véhicule reprend, emplacement par emplacement, ce que vend
 * le revendeur partenaire (prisma/packs-vehicule*.json). Pour 1 566 fiches, ce
 * n'est pas un pack d'ampoules : des feux additionnels, des phares
 * additionnels, une centrale de clignotants, des clignotants complets… Elles
 * ont d'abord été retirées de la vente parce qu'elles s'annonçaient comme des
 * ampoules « sans modifier le câblage » (8 novembre 2026), puis remises en
 * ligne sous leur vrai nom, à la demande de l'exploitant : « le même catalogue
 * que LedPerf ».
 *
 * Le type se lit dans le nom de la fiche — c'est lui qui a été réécrit (voir
 * la migration 20261108170000). Il décide :
 * - du visuel : une seule photo, celle du produit devant la boîte LEDVROOM
 *   (`public/images-types/<image>.webp`), jamais les avant / après d'ampoules ;
 * - de la phrase de la description Google, à la place de « en pack prêt à
 *   monter sans modifier le câblage » ;
 * - de la réponse à « Faut-il modifier le câblage ? ».
 *
 * Volontairement sans 'server-only' : la galerie et le panier s'en servent.
 */

export type TypeDeProduit = {
  cle: string
  /** Ce que c'est, en quelques mots, pour la carte de la page du véhicule. */
  libelle?: string
  /** Le début du nom de la fiche. */
  prefixe: RegExp
  /** Fichier de `public/images-types/`, sans extension. */
  image: string
  /** Ce qu'on reçoit, en une phrase : description Google et flux. */
  contenu: string
  /** Réponse à « Faut-il modifier le câblage ? ». */
  cablage: string
  /**
   * Vrai pour des ampoules (kits LED de phares, ampoules xénon, feux stop…) :
   * seule la photo change ; le texte, les questions et la description Google
   * restent ceux d'un pack d'ampoules.
   */
  ampoules?: boolean
}

export const TYPES_DE_PRODUIT: TypeDeProduit[] = [
  {
    cle: 'feux-additionnels',
    libelle: 'Feux LED antibrouillard et longue portée',
    prefixe: /^Feux LED antibrouillard et longue portée /,
    image: 'produit-feux-additionnels',
    contenu:
      'Deux feux LED antibrouillard et longue portée, livrés avec faisceau (relais et fusible), interrupteur de guidon et fixations.',
    cablage:
      'Oui, ils se branchent : le faisceau fourni (relais, fusible et interrupteur de guidon) se raccorde à l’alimentation de la moto. Les phares d’origine restent en place.',
  },
  {
    cle: 'phares-additionnels',
    libelle: 'Phares additionnels LED',
    prefixe: /^Phares additionnels LED /,
    image: 'produit-phares-additionnels',
    contenu:
      'Deux phares LED ronds additionnels, livrés avec faisceau (relais et fusible), interrupteur et fixations.',
    cablage:
      'Oui, ils se branchent : le faisceau fourni (relais, fusible et interrupteur) se raccorde à l’alimentation du véhicule. Les phares d’origine restent en place.',
  },
  {
    cle: 'optiques-led',
    libelle: 'Optiques LED pour phares additionnels',
    prefixe: /^Optiques LED pour phares additionnels /,
    image: 'produit-optiques-led',
    contenu: 'Des optiques LED à la place de celles des phares additionnels d’origine.',
    cablage:
      'Non : les optiques LED prennent la place de celles des phares additionnels d’origine et se branchent sur leur prise.',
  },
  {
    cle: 'boitier-phare-rond-chrome',
    libelle: 'Boîtier de phare rond chromé',
    prefixe: /^Boîtier de phare rond chromé /,
    image: 'produit-phare-rond-chrome',
    contenu:
      'Le boîtier de phare rond chromé qui reçoit une optique LED de 7 pouces (optique non fournie).',
    cablage:
      'Le boîtier se fixe à la place du phare d’origine ; l’optique LED de 7 pouces, vendue à part, se branche sur la prise du phare.',
  },
  {
    cle: 'boitier-phare-rond',
    libelle: 'Boîtier de phare rond noir',
    prefixe: /^Boîtier de phare rond /,
    image: 'produit-phare-rond',
    contenu:
      'Le boîtier de phare rond noir satiné qui reçoit une optique LED de 7 pouces (optique non fournie).',
    cablage:
      'Le boîtier se fixe à la place du phare d’origine ; l’optique LED de 7 pouces, vendue à part, se branche sur la prise du phare.',
  },
  {
    cle: 'centrale-clignotants',
    libelle: 'Centrale de clignotants LED',
    prefixe: /^Centrale de clignotants LED /,
    image: 'produit-centrale-clignotants',
    contenu:
      'La centrale électronique qui remet les clignotants LED à la bonne cadence, sans résistance à ajouter.',
    cablage:
      'Non : la centrale se branche à la place de la centrale (le relais) de clignotants d’origine.',
  },
  {
    cle: 'clignotants-sequentiels',
    libelle: 'Clignotants séquentiels LED',
    prefixe: /^Clignotants séquentiels LED /,
    image: 'produit-clignotants-sequentiels',
    contenu:
      'Une paire de clignotants LED à défilement, avec les modules qui évitent le clignotement rapide.',
    cablage:
      'Ils se montent à la place des clignotants d’origine et se branchent sur leurs fils. Les modules fournis évitent le clignotement trop rapide.',
  },
  {
    cle: 'clignotants-retroviseurs',
    libelle: 'Clignotants LED de rétroviseurs',
    prefixe: /^Clignotants dynamiques LED de rétroviseurs /,
    image: 'produit-clignotants-retroviseurs',
    contenu:
      'Une paire de clignotants LED à défilement pour les rétroviseurs, à la place de ceux d’origine.',
    cablage:
      'Non : ils se clipsent à la place des clignotants des rétroviseurs et se branchent sur la prise d’origine.',
  },
  {
    cle: 'repetiteurs',
    libelle: 'Répétiteurs latéraux dynamiques LED',
    prefixe: /^Répétiteurs latéraux dynamiques LED /,
    image: 'produit-repetiteurs',
    contenu:
      'Une paire de répétiteurs latéraux LED à défilement, à la place de ceux des ailes avant.',
    cablage:
      'Non : ils se clipsent à la place des répétiteurs d’origine et se branchent sur la prise d’origine.',
  },
  {
    cle: 'modules-plaque',
    libelle: 'Modules LED de plaque',
    prefixe: /^Modules LED de plaque /,
    image: 'produit-modules-plaque',
    contenu: 'Les boîtiers d’éclairage de plaque complets, à LED, à la place de ceux d’origine.',
    cablage:
      'Non : les modules se clipsent à la place des boîtiers de plaque d’origine et se branchent sur la même prise.',
  },
  {
    cle: 'clignotants-feux-stop',
    libelle: 'Clignotants dynamiques + feux stop',
    prefixe: /^Clignotants dynamiques LED \+ feux stop /,
    image: 'produit-clignotants-feux-stop',
    contenu: 'Une paire de clignotants LED à défilement avec feu arrière et feu stop intégrés.',
    cablage:
      'Ils se montent à la place des clignotants arrière d’origine et se branchent sur les fils des clignotants et du feu stop ; les modules fournis évitent le clignotement rapide.',
  },
  {
    cle: 'clignotants-feux-de-jour',
    libelle: 'Clignotants dynamiques + feux de jour',
    prefixe: /^Clignotants dynamiques LED \+ feux de jour /,
    image: 'produit-clignotants-feux-de-jour',
    contenu: 'Une paire de clignotants LED à défilement avec une bande blanche de feu de jour.',
    cablage:
      'Ils se montent à la place des clignotants avant d’origine ; la bande blanche se branche sur les feux de position, et les modules fournis évitent le clignotement rapide.',
  },
  {
    cle: 'kit-bi-xenon',
    libelle: 'Kit bi-xénon HID',
    prefixe: /^Kit bi-xénon HID /,
    image: 'produit-kit-bi-xenon',
    contenu: 'Un kit xénon HID bi-xénon : l’ampoule et son ballast, avec les câbles.',
    cablage:
      'L’ampoule se branche sur la prise de l’ampoule d’origine et le ballast se fixe près du phare : aucun fil à couper.',
  },
  {
    cle: 'kit-xenon',
    libelle: 'Kit xénon HID',
    prefixe: /^Kit xénon HID /,
    image: 'produit-kit-xenon',
    contenu: 'Un kit xénon HID : les ampoules xénon et leurs ballasts, avec les câbles.',
    cablage:
      'Les ampoules se branchent sur les prises d’origine et les ballasts se fixent près des phares : aucun fil à couper.',
  },
  {
    cle: 'ballast-xenon',
    libelle: 'Ballast xénon',
    prefixe: /^Ballast xénon /,
    image: 'produit-ballast-xenon',
    contenu: 'Le ballast xénon de type origine, le boîtier qui allume et alimente l’ampoule xénon.',
    cablage: 'Non : il se branche à la place du ballast d’origine, sur les mêmes prises.',
  },
  {
    cle: 'optique-ronde',
    libelle: 'Optique LED ronde',
    prefixe: /^Optique LED ronde /,
    image: 'produit-optiques-led',
    contenu: 'Une optique ronde full LED, feu de croisement et feu de route, à la place de l’optique d’origine.',
    cablage: 'Non : elle se monte dans le boîtier du phare d’origine et se branche sur sa prise.',
  },
  {
    cle: 'outils',
    libelle: 'Outils de démontage',
    prefixe: /^Kit de 4 outils de démontage /,
    image: 'produit-outils',
    contenu: 'Quatre outils en plastique pour déclipser caches, boîtiers et garnitures sans rayer ni casser.',
    cablage: '',
  },
  {
    cle: 'gants',
    libelle: 'Gants de montage',
    prefixe: /^Gants de précision /,
    image: 'produit-gants',
    contenu: 'Une paire de gants fins pour manipuler les ampoules sans laisser de traces de doigts.',
    cablage: '',
  },
  // Des ampoules : seule la photo leur est propre.
  ...[
    ['kit-led-phares', /^Kit ampoules (LED|bi-LED) /, 'produit-led-haute-puissance'],
    ['kit-led-mini', /^(Kit ampoule LED taille mini|Ampoule LED phare) /, 'produit-led-moto'],
    ['led-stop', /^(Ampoule LED feu stop|Pack ampoules LED feux stop) /, 'produit-led-stop'],
    ['ampoules-xenon', /^Ampoules xénon d’origine /, 'produit-ampoule-xenon'],
    ['led-xenon', /^Ampoules LED pour phares xénon /, 'produit-led-xenon'],
    ['repetiteurs-ampoules', /^Pack LED répétiteurs latéraux /, 'produit-led-orange', 'Ampoules LED de répétiteurs'],
    ['compteur', /^Kit LED compteur /, 'produit-led-compteur'],
  ].map(([cle, prefixe, image, libelle]) => ({
    cle: cle as string,
    libelle: libelle as string | undefined,
    prefixe: prefixe as RegExp,
    image: image as string,
    contenu: '',
    cablage: '',
    ampoules: true,
  })),
]

/** Le type d'une fiche qui a sa propre photo (ampoules comprises), ou null. */
export function typeDeProduit(nom: string): TypeDeProduit | null {
  return TYPES_DE_PRODUIT.find((type) => type.prefixe.test(nom.trim())) ?? null
}

/** Le type d'une fiche qui n'est PAS un pack d'ampoules, ou null. */
export function typeHorsAmpoules(nom: string): TypeDeProduit | null {
  const type = typeDeProduit(nom)
  return type && !type.ampoules ? type : null
}

/**
 * « le Toyota Hilux », mais « l’Audi A3 », « l’Opel Corsa E » : l'article
 * devant un nom de véhicule.
 */
export function leVehicule(nom: string): string {
  return /^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/.test(nom.trim()) ? `l’${nom}` : `le ${nom}`
}

/**
 * Ce qu'est le produit, en quelques mots : « Kit xénon HID », « Pack LED
 * clignotants arrière ». Sur la page d'un véhicule, plusieurs produits
 * partagent désormais un même emplacement (phares : effet xénon, kit LED,
 * kit xénon…) ; sans cette ligne, leurs cartes ne se distinguaient que par le
 * prix.
 */
export function natureDuProduit(nom: string): string | null {
  const type = typeDeProduit(nom)
  if (type?.libelle) return type.libelle
  // « Pack LED veilleuses pour… » : l'emplacement le dit déjà sur la carte.
  if (/^Pack /.test(nom.trim())) return null
  return nom.split(' pour ')[0].trim() || null
}
