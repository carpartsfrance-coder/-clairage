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
  'absolute top-1/2 -translate-y-1/2 rounded-xs bg-ink/75 px-2 py-1 ' +
  'text-[8px] font-bold tracking-[1px] text-white uppercase whitespace-nowrap'

/**
 * Comparatif jaune / blanc LED — `.home-transformation` de la référence.
 *
 * Deux colonnes : le texte à gauche (.8fr), le visuel dans un panneau arrondi
 * de 290 px à droite (1.2fr), 72 px d'écart, sur fond #1c2024 avec 39 px de
 * marge haute et basse. Le projet en faisait un bandeau pleine largeur avec le
 * visuel en fond — plus bas de 53 px et d'une composition différente.
 *
 * **Ce qui n'est pas repris** : la référence propose un curseur glissant entre
 * les deux rendus. Ici la séparation est déjà peinte dans le visuel, et les
 * deux étiquettes ne sont qu'un repère posé par-dessus. Un curseur donnerait à
 * croire à une mesure ; la mention sous le bloc dit que c'est une simulation
 * de teinte, pas un relevé de performance.
 */
export function ComparisonSection({ content }: ComparisonSectionProps) {
  const lines = content.title.split(/\r?\n/).filter((line) => line.trim().length > 0)

  return (
    <section
      aria-labelledby="comparison-heading"
      className="bg-[#1c2024] py-8 text-white lg:py-[39px]"
    >
      {/* .transformation-layout : .8fr / 1.2fr, écart 72 px, centré. */}
      <div className="container-page flex flex-col items-stretch gap-[23px] lg:grid lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-[72px]">
        <div>
          <p className="mb-2.5 text-[7px] font-bold tracking-[1.2px] text-[#d89b8f] uppercase lg:text-[8px] lg:tracking-[1.6px]">
            {content.eyebrow}
          </p>

          {/* h2 : 35 px, la seconde ligne en graisse normale et plus claire. */}
          <h2
            id="comparison-heading"
            className="mb-4 text-[30px] leading-[1.1] font-bold tracking-[-1px] text-white lg:text-[35px] lg:tracking-[-1.2px]"
          >
            {lines.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={index > 0 ? 'block font-normal text-[#e2e5e7]' : 'block'}
              >
                {line}
              </span>
            ))}
          </h2>

          <p className="mb-4 max-w-[310px] text-[11px] leading-[1.8] text-[#b0b9bc] lg:mb-[18px]">
            {content.subtitle}
          </p>

          {/* .transformation-layout .secondary : contour clair sur fond sombre. */}
          <ButtonLink
            href={content.ctaHref}
            variant="onDark"
            className="min-h-[39px] gap-4 rounded-md border-[#667176] px-[17px] text-[10px] text-[#f0f2f1] lg:min-h-[38px]"
            iconRight={<IconArrowRight className="size-4" />}
          >
            {content.ctaLabel}
          </ButtonLink>

          {/* .transformation-layout small : la mention de simulation. */}
          <small className="mt-[13px] block text-[7px] leading-[1.7] text-[#7b8a92] lg:mt-3.5">
            {content.caption}
          </small>
        </div>

        {/* .comparison-image : panneau arrondi de 290 px (235 en mobile). */}
        <div className="relative h-[235px] overflow-hidden rounded-[10px] bg-[#25282b] lg:h-[290px]">
          <Image
            src={`/demo/${content.image}`}
            /* Porteuse de sens : c'est le comparatif lui-même, pas un décor. */
            alt={`Comparaison du rendu d'éclairage : ${content.leftLabel} à gauche, ${content.rightLabel} à droite.`}
            fill
            sizes="(min-width: 1024px) 730px, 100vw"
            className="object-cover object-center"
          />

          <span aria-hidden="true" className={`${labelClass} left-3`}>
            {content.leftLabel}
          </span>
          <span aria-hidden="true" className={`${labelClass} right-3`}>
            {content.rightLabel}
          </span>
        </div>
      </div>
    </section>
  )
}
