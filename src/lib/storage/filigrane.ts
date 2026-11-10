import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Filigrane LEDVROOM : le logo blanc répété en diagonale sur toute l'image,
 * à 13 % (choix de l'exploitant, 10 novembre 2026).
 *
 * Dans un coin, un filigrane part avec un recadrage ou un détourage de la
 * voiture sur fond blanc ; répété sur toute l'image, il recouvre aussi le feu
 * et la carrosserie. Il n'empêche pas une copie, il la rend peu utile.
 *
 * Posé sur les rendus (avant / après, véhicule, gros plan), jamais sur les
 * photos d'ampoules : la boîte LEDVROOM y figure déjà, et Google Shopping
 * refuse les images filigranées.
 *
 * Le motif (`public/marque/filigrane-motif.png`) est dessiné pour une image de
 * 1 376 px de large, au double de sa taille pour rester net : il est remis à
 * l'échelle de chaque image, puis répété.
 */
const LARGEUR_DE_REFERENCE = 1376
const ECHELLE_DU_MOTIF = 2

let motif: Promise<Buffer> | null = null
function lireMotif(): Promise<Buffer> {
  motif ??= readFile(path.join(process.cwd(), 'public', 'marque', 'filigrane-motif.png'))
  return motif
}

/** En ASCII : l'EXIF ne garde pas les caractères accentués ni « © ». */
export const COPYRIGHT = 'Copyright LEDVROOM - ledvroom.com'
export const EXIF_LEDVROOM = { IFD0: { Copyright: COPYRIGHT, Artist: 'LEDVROOM' } }

export async function filigraner(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const image = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate()
  // Après `rotate()`, une photo prise de côté échange largeur et hauteur :
  // on lit donc la taille sur l'image redressée.
  const base = await image.toBuffer({ resolveWithObject: true })
  const W = base.info.width
  const echelle = W / LARGEUR_DE_REFERENCE / ECHELLE_DU_MOTIF
  const brut = await lireMotif()
  const meta = await sharp(brut).metadata()
  const tuile = await sharp(brut)
    .resize(Math.max(8, Math.round((meta.width ?? 621) * echelle)))
    .png()
    .toBuffer()
  return sharp(base.data)
    .composite([{ input: tuile, tile: true, blend: 'over' }])
    .withExif(EXIF_LEDVROOM)
    .webp({ quality: 90, effort: 2 })
    .toBuffer()
}
