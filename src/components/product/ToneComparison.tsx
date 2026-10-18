'use client'

import { useId, useState } from 'react'
import Image from 'next/image'

/**
 * Comparaison de teinte — `#rendu` / `.comparison-section` de la référence.
 *
 * Valeurs reprises de `styles.css` : fond #181b1e, 53 px de marge haute et
 * basse (35 en mobile), deux colonnes .8fr / 1.2fr avec 65 px d'écart, visuel
 * de 315 px (250 en mobile) et rayon 10 px, étiquettes à 18 px du haut, trait
 * blanc et pastille de 35 px.
 *
 * **Ce que le curseur fait, et ce qu'il ne fait pas.** Les deux moitiés sont
 * la *même* photographie : celle de droite telle quelle, celle de gauche
 * passée au filtre chaud de la référence. Ce n'est donc ni un avant/après ni
 * une mesure — c'est une simulation de teinte, et la mention sous le texte le
 * dit. Rien ici ne doit être lu comme un relevé de performance.
 *
 * Le curseur est un `<input type="range">` posé sur le visuel : il se pilote
 * à la souris, au doigt et aux flèches du clavier sans code supplémentaire, et
 * la valeur reste lisible par les technologies d'assistance.
 */
export function ToneComparison({
  eyebrow = 'Le détail qui change tout',
  title,
  subtitle,
  image,
  imageAlt,
  warmLabel = 'Jaune',
  coolLabel = 'Blanc LED',
}: {
  eyebrow?: string
  /** Les sauts de ligne sont significatifs : ils découpent le titre. */
  title: string
  subtitle: string | null
  image: string
  imageAlt: string
  warmLabel?: string
  coolLabel?: string
}) {
  const [position, setPosition] = useState(50)
  const sliderId = useId()
  const lines = title.split(/\r?\n/).filter((line) => line.trim().length > 0)

  return (
    <section
      id="rendu"
      aria-labelledby="titre-rendu"
      className="on-dark scroll-mt-32 bg-[#181b1e] py-[35px] text-white fiche:py-[53px]"
    >
      {/* .comparison-layout : texte à gauche (.8fr), visuel à droite (1.2fr). */}
      <div className="container-page flex flex-col gap-[26px] fiche:grid fiche:grid-cols-[0.8fr_1.2fr] fiche:items-center fiche:gap-[35px] min-[1101px]:gap-[65px]">
        <div>
          <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-[#e18d82] uppercase fiche:mb-3 fiche:text-[9px] fiche:tracking-[1.6px]">
            {eyebrow}
          </p>

          {/* h2 : 38 px, la seconde ligne en graisse normale et plus claire. */}
          <h2
            id="titre-rendu"
            className="mb-3.5 text-[32px] leading-[1.13] font-bold tracking-[-1.5px] fiche:mb-[19px] fiche:text-[38px]"
          >
            {lines.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={index > 0 ? 'block font-normal text-[#e8e8e5]' : 'block'}
              >
                {line}
              </span>
            ))}
          </h2>

          {subtitle ? (
            <p className="max-w-[320px] text-[12px] leading-[1.7] text-[#bfc2c3] fiche:max-w-[290px]">
              {subtitle}
            </p>
          ) : null}

          {/* .comparison-key : la légende des deux teintes. */}
          <p className="mt-[17px] flex items-center gap-[17px] text-[10px] fiche:mt-[23px]">
            <span className="flex items-center gap-[7px]">
              <i className="inline-block size-[7px] rounded-full bg-[#f1c270] shadow-[0_0_8px_#f1c27080]" />
              {warmLabel}
            </span>
            <span aria-hidden="true" className="text-[#888]">
              →
            </span>
            <span className="flex items-center gap-[7px]">
              <i className="inline-block size-[7px] rounded-full bg-[#effaff] shadow-[0_0_8px_#fff9]" />
              {coolLabel}
            </span>
          </p>

          {/* .illustration-note : ce que le visuel est, et ce qu'il n'est pas. */}
          <p className="mt-3.5 text-[8px] leading-[1.6] text-[#7c8387] fiche:mt-[21px]">
            Simulation de teinte à titre illustratif. Ne représente pas une mesure de performance.
          </p>
        </div>

        {/* .comparison-image : la même photo, deux traitements, un volet. */}
        <div className="relative h-[250px] overflow-hidden rounded-[10px] bg-[#25282b] fiche:h-[315px]">
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes="(min-width: 801px) 60vw, 100vw"
            className="object-cover object-center [filter:sepia(0.7)_saturate(1.35)_hue-rotate(351deg)]"
          />

          {/* .cool-reveal : la photo non filtrée, découpée au curseur. */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 0 0 ${position}%)` }}
            aria-hidden="true"
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 801px) 60vw, 100vw"
              className="object-cover object-center"
            />
          </div>

          <span
            aria-hidden="true"
            className="absolute top-[18px] left-4 rounded-sm bg-black/40 px-[9px] py-[5px] text-[8px] font-bold tracking-[1px] text-[#eee] uppercase"
          >
            {warmLabel}
          </span>
          <span
            aria-hidden="true"
            className="absolute top-[18px] right-4 rounded-sm bg-black/40 px-[9px] py-[5px] text-[8px] font-bold tracking-[1px] text-[#eee] uppercase"
          >
            {coolLabel}
          </span>

          {/* .slider-line : le trait et sa pastille, posés sans capter le pointeur. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-white"
            style={{ left: `${position}%` }}
          >
            <span className="absolute top-1/2 -left-[17px] -mt-[17px] grid size-[35px] place-items-center rounded-full bg-white text-[19px] tracking-[2px] text-[#333]">
              ‹›
            </span>
          </div>

          <label htmlFor={sliderId} className="sr-only">
            Comparer la simulation {warmLabel.toLowerCase()} et {coolLabel.toLowerCase()}
          </label>
          <input
            id={sliderId}
            type="range"
            min={5}
            max={95}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            className="absolute inset-0 m-0 size-full cursor-ew-resize opacity-0"
          />

          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[13px] left-1/2 -translate-x-1/2 text-[8px] tracking-[0.3px] whitespace-nowrap text-[#eee]"
          >
            Faites glisser pour comparer
          </span>
        </div>
      </div>
    </section>
  )
}
