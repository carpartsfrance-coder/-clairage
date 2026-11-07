'use client'

import { useId, useState } from 'react'
import Image from 'next/image'

/**
 * Curseur de teinte seul — le visuel de `ToneComparison`, sans sa section.
 *
 * Refonte LEDVROOM : la fiche le pose à côté de la description, dans « Le
 * pack en bref ». Même principe que `ToneComparison` : les deux moitiés sont
 * la MÊME photographie, celle de gauche passée au filtre chaud. C'est une
 * simulation de teinte — ni un avant/après, ni une mesure — et la légende le
 * dit.
 *
 * Le curseur est un `<input type="range">` posé sur le visuel : souris, doigt
 * et flèches du clavier, sans code supplémentaire.
 */
export function ToneSlider({
  image,
  imageAlt,
  warmLabel = 'Jaune',
  coolLabel = 'Blanc LED',
}: {
  image: string
  imageAlt: string
  warmLabel?: string
  coolLabel?: string
}) {
  const [position, setPosition] = useState(50)
  const sliderId = useId()

  return (
    <figure className="m-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#25282b]">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="(min-width: 801px) 45vw, 100vw"
          className="object-cover object-center [filter:sepia(0.7)_saturate(1.35)_hue-rotate(351deg)]"
        />

        {/* La photo non filtrée, découpée au curseur. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
          aria-hidden="true"
        >
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 801px) 45vw, 100vw"
            className="object-cover object-center"
          />
        </div>

        <span
          aria-hidden="true"
          className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white"
        >
          {warmLabel}
        </span>
        <span
          aria-hidden="true"
          className="absolute top-4 right-4 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-ink"
        >
          {coolLabel}
        </span>

        {/* Le trait et sa pastille, posés sans capter le pointeur. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[18px] font-bold text-ink">
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
      </div>
      <figcaption className="mt-3 text-[13px] leading-[1.5] text-[#a9adb4]">
        Faites glisser pour comparer. Simulation de teinte à titre illustratif, pas une mesure
        de performance.
      </figcaption>
    </figure>
  )
}
