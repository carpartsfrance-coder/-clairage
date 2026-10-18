import type { ComponentType, SVGProps } from 'react'
import Link from 'next/link'
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
  /** Lien de l'étape. Les deux champs vont ensemble, sinon rien ne s'affiche. */
  linkLabel?: string
  linkHref?: string
}

export type MethodSectionProps = {
  content: {
    title: string
    /** Sur-titre de la référence, facultatif. */
    eyebrow?: string
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
 * Bande « méthode » — `.home-install` + `.home-benefits` de la référence.
 *
 * Fond #f5f6f1 entre deux filets #e9ece1, 39 px de marge haute et basse, un
 * sur-titre et un titre à 29 px, puis trois colonnes séparées par un filet
 * vertical. Chaque colonne porte une icône encadrée de 38 px, son numéro en
 * haut à droite, un intitulé à 15 px et un texte à 10 px.
 *
 * Les numéros ne font que doubler l'ordre de la liste : ils restent hors de
 * l'arbre d'accessibilité.
 */
export function MethodSection({ content }: MethodSectionProps) {
  if (content.steps.length === 0) return null

  return (
    <section
      aria-labelledby="method-title"
      className="border-y border-[#e9ece1] bg-[#f5f6f1]"
    >
      <div className="container-page py-[33px] lg:py-[39px]">
        {/* .home-section-heading : titre à gauche, raccourci à droite. */}
        <div className="mb-5 block items-end justify-between gap-5 lg:mb-6 lg:flex">
          <div>
            {content.eyebrow ? (
              <p className="mb-2.5 text-[7px] font-bold tracking-[1.2px] text-brand uppercase lg:text-[8px] lg:tracking-[1.6px]">
                {content.eyebrow}
              </p>
            ) : null}
            <h2
              id="method-title"
              className="max-w-[340px] text-[25px] leading-[1.15] font-bold tracking-[-0.8px] text-slate-ink lg:max-w-none lg:text-[29px] lg:tracking-[-1px]"
            >
              {content.title}
            </h2>
          </div>
        </div>

        {/* .home-benefits : trois colonnes, écart 42 px, filet entre elles. */}
        <ol className="grid grid-cols-1 gap-[25px] md:grid-cols-3 lg:gap-[42px]">
          {content.steps.map((step, index) => {
            const Icon: ComponentType<SVGProps<SVGSVGElement>> | undefined =
              icons[step.icon as MethodIconKey]
            return (
              <li
                key={step.title}
                className={cn(
                  'relative pr-[25px]',
                  index < content.steps.length - 1 && 'md:border-r md:border-[#dfe4d5]',
                )}
              >
                {/* .benefit-icon : carré de 38 px, filet #d9dfd0, fond blanc. */}
                {Icon ? (
                  <span className="flex size-[38px] items-center justify-center rounded-lg border border-[#d9dfd0] bg-white">
                    <Icon className="size-[21px] text-slate-ink" />
                  </span>
                ) : null}

                {/* .benefit-number : en haut à droite, 10 px. */}
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-[27px] text-[10px] tracking-[1px] text-[#a5b09a]"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>

                <h3 className="mt-[18px] mb-[11px] text-[15px] font-bold tracking-[-0.3px] text-slate-ink">
                  {step.title}
                </h3>
                <p className="m-0 mb-3 max-w-[280px] text-[10px] leading-[1.8] text-[#7d8870] md:min-h-[54px]">
                  {step.text}
                </p>

                {/*
                  .home-benefits a : 9 px souligné. La référence ouvre ici des
                  fenêtres de démonstration ; on pointe vers les pages réelles.
                  La hauteur de 44 px ne vaut qu'en mobile, pour rester
                  cliquable au doigt ; au-delà, c'est la ligne de la référence.
                */}
                {step.linkLabel && step.linkHref ? (
                  <Link
                    href={step.linkHref}
                    className="inline-flex min-h-11 items-center text-[9px] text-[#4d5c40] underline underline-offset-[3px] hover:text-slate-ink lg:min-h-0"
                  >
                    {step.linkLabel} <span aria-hidden="true" className="ml-1">↗</span>
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
