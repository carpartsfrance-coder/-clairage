/**
 * Nature d'un média — vocabulaire partagé.
 *
 * Ce module est volontairement neutre : ni `'use client'`, ni `server-only`.
 * La liste est lue à la fois par l'écran serveur (filtres, libellés du tableau)
 * et par les formulaires client. Exportée depuis un module client, elle
 * arriverait côté serveur sous forme de référence client et non de tableau —
 * `NATURE_OPTIONS.map is not a function` au premier rendu.
 *
 * La distinction porte un enjeu de fond, pas d'affichage : une illustration ou
 * un rendu simulé ne doit jamais être présenté comme une photo du produit, ni
 * comme le résultat d'un essai qui n'a pas eu lieu.
 */

export type MediaNatureValue =
  | 'PRODUCT_PHOTO'
  | 'ILLUSTRATION'
  | 'TEST_PHOTO'
  | 'DIAGRAM'
  | 'UNSPECIFIED'

export const NATURE_OPTIONS: Array<{ value: MediaNatureValue; label: string }> = [
  { value: 'PRODUCT_PHOTO', label: 'Photo du produit réel' },
  { value: 'ILLUSTRATION', label: 'Illustration ou rendu simulé' },
  { value: 'TEST_PHOTO', label: 'Photo d’un essai réellement effectué' },
  { value: 'DIAGRAM', label: 'Schéma' },
  { value: 'UNSPECIFIED', label: 'Non précisé' },
]

/** Libellés courts, pour les tableaux et les pastilles. */
export const NATURE_LABELS: Record<string, string> = {
  PRODUCT_PHOTO: 'Photo du produit',
  ILLUSTRATION: 'Illustration',
  TEST_PHOTO: 'Photo d’essai',
  DIAGRAM: 'Schéma',
  UNSPECIFIED: 'Non précisé',
}

/** Rappel affiché sous le choix, selon ce qui est sélectionné. */
export const NATURE_NOTES: Record<string, string> = {
  PRODUCT_PHOTO:
    'À réserver à une photographie de la pièce réellement vendue. Une image de banque ou un rendu n’en est pas une.',
  ILLUSTRATION:
    'Le visuel sera signalé comme illustration sur la fiche : il ne peut pas servir à montrer un résultat.',
  TEST_PHOTO:
    'À réserver à une photo prise lors d’un essai réellement conduit. Sans essai, choisissez « illustration ».',
  DIAGRAM: 'Schéma de montage ou de brochage.',
  UNSPECIFIED:
    'Rien ne sera affirmé sur l’origine de ce visuel ; il ne sera pas présenté comme une photo du produit.',
}
