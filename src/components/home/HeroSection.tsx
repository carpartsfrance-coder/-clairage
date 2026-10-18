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
          /*
            Cadrage : le sujet (la voiture et ses phares) est dans la moitié
            droite. Sur mobile, où il ne reste qu'une bande étroite, on vise
            plus à droite encore pour garder l'avant du véhicule.
            `brightness`/`contrast` relèvent légèrement un visuel sombre, sans
            délaver les zones éclairées.
          */
          className="object-cover object-[72%_center] brightness-110 contrast-105 sm:object-[68%_center] lg:object-[60%_center]"
        />
        {/*
          Le voile n'est pas décoratif : il garantit le contraste du texte.
          Choix mobile : on garde la superposition plutôt qu'un empilement, pour
          ne charger qu'une seule image (le LCP de la page) ; le voile y passe
          simplement en aplat quasi plein, ce qui conserve du blanc sur ink/85.
        */}
        <div className="absolute inset-0 bg-ink/80 lg:hidden" />
        <div className="absolute inset-0 hidden bg-linear-to-r from-ink from-12% via-ink/75 via-48% to-ink/5 lg:block" />
        {/*
          Second voile, en bas seulement : à droite le dégradé horizontal ne
          laisse plus que 10 % d'opacité, et la mention « Illustration de
          rendu. » y tomberait en blanc sur une photo nue. Celui-ci lui garantit
          un fond sombre sans assombrir le reste du visuel.
        */}
        <div className="absolute inset-x-0 bottom-0 hidden h-24 bg-linear-to-t from-ink/75 to-transparent lg:block" />
      </div>

      {/*
        Hauteur calée sur la fenêtre, et non fixe.

        Ce bandeau n'est pas seul à l'écran : le sélecteur de véhicule le suit
        immédiatement, et c'est lui l'action attendue à l'arrivée. On retire
        donc de la hauteur disponible ce que prennent le header et l’entrée du
        sélecteur (~21 rem), avec un plancher pour ne pas écraser le titre et
        un plafond pour ne pas étirer le visuel sur les grands écrans.
      */}
      <div className="container-page relative flex min-h-[21rem] flex-col justify-center py-10 sm:min-h-[24rem] lg:min-h-[clamp(22rem,calc(100svh-23rem),30rem)] lg:py-9">
        <div className="max-w-[34rem]">
          <p className="eyebrow text-brand">{eyebrow}</p>

          <h1
            id="hero-titre"
            className="mt-2 text-[2rem] leading-[1.05] font-extrabold text-white sm:text-[2.5rem] lg:text-[3.25rem]"
          >
            {title}
          </h1>

          <p className="mt-3 max-w-[31rem] text-[0.95rem] leading-relaxed text-white/85 sm:text-base lg:text-lg">
            {subtitle}
          </p>

          <ButtonLink
            href={ctaHref}
            size="lg"
            className="mt-6"
            iconRight={<IconArrowRight className="size-5 shrink-0" />}
          >
            {ctaLabel}
          </ButtonLink>

          {bullets.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-8">
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

      </div>

      {/*
        La légende sort du flux : dans le flux, elle ajoutait sa hauteur ET sa
        marge à un bandeau dont chaque pixel repousse le sélecteur de véhicule.
        Elle reste lisible grâce au voile bas.
      */}
      <p className="absolute right-4 bottom-2 z-10 text-[0.6875rem] text-white/60 lg:right-8 lg:bottom-3">
        {imageCaption}
      </p>
    </section>
  )
}
