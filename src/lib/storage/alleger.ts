/**
 * Allège une photo avant de la stocker.
 *
 * Les rendus des fiches arrivaient en JPEG de 2 048 px et 2,8 Mo. L'optimiseur
 * d'images de Next devait relire ces 2,8 Mo depuis le stockage objet et les
 * réduire à chaque première demande d'une taille — 1,8 s mesurées — et son
 * cache repart de zéro à chaque mise en ligne. D'où des images « qui mettent
 * du temps à s'afficher » (remarque de l'exploitant, 10 novembre 2026).
 *
 * Une photo plus lourde que le seuil est ramenée à 1 600 px au plus (assez
 * pour le zoom de la galerie) et réencodée en WebP : 150 à 300 ko, que
 * l'optimiseur traite dix fois plus vite. Les SVG, PDF et petits fichiers ne
 * sont pas touchés.
 */
export const SEUIL_ALLEGEMENT = 400 * 1024
const COTE_MAX = 1600

export type ImageAllegee = { bytes: Buffer; mimeType: string; extension: string; width?: number; height?: number }

export async function allegerImage(bytes: Buffer, mimeType: string, extension: string): Promise<ImageAllegee> {
  const photo = mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp'
  if (!photo || bytes.length <= SEUIL_ALLEGEMENT) return { bytes, mimeType, extension }

  try {
    const { default: sharp } = await import('sharp')
    const { data, info } = await sharp(bytes, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: COTE_MAX, height: COTE_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 2 })
      .toBuffer({ resolveWithObject: true })
    // Un PNG à aplats peut ressortir plus lourd en WebP : on garde le plus léger.
    if (data.length >= bytes.length) return { bytes, mimeType, extension }
    return { bytes: data, mimeType: 'image/webp', extension: 'webp', width: info.width, height: info.height }
  } catch (error) {
    console.error('[stockage] allègement impossible, fichier gardé tel quel', error)
    return { bytes, mimeType, extension }
  }
}
