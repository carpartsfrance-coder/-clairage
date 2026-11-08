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
  /** Le début du nom de la fiche. */
  prefixe: RegExp
  /** Fichier de `public/images-types/`, sans extension. */
  image: string
  /** Ce qu'on reçoit, en une phrase : description Google et flux. */
  contenu: string
  /** Réponse à « Faut-il modifier le câblage ? ». */
  cablage: string
}

export const TYPES_DE_PRODUIT: TypeDeProduit[] = [
  {
    cle: 'feux-additionnels',
    prefixe: /^Feux LED antibrouillard et longue portée /,
    image: 'produit-feux-additionnels',
    contenu:
      'Deux feux LED antibrouillard et longue portée, livrés avec faisceau (relais et fusible), interrupteur de guidon et fixations.',
    cablage:
      'Oui, ils se branchent : le faisceau fourni (relais, fusible et interrupteur de guidon) se raccorde à l’alimentation de la moto. Les phares d’origine restent en place.',
  },
  {
    cle: 'phares-additionnels',
    prefixe: /^Phares additionnels LED /,
    image: 'produit-phares-additionnels',
    contenu:
      'Deux phares LED ronds additionnels, livrés avec faisceau (relais et fusible), interrupteur et fixations.',
    cablage:
      'Oui, ils se branchent : le faisceau fourni (relais, fusible et interrupteur) se raccorde à l’alimentation du véhicule. Les phares d’origine restent en place.',
  },
  {
    cle: 'optiques-led',
    prefixe: /^Optiques LED pour phares additionnels /,
    image: 'produit-optiques-led',
    contenu: 'Des optiques LED à la place de celles des phares additionnels d’origine.',
    cablage:
      'Non : les optiques LED prennent la place de celles des phares additionnels d’origine et se branchent sur leur prise.',
  },
  {
    cle: 'boitier-phare-rond',
    prefixe: /^Boîtier de phare rond /,
    image: 'produit-phare-rond',
    contenu:
      'Le boîtier de phare rond noir satiné qui reçoit une optique LED de 7 pouces (optique non fournie).',
    cablage:
      'Le boîtier se fixe à la place du phare d’origine ; l’optique LED de 7 pouces, vendue à part, se branche sur la prise du phare.',
  },
  {
    cle: 'centrale-clignotants',
    prefixe: /^Centrale de clignotants LED /,
    image: 'produit-centrale-clignotants',
    contenu:
      'La centrale électronique qui remet les clignotants LED à la bonne cadence, sans résistance à ajouter.',
    cablage:
      'Non : la centrale se branche à la place de la centrale (le relais) de clignotants d’origine.',
  },
  {
    cle: 'clignotants-sequentiels',
    prefixe: /^Clignotants séquentiels LED /,
    image: 'produit-clignotants-sequentiels',
    contenu:
      'Une paire de clignotants LED à défilement, avec les modules qui évitent le clignotement rapide.',
    cablage:
      'Ils se montent à la place des clignotants d’origine et se branchent sur leurs fils. Les modules fournis évitent le clignotement trop rapide.',
  },
  {
    cle: 'clignotants-retroviseurs',
    prefixe: /^Clignotants dynamiques LED de rétroviseurs /,
    image: 'produit-clignotants-retroviseurs',
    contenu:
      'Une paire de clignotants LED à défilement pour les rétroviseurs, à la place de ceux d’origine.',
    cablage:
      'Non : ils se clipsent à la place des clignotants des rétroviseurs et se branchent sur la prise d’origine.',
  },
  {
    cle: 'repetiteurs',
    prefixe: /^Répétiteurs latéraux dynamiques LED /,
    image: 'produit-repetiteurs',
    contenu:
      'Une paire de répétiteurs latéraux LED à défilement, à la place de ceux des ailes avant.',
    cablage:
      'Non : ils se clipsent à la place des répétiteurs d’origine et se branchent sur la prise d’origine.',
  },
]

/** Le type d'une fiche qui n'est pas un pack d'ampoules, ou null. */
export function typeDeProduit(nom: string): TypeDeProduit | null {
  return TYPES_DE_PRODUIT.find((type) => type.prefixe.test(nom.trim())) ?? null
}

/**
 * « le Toyota Hilux », mais « l’Audi A3 », « l’Opel Corsa E » : l'article
 * devant un nom de véhicule.
 */
export function leVehicule(nom: string): string {
  return /^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/.test(nom.trim()) ? `l’${nom}` : `le ${nom}`
}
