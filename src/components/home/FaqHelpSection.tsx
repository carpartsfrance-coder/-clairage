import Link from 'next/link'
import type { HomeFaqItem } from '@/lib/queries/home'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconChevronDown, IconHeadset } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

export type FaqHelpSectionProps = {
  faq: HomeFaqItem[]
  help: {
    title: string
    text: string
    ctaLabel: string
    ctaHref: string
  }
}

const FAQ_TITLE_ID = 'accueil-faq-titre'
const HELP_TITLE_ID = 'accueil-aide-titre'

/**
 * FAQ (repliable, sans JavaScript) puis bande d'assistance.
 *
 * Les questions sont des <details> natifs : ouverture, fermeture et pilotage
 * au clavier sont assurés par le navigateur, donc rien à réimplémenter ni à
 * hydrater.
 */
export function FaqHelpSection({ faq, help }: FaqHelpSectionProps) {
  const hasFaq = faq.length > 0

  return (
    <section
      aria-labelledby={hasFaq ? FAQ_TITLE_ID : HELP_TITLE_ID}
      className="bg-white py-14"
    >
      <div className="container-page">
        {hasFaq ? (
          /* Une seule colonne étroite : une réponse se lit sur une ligne courte,
             et deux colonnes feraient sauter la mise en page à chaque ouverture. */
          <div className="max-w-3xl">
            <h2
              id={FAQ_TITLE_ID}
              className="text-[1.75rem] leading-[1.15] font-extrabold text-slate-ink sm:text-[2.125rem]"
            >
              Questions fréquentes
            </h2>

            <ul className="mt-6 border-t border-line">
              {faq.map((item, index) => (
                <li key={`${index}-${item.question}`} className="border-b border-line">
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-slate-ink [&::-webkit-details-marker]:hidden">
                      <span>{item.question}</span>
                      <IconChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="pb-4 text-sm leading-relaxed text-muted-strong">{item.answer}</p>
                  </details>
                </li>
              ))}
            </ul>

            <Link
              href="/faq"
              className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
            >
              Toutes les questions
            </Link>
          </div>
        ) : null}

        {/* Le filet de séparation n'a de sens qu'avec une FAQ au-dessus. */}
        <div
          className={cn(
            'flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8',
            hasFaq && 'mt-12 border-t border-line pt-10',
          )}
        >
          <div className="flex items-start gap-4">
            <IconHeadset className="size-9 shrink-0 text-slate-ink" />
            <div>
              <h2 id={HELP_TITLE_ID} className="text-[1.05rem] font-bold text-slate-ink">
                {help.title}
              </h2>
              <p className="mt-1 text-sm text-muted-strong">{help.text}</p>
            </div>
          </div>

          <ButtonLink
            href={help.ctaHref}
            variant="secondary"
            block
            className="shrink-0 md:w-auto"
            iconRight={<IconArrowRight className="size-4" />}
          >
            {help.ctaLabel}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
