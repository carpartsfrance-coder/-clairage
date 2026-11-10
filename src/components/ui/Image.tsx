import NextImage, { type ImageProps } from 'next/image'

/**
 * `next/image`, sans conversion pour les photos déjà prêtes pour le web.
 *
 * Les conversions à la volée de l'optimiseur de Next se font sur le
 * demi-processeur du serveur : sur une page de véhicule, quinze conversions à
 * froid lancées ensemble faisaient attendre les dernières images 3 à 4 s chez
 * l'exploitant (10 novembre 2026). Deux familles de photos n'en ont pas
 * besoin et partent donc directement :
 *
 * - les photos produit du dossier public (`/produits-ampoules`,
 *   `/photos-options`, `/images-types`) : déjà des WebP de 1 024 px, 30 à
 *   160 ko, gardés sept jours par le navigateur (next.config.ts) ;
 * - les photos du stockage objet allégées (`…v2.webp`, lib/storage/alleger.ts)
 *   : elles ont leurs versions 480 et 960 px à côté, que le navigateur choisit
 *   lui-même selon l'écran (`srcset`), servies par le stockage avec un cache
 *   d'un an.
 *
 * Les autres images (photos pas encore allégées, visuels de la page
 * d'accueil, logos) passent toujours par l'optimiseur.
 */
const PRETES = ['/produits-ampoules/', '/photos-options/', '/images-types/']
const ALLEGEE = /^https:\/\/.+\.v2\.webp$/

export default function Image(props: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : null

  if (src && ALLEGEE.test(src) && !props.unoptimized) {
    const base = src.slice(0, -'.webp'.length)
    const {
      fill,
      sizes,
      alt,
      className,
      style,
      width,
      height,
      priority,
      preload,
      loading,
      fetchPriority,
      // Propres à next/image, sans équivalent sur <img>.
      quality: _quality,
      placeholder: _placeholder,
      blurDataURL: _blur,
      overrideSrc: _override,
      loader: _loader,
      unoptimized: _unoptimized,
      onLoadingComplete: _onLoadingComplete,
      src: _src,
      ...reste
    } = props
    const prioritaire = Boolean(priority || preload)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...reste}
        src={src}
        srcSet={`${base}-480.webp 480w, ${base}-960.webp 960w, ${src} 1600w`}
        sizes={sizes ?? (fill ? '100vw' : undefined)}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        loading={prioritaire ? 'eager' : (loading ?? 'lazy')}
        fetchPriority={prioritaire ? 'high' : fetchPriority}
        decoding="async"
        className={className}
        style={
          fill
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
            : style
        }
      />
    )
  }

  const pret = src !== null && PRETES.some((dossier) => src.startsWith(dossier))
  return <NextImage {...props} unoptimized={props.unoptimized ?? pret} />
}

export type { ImageProps }
