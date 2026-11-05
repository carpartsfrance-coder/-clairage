import type { ReactNode } from 'react'
import Image from 'next/image'

/**
 * Le bandeau d'ouverture d'une page véhicule, relevé sur la maquette.
 *
 * Fond sombre, surtitre barré de rouge, titre sur deux lignes, et la voiture
 * qui entre par la droite en se fondant dans le dégradé. Les deux pages
 * véhicule le partagent — celle d'une génération et celle des résultats —
 * parce qu'elles montrent la même voiture au même client.
 *
 * **La photo est bornée à sa taille.** Les 1 110 photos du référentiel
 * mesurent 220 × 147 px. La version précédente les étirait jusqu'à 633 px,
 * soit près de trois fois : la voiture s'affichait floue. Le cadre suit donc
 * le rapport 1,82 de la maquette mais ne dépasse pas 420 px de large, ce qui
 * tient l'agrandissement sous le double même sur grand écran.
 */
export function BandeauVehicule({
  surtitre,
  titre,
  sousTitre,
  description,
  action,
  photo,
}: {
  /** « Audi A2 · 2000–2005 », en petites capitales espacées. */
  surtitre: string
  /** Première ligne du titre : « Éclairage LED ». */
  titre: string
  /** Seconde ligne : « pour Audi A2 ». Les deux se suivent sur un téléphone. */
  sousTitre: string
  description: string
  /** Le bouton rouge, ou rien quand la page n'a rien à proposer. */
  action?: ReactNode
  photo: { url: string; alt: string } | null
}) {
  return (
    <section className="bandeau-vehicule relative isolate mt-2 flex min-h-[222px] items-center overflow-hidden rounded-[17px] text-white max-[470px]:flex-col max-[470px]:items-stretch fiche:min-h-[252px]">
      <div className="z-[1] w-[53%] py-5 pl-[18px] max-[470px]:w-auto max-[470px]:px-4 max-[470px]:pt-[17px] max-[470px]:pb-0 fiche:w-[51%] fiche:py-[22px] fiche:pl-[clamp(21px,4.1vw,56px)]">
        <span className="inline-flex items-center gap-2.5 text-[11px] font-bold tracking-[0.17em] text-[#e7e9ee] uppercase before:h-0.5 before:w-[19px] before:bg-[#f23341] before:content-['']">
          {surtitre}
        </span>

        <h1 className="my-2 text-[clamp(29px,4.4vw,58px)] leading-[1.02] font-extrabold tracking-[-0.06em] text-white">
          <span className="block max-[470px]:inline">{titre}</span>{' '}
          <span className="block max-[470px]:inline">{sousTitre}</span>
        </h1>

        <p className="max-w-[320px] text-[13px] leading-[1.45] text-[#d7d9dd] fiche:text-[14px]">
          {description}
        </p>

        {action ? <div className="mt-[15px] flex flex-wrap items-center gap-3">{action}</div> : null}
      </div>

      {photo ? (
        <div className="photo-fondue-gauche pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-[57%] max-w-[420px] max-[470px]:photo-fondue-haut max-[470px]:relative max-[470px]:inset-auto max-[470px]:-mt-1 max-[470px]:h-auto max-[470px]:w-full max-[470px]:max-w-none">
          <Image
            src={photo.url}
            alt={photo.alt}
            width={220}
            height={147}
            sizes="420px"
            className="h-full w-full object-cover object-[50%_52%] max-[470px]:aspect-[1.83] max-[470px]:object-center"
            priority
          />
        </div>
      ) : null}
    </section>
  )
}
