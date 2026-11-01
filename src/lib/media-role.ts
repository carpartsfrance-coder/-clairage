/**
 * Rôle d'un visuel sur une fiche produit — vocabulaire partagé.
 *
 * Module volontairement neutre : ni `'use client'`, ni `server-only`. La liste
 * est lue par l'écran serveur (libellés de la grille) et par le formulaire
 * client qui ajoute un visuel. Exportée depuis un module client, elle
 * arriverait côté serveur sous forme de référence et non de tableau — la même
 * raison que pour `./media-nature`.
 *
 * **Le rôle n'est pas une étiquette de rangement : il décide de la place du
 * visuel sur la boutique.** La galerie publique regroupe par rôle, dans cet
 * ordre, et c'est la position qui classe à l'intérieur d'un groupe
 * (`src/lib/queries/product.ts`). Le listing du catalogue, lui, ne prend que le
 * premier visuel de rôle « Produit » : c'est la vignette du produit partout
 * ailleurs sur le site.
 *
 * La galerie applique aussi un fondu multiplié aux rôles « Produit » et
 * « Contenu du kit », qui détoure un packshot sur fond clair. Une photo en
 * situation rangée sous ce rôle y deviendrait illisible — d'où les notes.
 */

export type MediaRoleValue = 'PRODUCT' | 'RESULT' | 'KIT_CONTENT' | 'INSTALL'

/** Ordre d'affichage dans la galerie publique. */
export const ROLE_ORDER: MediaRoleValue[] = ['PRODUCT', 'RESULT', 'KIT_CONTENT', 'INSTALL']

export const ROLE_OPTIONS: Array<{ value: MediaRoleValue; label: string }> = [
  { value: 'PRODUCT', label: 'Le produit' },
  { value: 'RESULT', label: 'Le rendu' },
  { value: 'KIT_CONTENT', label: 'Le kit complet' },
  { value: 'INSTALL', label: 'Le montage' },
]

/** Libellés courts, pour les pastilles et les tableaux. */
export const ROLE_LABELS: Record<string, string> = {
  PRODUCT: 'Produit',
  RESULT: 'Rendu',
  KIT_CONTENT: 'Contenu du kit',
  INSTALL: 'Montage',
}

/** Ce que le rôle entraîne, affiché sous le choix. */
export const ROLE_NOTES: Record<string, string> = {
  PRODUCT:
    'Packshot de la pièce, sur fond clair. Le premier de ce rôle sert de vignette au produit dans tout le catalogue.',
  RESULT:
    'Faisceau ou éclairage obtenu. À réserver à un rendu réellement constaté : la galerie le présente comme le résultat.',
  KIT_CONTENT: 'Ce que contient la boîte, étalé. Affiché sur fond clair comme un packshot.',
  INSTALL: 'Étape de montage ou brochage. Affiché tel quel, sans détourage.',
}

export function isMediaRole(value: string): value is MediaRoleValue {
  return (ROLE_OPTIONS as Array<{ value: string }>).some((option) => option.value === value)
}
