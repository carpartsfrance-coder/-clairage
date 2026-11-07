'use client'

import { useId, useState } from 'react'
import Image from 'next/image'

/**
 * Curseur avant / après — « Le pack en bref » de la fiche produit.
 *
 * **Il ne simule rien.** Il découpe le comparatif fabriqué pour chaque
 * produit (`01-avant-apres.jpg`) : deux photos au cadrage identique,
 * l'ampoule d'origine en haut, la LED en bas. Le panneau du haut s'affiche à
 * gauche, celui du bas à droite, et le curseur fait glisser la frontière.
 * L'éclairage d'origine montré est donc exactement celui du comparatif.
 *
 * Une première version teintait les feux d'une seule photo avec un filtre
 * SVG : le résultat ne ressemblait jamais à une vraie ampoule halogène.
 *
 * Géométrie du montage : 1080 × 1350, deux panneaux de 673 px séparés par un
 * filet de 4 px (en 2K : 1856 × 2304, 1149 et 6 px — moins d'un pixel d'écart
 * une fois ramené à l'échelle).
 *
 * **Les cartouches.** Chaque panneau porte déjà son cartouche rouge en bas à
 * gauche. « AVANT » reste visible à gauche ; celui du bas, « APRÈS », serait
 * caché sous le panneau de gauche — on en pose un identique en bas à droite,
 * aux mêmes proportions que le montage (unités `cqw`, relatives à la largeur
 * du cadre). Le curseur s'arrête avant d'atteindre l'un ou l'autre : sans
 * cette borne, les deux cartouches se chevauchaient en « AVANTS ».
 */
const PART_D_UN_PANNEAU = 673 / 1350
const DEBUT_DU_PANNEAU_BAS = 677 / 1350

/** Hauteur du montage entier, en pourcentage de la hauteur d'un panneau. */
const HAUTEUR_DU_MONTAGE = `${(100 / PART_D_UN_PANNEAU).toFixed(3)}%`
/** Décalage qui amène le panneau du bas en haut du cadre. */
const DECALAGE_DU_PANNEAU_BAS = `${(-(DEBUT_DU_PANNEAU_BAS / PART_D_UN_PANNEAU) * 100).toFixed(3)}%`

export function ToneSlider({
  image,
  imageAlt,
  avantLabel = 'Ampoule d’origine',
  apresLabel = 'LED',
}: {
  /** Le comparatif vertical : avant en haut, après en bas. */
  image: string
  imageAlt: string
  avantLabel?: string
  apresLabel?: string
}) {
  const [position, setPosition] = useState(50)
  const sliderId = useId()

  return (
    <figure className="m-0">
      <div
        className="relative aspect-[1080/673] overflow-hidden rounded-2xl bg-[#18191b]"
        style={{ containerType: 'inline-size' }}
      >
        {/* À gauche : le panneau du haut, l'ampoule d'origine. */}
        <div className="absolute inset-x-0 top-0" style={{ height: HAUTEUR_DU_MONTAGE }}>
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes="(min-width: 801px) 45vw, 100vw"
            className="object-cover object-top"
          />
        </div>

        {/* À droite : le panneau du bas, la LED, découpé au curseur. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-x-0"
            style={{ top: DECALAGE_DU_PANNEAU_BAS, height: HAUTEUR_DU_MONTAGE }}
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 801px) 45vw, 100vw"
              className="object-cover object-top"
            />
          </div>

          {/* Le cartouche « APRÈS », comme celui du montage, mais à droite. */}
          <span
            className="absolute bg-brand leading-none font-bold text-white"
            style={{
              right: '2.5cqw',
              bottom: '2.8cqw',
              padding: '0.85cqw 1.95cqw 0.75cqw',
              borderRadius: '1.1cqw',
              fontSize: '3.33cqw',
            }}
          >
            APRÈS
          </span>
        </div>

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
          Comparer {avantLabel.toLowerCase()} et {apresLabel}
        </label>
        <input
          id={sliderId}
          type="range"
          min={21}
          max={79}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="absolute inset-0 m-0 size-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="mt-3 text-[13px] leading-[1.5] text-[#a9adb4]">
        Faites glisser pour comparer l’ampoule d’origine (avant) et{' '}
        {apresLabel === 'LED' ? 'la LED' : `l’ampoule ${apresLabel.toLowerCase()}`} (après).
        Visuels d’illustration.
      </figcaption>
    </figure>
  )
}
