import type { ComponentType, SVGProps } from 'react'
import { cn } from '@/lib/cn'
import { IconGear, IconHeadset, IconShield, IconWrench } from '@/components/ui/icons'

export type MethodIconKey = 'gear' | 'wrench' | 'headset' | 'shield'

export type MethodStep = {
  /**
   * Clé d'icône. Le contenu peut venir de `HomeBlock.payload` (JSON non typé),
   * d'où le `string` : une clé inconnue n'affiche simplement pas d'icône.
   */
  icon: string
  title: string
  text: string
}

export type MethodSectionProps = {
  content: {
    title: string
    steps: MethodStep[]
  }
}

const icons: Record<MethodIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  gear: IconGear,
  wrench: IconWrench,
  headset: IconHeadset,
  shield: IconShield,
}

/**
 * Bande « méthode » : choix, montage, accompagnement.
 * Liste ordonnée — les numéros visibles ne font que doubler l'ordre de la
 * liste, ils sont donc retirés de l'arbre d'accessibilité.
 */
export function MethodSection({ content }: MethodSectionProps) {
  if (content.steps.length === 0) return null

  return (
    <section aria-labelledby="method-title" className="border-y border-line bg-surface-soft">
      <div className="container-page py-12">
        <h2 id="method-title" className="text-[1.75rem] leading-tight font-extrabold text-slate-ink">
          {content.title}
        </h2>

        <ol className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0">
          {content.steps.map((step, index) => {
            const Icon: ComponentType<SVGProps<SVGSVGElement>> | undefined =
              icons[step.icon as MethodIconKey]
            return (
              <li
                key={step.title}
                className={cn(
                  'flex items-start gap-4 md:pr-7',
                  index > 0 && 'md:border-l md:border-line md:pl-7',
                )}
              >
                <span
                  aria-hidden="true"
                  className="text-[2.5rem] leading-none font-extrabold tabular-nums text-line-strong"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                {Icon ? <Icon className="mt-1 size-7 shrink-0 text-slate-ink" /> : null}
                <div className="min-w-0">
                  <h3 className="text-[0.95rem] font-bold text-slate-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-snug text-muted-strong">{step.text}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
