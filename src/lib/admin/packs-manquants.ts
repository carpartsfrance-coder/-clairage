import { createHash } from 'node:crypto'

/**
 * Fabrication des packs que le relevé d'origine a sautés.
 *
 * Le relevé qui a créé les 9 866 packs a laissé des trous : Mercedes-Benz en
 * entier — 62 générations en base, pas un seul pack — et, ailleurs, des
 * positions oubliées sur des véhicules pourtant servis. Le suivi photo, qui
 * vient d'un parcours du même revendeur fait autrement, les voit tous.
 *
 * Ce module ne décide rien de commercial : il **recopie** les décisions déjà
 * prises. Les intitulés, les slugs et les SKU suivent la recette des packs
 * existants ; les prix viennent de la table des 190 correspondances déjà
 * tranchées, et les rares prix sans précédent sont déclarés en toutes lettres
 * plutôt que calculés par une formule qu'on croirait avoir retrouvée.
 */

export type Position =
  | 'PLATE'
  | 'REVERSE'
  | 'SIDELIGHT'
  | 'INTERIOR_DOME'
  | 'TURN_FRONT'
  | 'LOW_BEAM'
  | 'HIGH_BEAM'
  | 'FOG'

/**
 * Pour chaque position : l'intitulé client, et le morceau de SKU.
 *
 * Relevés sur les packs existants, pas inventés — le slug se déduit de
 * l'intitulé, et le morceau de SKU tient en quatre lettres qui ne sont pas
 * toujours le début du nom (`LOW_BEAM` donne `HEAD`).
 */
export const POSITIONS: Record<Position, { label: string; sku: string }> = {
  PLATE: { label: 'éclairage de plaque', sku: 'PLAT' },
  REVERSE: { label: 'feux de recul', sku: 'REVE' },
  SIDELIGHT: { label: 'veilleuses', sku: 'SIDE' },
  INTERIOR_DOME: { label: 'habitacle', sku: 'INTE' },
  TURN_FRONT: { label: 'clignotants', sku: 'TURN' },
  LOW_BEAM: { label: 'phares', sku: 'HEAD' },
  HIGH_BEAM: { label: 'feux de route', sku: 'HIGH' },
  FOG: { label: 'antibrouillards', sku: 'FOG' },
}

/** Minuscules, sans accent ni signe : la forme des slugs du catalogue. */
export function enSlug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function slugDuPack(position: Position, marque: string, generation: string): string {
  return `pack-led-${enSlug(POSITIONS[position].label)}-${marque}-${generation}`
}

/**
 * Le SKU d'un pack.
 *
 * Le suffixe des packs existants n'est reproductible par aucune recette simple
 * — ni empreinte du slug, ni du nom, ni de la page source. On en prend donc une
 * nouvelle, explicite : les quatre premiers caractères de l'empreinte du slug.
 * Elle ne retrouvera pas les anciens suffixes, et c'est sans conséquence : ces
 * packs-là n'existent pas encore, et le suffixe ne sert qu'à distinguer.
 */
export function skuDuPack(position: Position, marque: string, generation: string): string {
  const base = `LUM-PK-${POSITIONS[position].sku}-${marque}-${generation}`.toUpperCase()
  const empreinte = createHash('sha256')
    .update(slugDuPack(position, marque, generation))
    .digest('hex')
    .slice(0, 4)
    .toUpperCase()
  return `${base}-${empreinte}`
}

export function nomDuPack(position: Position, vehicule: string): string {
  return `Pack LED ${POSITIONS[position].label} pour ${vehicule}`
}

/**
 * Prix sans précédent, décidés avec Killian le 4 novembre 2026.
 *
 * Chacun est aligné sur son voisin immédiat dans la table existante :
 * 108,90 € donnait 103,90 €, donc 109,80 € donne 104,90 € ; 16,90 € donnait
 * 15,90 €, donc 16,80 € aussi ; et ainsi de suite. L'écart appliqué aux packs
 * existants varie de 4 à 17 % sans règle qu'on puisse retrouver : les
 * extrapoler par une moyenne poserait des prix que personne n'a choisis.
 */
export const PRIX_SANS_PRECEDENT: Record<number, number> = {
  10980: 10490,
  4890: 4690,
  1680: 1590,
  480: 390,
}

/**
 * Le prix catalogue d'un prix relevé chez le revendeur.
 *
 * `null` quand il n'a ni précédent ni décision : mieux vaut écarter le pack que
 * lui poser un prix inventé. Un prix faux ne se voit pas — il se facture.
 */
export function prixCatalogue(
  sourceCents: number,
  precedents: Map<number, number>,
): number | null {
  return precedents.get(sourceCents) ?? PRIX_SANS_PRECEDENT[sourceCents] ?? null
}

/**
 * La génération que désigne un slug de pack, ou `null` s'il ne la désigne pas.
 *
 * Sert à déceler les slugs qui mentent. Le générateur d'origine raccourcissait
 * certaines générations — « 206-plus » devenait « 206 », « ka-plus » devenait
 * « ka » — ce qui restait sans conséquence tant que la vraie 206 n'avait pas de
 * pack à cette position. Dès qu'elle en a un, deux voitures se disputent la
 * même adresse, et c'est la mauvaise qui répond.
 */
export function generationDuSlug(
  slug: string,
  position: Position,
  marque: string,
): string | null {
  const prefixe = `pack-led-${enSlug(POSITIONS[position].label)}-${marque}-`
  return slug.startsWith(prefixe) ? slug.slice(prefixe.length) : null
}

export type PackSitue = { slug: string; position: Position; make: string; generation: string }

/**
 * Les packs dont le slug désigne une autre voiture que la leur.
 *
 * `generationsEnBase` donne, par marque, les générations qui existent : un slug
 * raccourci n'est ambigu que si la génération qu'il nomme existe vraiment. Sans
 * ce filtre, on renommerait des centaines de packs dont le slug est seulement
 * plus court que leur génération, sans rien désigner d'autre.
 */
export function slugsAmbigus(
  packs: PackSitue[],
  generationsEnBase: Map<string, Set<string>>,
): Array<{ pack: PackSitue; slugCorrige: string; revendiquePar: string }> {
  const trouves: Array<{ pack: PackSitue; slugCorrige: string; revendiquePar: string }> = []
  for (const pack of packs) {
    const designee = generationDuSlug(pack.slug, pack.position, pack.make)
    if (designee === null || designee === pack.generation) continue
    if (!generationsEnBase.get(pack.make)?.has(designee)) continue
    trouves.push({
      pack,
      slugCorrige: slugDuPack(pack.position, pack.make, pack.generation),
      revendiquePar: designee,
    })
  }
  return trouves
}
