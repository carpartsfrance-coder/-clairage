import Image from '@/components/ui/Image'
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
 * **Sans photo, rien n'est rendu — pas même un cadre.** Le cadre neutre était
 * auparavant rendu dans tous les cas, pour que la grille garde sa forme entre
 * la première peinture et le décodage de l'image. Cette raison ne vaut que
 * lorsqu'il y a une image à décoder : depuis le retrait des visuels du
 * fournisseur, plus aucune génération n'en porte, et chaque ligne affichait
 * donc un rectangle gris vide — une case qui a l'air cassée, là où il n'y a
 * tout simplement pas de photo.
 *
 * Le cadre reste rendu dès qu'une photo est attendue, et c'est lui qui tient
 * la place pendant le décodage. La stabilité de la grille est donc conservée
 * là où elle servait à quelque chose.
 */
export function GenerationThumb({
  photo,
  className,
}: {
  photo?: { url: string; alt: string } | null
  className?: string
}) {
  if (!photo) return null

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative hidden h-[46px] w-[68px] shrink-0 overflow-hidden rounded-[6px] border border-[#e1e1e1] bg-surface-paper fiche:block',
        className,
      )}
    >
      <Image src={photo.url} alt="" fill sizes="68px" className="bg-white object-contain" />
    </span>
  )
}
