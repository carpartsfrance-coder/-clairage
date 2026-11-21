import type { Atout } from '@/lib/caracteristiques'
import { IconCheck } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Les atouts d'un produit en badges, sous le titre de la fiche.
 *
 * Demande de l'exploitant (21 novembre 2026) : « plug & play, aucune erreur
 * OBD, la notice… on devrait en faire des badges, les mettre en avant ». Ce
 * sont les questions que se posent les visiteurs qui hésitent — la question
 * « message d'erreur au tableau de bord » était la plus ouverte par ceux qui
 * avaient ajouté au panier sans commander. Les réponses doivent donc se voir
 * avant la photo, pas trois écrans plus bas.
 *
 * Quatre au plus : au-delà, la ligne déborde sur trois rangées de téléphone
 * et plus rien ne ressort. La liste complète est dans « Les atouts », plus
 * bas sur la fiche. L'ordre est celui de lib/caracteristiques.ts.
 */
export function BadgesAtouts({
  atouts,
  max = 4,
  className,
}: {
  atouts: Atout[]
  max?: number
  className?: string
}) {
  const visibles = atouts.slice(0, max)
  if (visibles.length === 0) return null
  return (
    <ul aria-label="Les atouts du produit" className={cn('flex flex-wrap gap-1.5 fiche:gap-2', className)}>
      {visibles.map((atout) => (
        <li
          key={atout.code}
          className="inline-flex items-center gap-1.5 rounded-full border border-ok-border bg-ok-soft px-2.5 py-1 text-[12px] leading-none font-semibold text-[#1f5a39] fiche:px-3 fiche:py-1.5 fiche:text-[13px]"
        >
          <IconCheck className="size-[13px] shrink-0 text-ok fiche:size-[15px]" />
          {atout.badge}
        </li>
      ))}
    </ul>
  )
}
