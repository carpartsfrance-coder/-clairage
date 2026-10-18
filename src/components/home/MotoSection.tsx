import Image from 'next/image'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/icons'

export type MotoSectionProps = {
  content: {
    /** Les sauts de ligne sont significatifs : ils découpent le titre. */
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    /** Nom de fichier servi depuis /public/demo. */
    image: string
    /** Mention obligatoire : le visuel est une illustration, pas une photo d'essai. */
    caption: string
  }
}

/**
 * Bandeau sombre de mise en avant moto : visuel de nuit en fond, titre sur
 * deux lignes, sous-titre et appel à l'action côte à côte sur grand écran.
 */
export function MotoSection({ content }: MotoSectionProps) {
  const lines = content.title.split(/\r?\n/).filter((line) => line.trim().length > 0)

  return (
    <section
      aria-labelledby="moto-heading"
      className="on-dark relative isolate overflow-hidden bg-ink"
    >
      <Image
        src={`/demo/${content.image}`}
        alt=""
        fill
        sizes="100vw"
        className="-z-10 object-cover object-center"
      />
      {/* Voile de lisibilité : vertical quand le contenu est empilé, horizontal dès md. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-t from-ink via-ink/85 to-ink/40 md:bg-linear-to-r md:from-ink md:via-ink/85 md:to-transparent"
      />

      <div className="container-page flex min-h-[300px] items-center py-10 pb-12 md:min-h-[230px] md:py-12">
        <div className="max-w-[34rem]">
          <h2
            id="moto-heading"
            className="max-w-[30rem] text-[1.75rem] leading-[1.1] font-extrabold text-white sm:text-[2.125rem]"
          >
            {lines.map((line, index) => (
              <span key={`${index}-${line}`} className="block">
                {line}
              </span>
            ))}
          </h2>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <p className="max-w-[22rem] text-sm text-white/75">{content.subtitle}</p>
            <ButtonLink
              href={content.ctaHref}
              variant="primary"
              className="w-full shrink-0 md:w-auto"
              iconRight={<IconArrowRight className="size-5" />}
            >
              {content.ctaLabel}
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* Visuel d'ambiance : la mention évite de le lire comme une photo produit. */}
      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-[0.6875rem] text-white/55">
        <span className="container-page block text-right">{content.caption}</span>
      </p>
    </section>
  )
}
