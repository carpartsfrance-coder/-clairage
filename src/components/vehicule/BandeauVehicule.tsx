import type { ReactNode } from 'react'
import { BrandMark } from '@/components/packs/BrandMark'

/**
 * Le bandeau d'ouverture d'une page véhicule, relevé sur la maquette.
 *
 * Fond sombre, surtitre barré de rouge, titre sur deux lignes, et la marque à
 * droite. Les deux pages véhicule le partagent — celle d'une génération et
 * celle des résultats — parce qu'elles montrent la même voiture au même
 * client.
 *
 * **C'est le logo de la marque qui est montré, pas la photo du modèle.** Les
 * 1 110 photos du référentiel mesurent 220 × 147 px : posées en grand dans un
 * bandeau large, elles étaient agrandies de près de trois fois et
 * s'affichaient floues. Les logos, eux, sont vectoriels pour 64 des 90
 * fichiers téléversés : ils restent nets à n'importe quelle taille. Et la
 * photo n'apprenait rien que le titre ne dise déjà — « Éclairage LED pour
 * Audi A2 » nomme la voiture mieux qu'une vignette de trois centimètres.
 *
 * **La plaque est blanche**, et c'est `BrandMark` qui en décide : sur les 90
 * logos, les uns sont des tracés transparents souvent très foncés, les autres
 * des images déjà détourées sur blanc. À même le fond sombre, les premiers
 * disparaîtraient et les seconds montreraient leur rectangle. Sans logo
 * téléversé, `BrandMark` pose le monogramme de la marque plutôt qu'un vide.
 */
export function BandeauVehicule({
  surtitre,
  titre,
  sousTitre,
  description,
  action,
  marque,
  logo,
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
  /** Le nom du constructeur : il porte le monogramme, faute de logo. */
  marque: string
  logo: { url: string; alt: string } | null
}) {
  return (
    <section className="bandeau-vehicule relative isolate mt-2 overflow-hidden rounded-[17px] text-white">
      <div className="flex min-h-[222px] items-center gap-6 px-[18px] py-5 max-[470px]:flex-col-reverse max-[470px]:items-start max-[470px]:gap-4 fiche:min-h-[252px] fiche:gap-10 fiche:px-[clamp(21px,4.1vw,56px)] fiche:py-[22px]">
        <div className="min-w-0 flex-1 fiche:max-w-[560px]">
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

        {/*
          La plaque flotte plutôt qu'elle n'est posée : un halo très pâle
          derrière elle évite le carré blanc découpé sur le dégradé.

          Masquée sur téléphone : posée au-dessus du titre, elle repoussait les
          packs d'un tiers d'écran pour un logo que la barre véhicule et le
          titre nomment déjà.
        */}
        <div className="relative mr-2 ml-auto shrink-0 max-[470px]:hidden fiche:mr-6">
          <span
            aria-hidden
            className="absolute -inset-7 rounded-full bg-white/[0.07] blur-2xl"
          />
          <BrandMark
            name={marque}
            logo={logo}
            size="xl"
            className="relative border-transparent shadow-[0_12px_34px_rgb(0_0_0/0.38)]"
          />
        </div>
      </div>
    </section>
  )
}
