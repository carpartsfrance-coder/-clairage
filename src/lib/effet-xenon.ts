/**
 * Packs « effet xénon » : des ampoules halogènes à lumière blanche, pas des LED.
 *
 * **D'où ça vient.** Les packs par véhicule reprennent le contenu du pack que
 * le revendeur partenaire vend pour le même véhicule et le même emplacement.
 * Pour les phares de voiture, ce pack est presque toujours son pack « effet
 * xénon » : des ampoules halogènes (1 625 des 1 903 packs phares du relevé,
 * plus 9 packs antibrouillards et 8 packs feux de jour). Ils ont pourtant été
 * créés sous le nom « Pack LED … », avec un comparatif « LED » : la fiche
 * promettait autre chose que ce que le client recevait.
 *
 * Ils s'appellent désormais « Pack ampoules effet xénon … » (migration
 * `20261107120000_packs_effet_xenon`), et la fiche ne leur prête plus de LED.
 * Le nom suffit à les reconnaître : c'est le même gabarit que celui des
 * rubriques (`admin/rubrique-des-packs.ts`).
 */

export const PREFIXE_EFFET_XENON = 'Pack ampoules effet xénon'

/** Le produit est-il un pack d'ampoules halogènes effet xénon ? */
export function estEffetXenon(nom: string): boolean {
  return nom.startsWith(PREFIXE_EFFET_XENON)
}

/**
 * La vignette du pack chez le partenaire dit ce qu'il contient :
 * « pack-ampoules-de-phares-xenon-effect-pour-… » est un pack halogène,
 * « pack-leds-antibrouillards-xenon-effect-pour-… » un pack de LED à la teinte
 * xénon. Sert à l'import, qui n'a que cette vignette pour le savoir.
 */
export function vignetteEffetXenon(image: string | null | undefined): boolean {
  const fichier = (image ?? '').toLowerCase().split('/').pop() ?? ''
  const nom = fichier.replace(/^\d+_/, '')
  return /xenon-effects?|effet-xenon/.test(nom) && nom.includes('ampoule') && !/(^|-)leds?(-|$)/.test(nom)
}
