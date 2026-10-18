import Image from 'next/image'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/icons'

export type ComparisonSectionProps = {
  content: {
    eyebrow: string
    /** Les sauts de ligne sont significatifs : ils découpent le titre. */
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    /** Nom de fichier servi depuis /public/demo. */
    image: string
    /** Mention obligatoire : le visuel est une simulation, pas une photo d'essai. */
    caption: string
    leftLabel: string
    rightLabel: string
  }
}

const labelClass =
  'absolute top-1/2 -translate-y-1/2 rounded-xs bg-ink/80 px-2 py-1 ' +
  'text-xs font-semibold text-white uppercase whitespace-nowrap'

/**
 * Comparatif jaune / blanc LED.
 *
 * La séparation des deux rendus est déjà peinte dans le visuel : la ligne, la
 * poignée et les deux étiquettes ne sont qu'un repère posé par-dessus. Ce n'est
 * pas un curseur — rien n'est déplaçable, d'où l'absence d'état et de contrôle.
 */
export function ComparisonSection({ content }: ComparisonSectionProps) {
  const lines = content.title.split(/\r?\n/).filter((line) => line.trim().length > 0)

  return (
    <section
      aria-labelledby="comparison-heading"
      className="on-dark relative isolate overflow-hidden bg-ink"
    >
      <div className="relative z-10 container-page flex items-center py-10 md:min-h-[300px] md:py-14">
        <div className="max-w-[32rem]">
          <p className="eyebrow text-brand">{content.eyebrow}</p>

          <h2
            id="comparison-heading"
            className="mt-2 text-[1.75rem] leading-[1.1] font-extrabold text-white sm:text-[2.125rem]"
          >
            {lines.map((line, index) => (
              <span key={`${index}-${line}`} className="block">
                {line}
              </span>
            ))}
          </h2>

          <p className="mt-3 max-w-[26rem] text-sm text-white/75 sm:text-base">{content.subtitle}</p>

          <ButtonLink
            href={content.ctaHref}
            variant="onDark"
            className="mt-6"
            iconRight={<IconArrowRight className="size-5" />}
          >
            {content.ctaLabel}
          </ButtonLink>
        </div>
      </div>

      {/* Empilé sous le texte sur mobile, passé en fond dès que la largeur le permet. */}
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9] md:absolute md:inset-0 md:-z-10 md:aspect-auto">
        <Image
          src={`/demo/${content.image}`}
          /* Porteuse de sens : c'est le comparatif lui-même, pas un décor. */
          alt={`Comparaison du rendu d'éclairage : ${content.leftLabel} à gauche, ${content.rightLabel} à droite.`}
          fill
          sizes="100vw"
          className="object-cover object-center"
        />

        {/* Voile de lisibilité : léger sur mobile, dégradé depuis la gauche en fond. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-ink/25 md:bg-linear-to-r md:from-ink md:from-15% md:via-ink/80 md:via-55% md:to-ink/5"
        />

        {/*
          La ligne de séparation et sa poignée font partie du visuel lui-même :
          les redessiner ici les dédoublerait. Seules les deux étiquettes sont
          posées par-dessus, écartées du centre pour ne pas tomber sur la
          voiture. Les libellés figurent déjà dans l'alt de l'image.
        */}
        <span aria-hidden="true" className={`${labelClass} left-3 sm:left-[7%]`}>
          {content.leftLabel}
        </span>
        <span aria-hidden="true" className={`${labelClass} right-3 sm:right-[7%]`}>
          {content.rightLabel}
        </span>

        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-[0.6875rem] text-white/55">
          <span className="container-page block text-right">{content.caption}</span>
        </p>
      </div>
    </section>
  )
}
