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
 * pour le zoom de la galerie) et réencodée en WebP, avec deux versions
 * réduites (480 et 960 px) déposées à côté. Le site les sert directement, sans
 * repasser par l'optimiseur : sur le demi-processeur du serveur, quinze
 * conversions à froid lancées ensemble faisaient attendre les images 3 à 4 s.
 * Les SVG, PDF et petits fichiers ne sont pas touchés.
 *
 * Convention de nom, lue par `components/ui/Image.tsx` :
 *   …-<empreinte>.v2.webp       la photo (1 600 px au plus)
 *   …-<empreinte>.v2-480.webp   version 480 px
 *   …-<empreinte>.v2-960.webp   version 960 px
 */
export const SEUIL_ALLEGEMENT = 400 * 1024
const COTE_MAX = 1600

export const LARGEURS_VARIANTES = [480, 960] as const

export type ImageAllegee = {
  bytes: Buffer
  mimeType: string
  extension: string
  width?: number
  height?: number
  /** Versions réduites, présentes seulement quand la photo a été allégée. */
  variantes?: Array<{ largeur: number; bytes: Buffer }>
}

export async function allegerImage(
  bytes: Buffer,
  mimeType: string,
  extension: string,
  {
    forcer = false,
    filigrane = false,
  }: {
    forcer?: boolean
    /** Pose le filigrane LEDVROOM (lib/storage/filigrane.ts) sur la photo et ses versions réduites. */
    filigrane?: boolean
  } = {},
): Promise<ImageAllegee> {
  const photo = mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp'
  if (!photo) return { bytes, mimeType, extension }
  if (filigrane) {
    const { filigraner } = await import('./filigrane')
    bytes = await filigraner(bytes)
    forcer = true
  }
  if (!forcer && bytes.length <= SEUIL_ALLEGEMENT) return { bytes, mimeType, extension }

  try {
    const { default: sharp } = await import('sharp')
    const { EXIF_LEDVROOM } = await import('./filigrane')
    const signer = <T extends import('sharp').Sharp>(s: T): T => (filigrane ? (s.withExif(EXIF_LEDVROOM) as T) : s)
    const { data, info } = await signer(
      sharp(bytes, { limitInputPixels: 60_000_000 })
        .rotate()
        .resize({ width: COTE_MAX, height: COTE_MAX, fit: 'inside', withoutEnlargement: true }),
    )
      .webp({ quality: 82, effort: 2 })
      .toBuffer({ resolveWithObject: true })
    // Un PNG à aplats peut ressortir plus lourd en WebP : on garde le plus léger.
    if (data.length >= bytes.length && !forcer) return { bytes, mimeType, extension }
    // (Avec le filigrane, `forcer` est vrai : on ne revient jamais à l'original sans lui.)
    const variantes = await Promise.all(
      LARGEURS_VARIANTES.map(async (largeur) => ({
        largeur,
        bytes: await signer(
          sharp(data).resize({ width: largeur, height: largeur, fit: 'inside', withoutEnlargement: true }),
        )
          .webp({ quality: 78, effort: 2 })
          .toBuffer(),
      })),
    )
    return {
      bytes: data,
      mimeType: 'image/webp',
      extension: 'v2.webp',
      width: info.width,
      height: info.height,
      variantes,
    }
  } catch (error) {
    // Un échec avec filigrane remonte : rendre la photo sans lui la publierait nue.
    if (filigrane) throw error
    console.error('[stockage] allègement impossible, fichier gardé tel quel', error)
    return { bytes, mimeType, extension }
  }
}
