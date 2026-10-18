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
 * Bandeau clair de trois arguments, posé sous le sélecteur de véhicule.
 * Colonnes séparées par un filet vertical sur grand écran, empilées et
 * séparées par un filet horizontal sur mobile.
 */
export function ReassuranceBand({ items }: ReassuranceBandProps) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="border-y border-line bg-surface-soft">
      <div className="container-page py-7">
        <h2 id={headingId} className="sr-only">
          Points de repère
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-3">
          {items.map((item, index) => {
            const Icon = resolveIcon(item.icon)
            return (
              <li
                key={`${item.icon}-${index}`}
                className={cn(
                  'flex items-start gap-3.5 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0',
                  'md:border-t-0 md:py-0 md:pr-6 md:pl-6 md:first:pl-0 md:last:pr-0',
                  index > 0 && 'md:border-l md:border-line',
                )}
              >
                {Icon ? <Icon className="mt-0.5 size-9 shrink-0 text-slate-ink" /> : null}
                <div className="min-w-0">
                  <p className="text-[0.95rem] leading-snug font-bold text-slate-ink">
                    {item.title}
                    {item.footnote ? <span aria-hidden="true"> *</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-strong">{item.text}</p>
                  {item.footnote ? <p className="mt-1 text-xs text-muted">{item.footnote}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
