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
    eyebrow?: string
  }
}

/**
 * Mise en avant moto — `.moto-section` / `.moto-panel` du code de référence.
 *
 * Ce n'est pas un bandeau pleine largeur mais un **panneau arrondi posé dans
 * la grille** : 340 px de haut, rayon 11 px, à l'intérieur d'une section de
 * 48 px de marge haute et basse. Le texte occupe la gauche, le dégradé laisse
 * voir la moto à droite.
 *
 * La mention d'illustration reste sous le bouton, comme dans la référence :
 * le visuel est un rendu, pas une photo d'un montage réalisé.
 */
export function MotoSection({ content }: MotoSectionProps) {
  const lines = content.title.split(/\r?\n/).filter((line) => line.trim().length > 0)

  return (
    /* .home-section : 48 px de marge haute et basse (34 sous 800 px). */
    <section aria-labelledby="moto-heading" className="container-page py-[34px] lg:py-12">
      {/* .moto-panel : 340 px (370 en mobile), rayon 11 px, fond #19222a. */}
      <div className="relative h-[370px] overflow-hidden rounded-lg bg-[#19222a] text-white lg:h-[340px] lg:rounded-[11px]">
        <Image
          src={`/demo/${content.image}`}
          alt=""
          fill
          sizes="(min-width: 1024px) 1216px, 100vw"
          className="object-cover object-[64%_center] lg:object-[center_49%]"
        />

        {/* .moto-overlay : horizontal sur grand écran, croisé en dessous. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,#0c1a24e3,#0c1a2466_70%),linear-gradient(180deg,#0c1a2470,transparent_70%)] lg:bg-[linear-gradient(90deg,#0f1d26f0_2%,#0f1d26b0_37%,#0f1d2600_70%)]"
        />

        {/* .moto-copy : 35 px / 43 px de retrait (27 / 23 en mobile). */}
        <div className="relative z-[1] px-[23px] py-[27px] lg:px-[43px] lg:py-[35px]">
          <p className="mb-2.5 text-[7px] font-bold tracking-[1.2px] text-[#dba295] uppercase lg:text-[8px] lg:tracking-[1.6px]">
            {content.eyebrow ?? 'Et sur deux roues ?'}
          </p>

          <h2
            id="moto-heading"
            className="mb-[15px] text-[31px] leading-[1.1] font-bold tracking-[-1px] text-white lg:text-[35px] lg:tracking-[-1.4px]"
          >
            {lines.map((line, index) => (
              <span key={`${index}-${line}`} className="block">
                {line}
              </span>
            ))}
          </h2>

          <p className="mb-5 max-w-[220px] text-[10px] leading-[1.8] text-[#b8c2c7] lg:max-w-[340px] lg:text-[11px]">
            {content.subtitle}
          </p>

          {/* .moto-copy > .primary : 39 px de haut, 10 px. */}
          <ButtonLink
            href={content.ctaHref}
            className="inline-flex min-h-[39px] gap-[14px] rounded-[7px] px-[13px] py-2.5 text-[10px] lg:gap-5"
            iconRight={<IconArrowRight className="size-[15px] shrink-0" />}
          >
            {content.ctaLabel}
          </ButtonLink>

          <span className="mt-3 block text-[6px] text-[#83949e] lg:text-[7px]">
            {content.caption}
          </span>
        </div>
      </div>
    </section>
  )
}
