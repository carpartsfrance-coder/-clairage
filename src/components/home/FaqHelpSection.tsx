import Link from 'next/link'
import type { HomeFaqItem } from '@/lib/queries/home'
import { ButtonLink } from '@/components/ui/Button'
import { IconHeadset } from '@/components/ui/icons'
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
 * FAQ puis bande d'assistance — `.home-faq` et `.assistance-banner` de la
 * référence.
 *
 * Valeurs reprises de `home.css` et `styles.css` : deux colonnes .8fr / 1.2fr
 * avec 75 px d'écart, questions espacées de 16 px au-dessus et en dessous,
 * intitulé à 11 px, réponse à 10 px, et le « + » de 17 px qui bascule à
 * l'ouverture. Puis le panneau d'assistance arrondi sur fond #f4f5f0, pastille
 * blanche de 52 px et bouton secondaire poussé à droite.
 *
 * Les questions restent des <details> natifs : ouverture, fermeture et
 * pilotage au clavier sont assurés par le navigateur, donc rien à
 * réimplémenter ni à hydrater.
 *
 * **Écart assumé** : le lien « Toutes les questions » n'existe pas dans la
 * référence, dont la FAQ est un cul-de-sac. L'application a une page dédiée —
 * /aide, qui porte les questions publiées en entier — et le lien est placé
 * sous le titre, dans la colonne de gauche, qui est plus courte que la liste :
 * il ne coûte donc aucune hauteur.
 */
export function FaqHelpSection({ faq, help }: FaqHelpSectionProps) {
  const hasFaq = faq.length > 0

  return (
    <section
      aria-labelledby={hasFaq ? FAQ_TITLE_ID : HELP_TITLE_ID}
      /* .home-faq : pas de marge haute propre, 48 px en bas (33 en mobile). */
      className="bg-white pb-[33px] lg:pb-12"
    >
      <div className="container-page">
        {/* .home-faq : titre à gauche (.8fr), questions à droite (1.2fr),
            75 px d'écart. Empilé sous 800 px. */}
        {hasFaq ? (
          <div className="block gap-[75px] lg:grid lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="mb-2.5 text-[7px] font-bold tracking-[1.2px] text-brand uppercase lg:text-[8px] lg:tracking-[1.6px]">
                Avant de passer au blanc
              </p>
              <h2
                id={FAQ_TITLE_ID}
                className="text-[26px] leading-[1.1] font-bold tracking-[-0.8px] text-slate-ink lg:text-[29px] lg:tracking-[-1px]"
              >
                Questions fréquentes
              </h2>

              <Link
                href="/aide#questions"
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-[10px] font-bold text-slate-ink hover:underline lg:mt-3.5 lg:min-h-0"
              >
                Toutes les questions
                <span aria-hidden="true" className="text-[16px] leading-none">
                  ↗
                </span>
              </Link>
            </div>

            {/* .faq-list : 16 px autour de chaque intitulé, filet dessous. */}
            <ul className="mt-[23px] lg:mt-0">
              {faq.map((item, index) => (
                /* Le retrait est porté par le <li> : `first:` vise le premier
                   enfant de la liste, et chaque <details> est seul dans le sien. */
                <li
                  key={`${index}-${item.question}`}
                  className="border-b border-line py-4 first:pt-0"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 text-[11px] font-semibold text-slate-ink [&::-webkit-details-marker]:hidden">
                      <span>{item.question}</span>
                      {/* Le « + » de la référence, qui bascule en croix. */}
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-[17px] leading-[26px] font-normal text-[#8c8e85] transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 max-w-[580px] text-[10px] leading-[1.8] text-[#7b8074]">
                      {item.answer}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* .assistance-banner : panneau arrondi #f4f5f0, 29 px de marge haute
            et basse, pastille blanche de 52 px, bouton secondaire à droite. */}
        <section
          aria-labelledby={HELP_TITLE_ID}
          className={cn(
            'rounded-lg bg-[#f4f5f0] px-[23px] py-[23px] md:flex md:items-center md:gap-[22px] lg:rounded-[10px] lg:px-8 lg:py-[29px]',
            hasFaq && 'mt-[33px] lg:mt-12',
          )}
        >
          <span className="mb-4 grid size-10 shrink-0 place-items-center rounded-full bg-white md:mb-0 lg:size-[52px]">
            <IconHeadset className="size-[21px] text-slate-ink lg:size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="mb-[7px] text-[7px] font-bold tracking-[1.2px] text-brand uppercase">
              Le bon conseil, au bon moment
            </p>
            <h2
              id={HELP_TITLE_ID}
              className="text-[22px] leading-[1.25] font-bold tracking-[-0.5px] text-slate-ink lg:text-[21px] lg:leading-normal"
            >
              {help.title}
            </h2>
            <p className="mt-1.5 text-[10px] text-[#83867a]">{help.text}</p>
          </div>

          <ButtonLink
            href={help.ctaHref}
            variant="secondary"
            className="mt-[18px] w-full shrink-0 gap-4 rounded-md px-[17px] text-[11px] whitespace-nowrap md:mt-0 md:ml-auto md:w-auto"
          >
            {help.ctaLabel}
          </ButtonLink>
        </section>
      </div>
    </section>
  )
}
