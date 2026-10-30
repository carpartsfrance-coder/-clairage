import { cn } from '@/lib/cn'
import {
  IconCar,
  IconGear,
  IconHeadset,
  IconReturn,
  IconShield,
  IconTruck,
  IconWrench,
} from '@/components/ui/icons'

export type ReassuranceIconKey =
  | 'car'
  | 'gear'
  | 'wrench'
  | 'shield'
  | 'headset'
  | 'truck'
  | 'return'

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
  car: IconCar,
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
 * texte de 10 px couleur #686868, 19 px de marge haute et basse (17 en
 * mobile), fond #f6f6f6 et filet bas
 * #e5e5e5. Le projet affichait un titre ET une phrase par colonne, dans une
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
    <section aria-labelledby={headingId} className="bg-surface-soft pb-6 lg:pb-8">
      <div className="container-page">
        <h2 id={headingId} className="sr-only">
          Points de repère
        </h2>

        {/*
          Une carte blanche posée sur le gris, et non plus un filet de texte.

          Les trois repères y sont séparés par un filet vertical plutôt que par
          du vide : à parts égales sur une même ligne, rien ne disait où
          finissait l'un et où commençait l'autre. Empilés, le filet passe à
          l'horizontale — une règle verticale entre deux blocs superposés ne
          sépare rien.
        */}
        <ul className="grid list-none grid-cols-1 overflow-hidden rounded-md border border-line bg-white p-0 sm:grid-cols-3">
          {items.map((item, index) => {
            const Icon = resolveIcon(item.icon)
            return (
              <li
                key={`${item.icon}-${index}`}
                className={cn(
                  'flex items-center gap-4 px-6 py-6 sm:px-7',
                  index > 0 && 'border-t border-line sm:border-t-0 sm:border-l',
                )}
              >
                {Icon ? (
                  <Icon
                    className="size-9 shrink-0 text-brand"
                    strokeWidth={1.35}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="m-0 text-[16px] leading-[1.25] font-bold tracking-[-0.3px] text-ink lg:text-[18px]">
                    {item.title}
                    {item.footnote ? <span aria-hidden="true">*</span> : null}
                  </p>
                  {/*
                    Le sous-titre s'affiche enfin. Il était écrit dans les
                    données depuis le début et le composant ne le rendait
                    nulle part.
                  */}
                  {item.text ? (
                    <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-strong lg:text-[14px]">
                      {item.text}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>

        {/*
          La mention appelée par l'astérisque n'est pas ici : elle est résolue
          en pied de page, ce qui garde cette carte sur une seule ligne. Elle
          reste donc lisible, au même endroit qu'avant.
        */}
      </div>
    </section>
  )
}
