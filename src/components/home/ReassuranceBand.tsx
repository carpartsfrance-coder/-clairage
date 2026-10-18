import { cn } from '@/lib/cn'
import {
  IconGear,
  IconHeadset,
  IconReturn,
  IconShield,
  IconTruck,
  IconWrench,
} from '@/components/ui/icons'

export type ReassuranceIconKey = 'gear' | 'wrench' | 'shield' | 'headset' | 'truck' | 'return'

export type ReassuranceItem = {
  /**
   * Une des clés de `ReassuranceIconKey`. Le type reste ouvert aux chaînes
   * libres parce que ces blocs peuvent venir de la base (`HomeBlock.payload`,
   * du JSON non typé) ; une clé inconnue n'affiche simplement pas d'icône.
   */
  icon: ReassuranceIconKey | (string & Record<never, never>)
  title: string
  text: string
  /** Mention appelée par l'astérisque posé après le titre. */
  footnote?: string
}

export type ReassuranceBandProps = {
  items: ReassuranceItem[]
}

const icons: Record<ReassuranceIconKey, typeof IconGear> = {
  gear: IconGear,
  wrench: IconWrench,
  shield: IconShield,
  headset: IconHeadset,
  truck: IconTruck,
  return: IconReturn,
}

function resolveIcon(key: string) {
  return (icons as Partial<Record<string, typeof IconGear>>)[key]
}

/** Le titre n'est pas dessiné dans les maquettes : il reste lu, pas vu. */
const headingId = 'reassurance-band-title'

/**
 * Bandeau de repères — `.home-reassurance` du code de référence.
 *
 * Une seule ligne de trois mentions courtes : icône de 20 px (17 en mobile),
 * texte de 10 px couleur #666d62, 19 px de marge haute et basse (17 en
 * mobile), fond #f7f8f4 et filet bas
 * #e8eae1. Le projet affichait un titre ET une phrase par colonne, dans une
 * grille à filets verticaux : deux fois la hauteur de la référence pour la
 * même information.
 *
 * La mention appelée par l'astérisque est conservée. C'est elle qui empêche
 * « Branchement sans modifier le câblage » d'être lu comme une garantie
 * universelle, et la référence la porte aussi.
 */
export function ReassuranceBand({ items }: ReassuranceBandProps) {
  if (items.length === 0) return null

  return (
    <section
      aria-labelledby={headingId}
      className="border-b border-[#e8eae1] bg-[#f7f8f4]"
    >
      <div className="container-page py-[17px] lg:py-[19px]">
        <h2 id={headingId} className="sr-only">
          Points de repère
        </h2>

        <ul className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-5">
          {items.map((item, index) => {
            const Icon = resolveIcon(item.icon)
            return (
              <li
                key={`${item.icon}-${index}`}
                className="flex items-center gap-2.5 text-[9px] text-[#666d62] lg:text-[10px]"
              >
                {Icon ? (
                  <Icon className="size-[17px] shrink-0 text-[#373e32] lg:size-5" strokeWidth={1.35} />
                ) : null}
                <span className="font-medium">
                  {item.title}
                  {item.footnote ? <span aria-hidden="true">*</span> : null}
                </span>
              </li>
            )
          })}
        </ul>

        {/*
          La mention appelée par l'astérisque n'est pas ici : la référence la
          résout en pied de page (`.footer-asterisk`), ce qui garde ce bandeau
          sur une seule ligne. Elle reste donc lisible, au même endroit que
          dans la source.
        */}
      </div>
    </section>
  )
}
