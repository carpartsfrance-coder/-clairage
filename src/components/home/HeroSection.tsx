import Image from 'next/image'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconCheck } from '@/components/ui/icons'

export type HeroSectionProps = {
  content: {
    eyebrow: string
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    bullets: string[]
    image: string
    imageCaption: string
  }
}

/**
 * Bandeau d'ouverture : le visuel couvre le fond, le texte occupe la partie
 * sombre à gauche. C'est ici que vit le seul <h1> de la page d'accueil.
 */
export function HeroSection({ content }: HeroSectionProps) {
  const { eyebrow, title, subtitle, ctaLabel, ctaHref, bullets, image, imageCaption } = content

  return (
    <section aria-labelledby="hero-titre" className="on-dark relative overflow-hidden bg-ink">
      <div className="absolute inset-0">
        <Image
          src={`/demo/${image}`}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_center] lg:object-center"
        />
        {/*
          Le voile n'est pas décoratif : il garantit le contraste du texte.
          Choix mobile : on garde la superposition plutôt qu'un empilement, pour
          ne charger qu'une seule image (le LCP de la page) ; le voile y passe
          simplement en aplat quasi plein, ce qui conserve du blanc sur ink/85.
        */}
        <div className="absolute inset-0 bg-ink/85 lg:hidden" />
        <div className="absolute inset-0 hidden bg-linear-to-r from-ink from-15% via-ink/80 via-50% to-ink/10 lg:block" />
        {/*
          Second voile, en bas seulement : à droite le dégradé horizontal ne
          laisse plus que 10 % d'opacité, et la mention « Illustration de
          rendu. » y tomberait en blanc sur une photo nue. Celui-ci lui garantit
          un fond sombre sans assombrir le reste du visuel.
        */}
        <div className="absolute inset-x-0 bottom-0 hidden h-24 bg-linear-to-t from-ink/75 to-transparent lg:block" />
      </div>

      <div className="container-page relative flex min-h-[25rem] flex-col justify-center py-14 sm:min-h-[28rem] lg:min-h-[470px] lg:py-16">
        <div className="max-w-[34rem]">
          <p className="eyebrow text-brand">{eyebrow}</p>

          <h1
            id="hero-titre"
            className="mt-3 text-[2.25rem] leading-[1.04] font-extrabold text-white sm:text-[2.75rem] lg:text-[3.75rem]"
          >
            {title}
          </h1>

          <p className="mt-4 max-w-[31rem] text-base leading-relaxed text-white/80 sm:text-lg">
            {subtitle}
          </p>

          <ButtonLink
            href={ctaHref}
            size="lg"
            className="mt-8"
            iconRight={<IconArrowRight className="size-5 shrink-0" />}
          >
            {ctaLabel}
          </ButtonLink>

          {bullets.length > 0 ? (
            <ul className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2.5 text-sm font-medium text-white sm:text-base">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-white">
                    <IconCheck className="size-3.5" strokeWidth={2.4} />
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="mt-10 self-end text-[0.6875rem] text-white/60">{imageCaption}</p>
      </div>
    </section>
  )
}
