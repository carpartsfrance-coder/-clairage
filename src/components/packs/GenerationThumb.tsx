import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Vignette d'une génération de véhicule.
 *
 * **Le visuel est purement d'aide à la reconnaissance.** Le nom du modèle et
 * les millésimes identifient le véhicule ; la photo aide seulement l'œil à
 * retrouver sa voiture dans une liste. C'est pourquoi elle est facultative et
 * le reste, et pourquoi elle est `aria-hidden` : la relire à voix haute
 * n'apprendrait rien de plus que la ligne qu'elle accompagne.
 *
 * Sans visuel, la place est tenue par un cadre neutre plutôt que laissée vide.
 * Comme pour `BrandMark`, ce cadre est TOUJOURS rendu et l'image se pose par
 * dessus : entre la première peinture et le décodage, et pour un média
 * supprimé, la grille garde sa forme au lieu de montrer un trou.
 */
export function GenerationThumb({
  photo,
  className,
}: {
  photo?: { url: string; alt: string } | null
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative hidden h-[46px] w-[68px] shrink-0 overflow-hidden rounded-[6px] border border-[#e1e1e1] bg-surface-paper fiche:block',
        className,
      )}
    >
      {photo ? (
        <Image src={photo.url} alt="" fill sizes="68px" className="bg-white object-contain" />
      ) : null}
    </span>
  )
}
