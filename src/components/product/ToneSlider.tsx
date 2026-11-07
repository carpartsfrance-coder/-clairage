'use client'

import { useId, useState } from 'react'
import Image from 'next/image'

/**
 * Curseur de teinte seul — le visuel de `ToneComparison`, sans sa section.
 *
 * Refonte LEDVROOM : la fiche le pose à côté de la description, dans « Le
 * pack en bref ».
 *
 * **Seule la lumière change.** Les deux moitiés sont la MÊME photographie.
 * À gauche, un filtre SVG repère les zones les plus claires de l'image — au
 * moins 92 % de luminance, c'est-à-dire les feux allumés — et les teinte en
 * jaune halogène ; la carrosserie, le décor et les reflets restent tels
 * quels. Le seuil a été réglé sur les rendus du catalogue : à 80 %, les
 * reflets d'un capot gris clair jaunissaient aussi. Rien n'est à préparer
 * image par image.
 *
 * C'est une simulation de teinte — ni un avant/après, ni une mesure — et la
 * légende le dit.
 */
export function ToneSlider({
  image,
  imageAlt,
  warmLabel = 'Halogène',
  coolLabel = 'LED',
}: {
  image: string
  imageAlt: string
  warmLabel?: string
  coolLabel?: string
}) {
  const [position, setPosition] = useState(50)
  const sliderId = useId()
  // Un identifiant utilisable dans `url(#…)` : sans les caractères spéciaux de useId.
  const filtreId = `halogene-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <figure className="m-0">
      {/*
        Le filtre « halogène » : luminance → masque des zones très claires
        (≥ 92 %), adouci, puis version jaunie de la photo posée seulement à
        travers ce masque, par-dessus l'originale.
      */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter
          id={filtreId}
          colorInterpolationFilters="sRGB"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2126 0.7152 0.0722 0 0"
            result="luminance"
          />
          <feComponentTransfer in="luminance" result="masque">
            <feFuncA type="linear" slope="12.5" intercept="-11.5" />
          </feComponentTransfer>
          <feGaussianBlur in="masque" stdDeviation="3" result="masqueDoux" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0.8 0 0 0  0 0 0.45 0 0  0 0 0 1 0"
            result="chaud"
          />
          <feComposite in="chaud" in2="masqueDoux" operator="in" result="lumiereChaude" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="lumiereChaude" />
          </feMerge>
        </filter>
      </svg>

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#25282b]">
        {/* À gauche : la même photo, feux passés en halogène. */}
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="(min-width: 801px) 45vw, 100vw"
          className="object-cover object-center"
          style={{ filter: `url(#${filtreId})` }}
        />

        {/* À droite : la photo telle quelle, en LED, découpée au curseur. */}
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
        Faites glisser pour comparer. Seule la couleur de la lumière change : simulation à titre
        illustratif, pas une mesure de performance.
      </figcaption>
    </figure>
  )
}
