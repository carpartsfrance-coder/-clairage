import type { GalleryItem } from '@/lib/queries/product'

/**
 * Le comparatif avant / après d'une fiche — `01-avant-apres.jpg`.
 *
 * Ce visuel vertical empile deux photos au cadrage identique : l'ampoule
 * d'origine en haut, la LED en bas, séparées par un filet (voir le montage
 * dans la chaîne d'images LEDVROOM). `pose-rendus` le pose avec la légende
 * « Avant et après » et un texte alternatif qui commence par « Comparatif
 * avant et après » (`VUES`, dans `admin/photos-suivi.ts`) ; on le reconnaît à
 * l'un ou à l'autre, puisque la légende peut être retouchée dans
 * l'administration.
 */
export function estComparatifAvantApres(
  item: Pick<GalleryItem, 'role' | 'caption' | 'alt'>,
): boolean {
  return (
    item.role === 'RESULT' &&
    (item.caption === 'Avant et après' || item.alt.startsWith('Comparatif avant et après'))
  )
}
