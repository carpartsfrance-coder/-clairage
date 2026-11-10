import NextImage, { type ImageProps } from 'next/image'

/**
 * `next/image`, sans conversion pour les photos déjà prêtes pour le web.
 *
 * Les photos produit du dossier public (`/produits-ampoules`, `/photos-options`,
 * `/images-types`) sont déjà des WebP de 1 024 px, 30 à 160 ko. Les faire
 * repasser par l'optimiseur de Next ne les allégeait presque pas, mais
 * coûtait du processeur au serveur : sur une page de véhicule, quatorze
 * conversions lancées ensemble sur un demi-processeur faisaient attendre les
 * dernières images près de deux secondes, jusqu'à quatre chez l'exploitant
 * (10 novembre 2026). Servies telles quelles, elles partent tout de suite, et
 * le navigateur les garde sept jours (next.config.ts).
 *
 * Les autres images (photos déposées sur le stockage objet, visuels de la page
 * d'accueil, logos) passent toujours par l'optimiseur.
 */
const PRETES = ['/produits-ampoules/', '/photos-options/', '/images-types/']

export default function Image(props: ImageProps) {
  const pret = typeof props.src === 'string' && PRETES.some((dossier) => (props.src as string).startsWith(dossier))
  return <NextImage {...props} unoptimized={props.unoptimized ?? pret} />
}

export type { ImageProps }
