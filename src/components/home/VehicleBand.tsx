import Link from 'next/link'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'
import { IconShield } from '@/components/ui/icons'

/**
 * Sélection du véhicule — `.finder-section` du code de référence.
 *
 * Valeurs reprises de `home.css` : fond #23282c, filet supérieur #42484c,
 * 22 px de marge haute et 20 px de marge basse, numéro d'étape, titre à 16 px,
 * onglets soulignés, puis la grille des champs et la note de bas de bloc.
 *
 * Le sélecteur lui-même reste le composant de l'application : c'est lui qui
 * connaît la cascade marque → modèle → année, l'étape d'équipement d'origine
 * et le véhicule enregistré en session. La référence n'en fournit qu'une
 * démonstration avec des `<option>` écrites en dur.
 */

export type VehicleBandProps = {
  content: {
    title: string
    note: string
  }
}

const TITLE_ID = 'selection-vehicule-titre'

export function VehicleBand({ content }: VehicleBandProps) {
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="border-t border-[#42484c] bg-[#23282c] text-white"
    >
      <div id="choisir-mon-vehicule" className="container-page scroll-mt-40 pt-[22px] pb-5">
        {/* .finder-intro : étape + titre à gauche, raccourci à droite. */}
        <div className="mb-[17px] block items-center justify-between lg:flex">
          <div className="flex items-start gap-[10px] lg:items-center lg:gap-[11px]">
            <span className="mt-0.5 text-[8px] font-bold tracking-[1px] text-[#a6b0b5] lg:mt-0 lg:text-[9px]">
              01
            </span>
            <h2
              id={TITLE_ID}
              className="max-w-[275px] text-[16px] leading-[1.3] font-semibold tracking-[-0.3px] lg:max-w-none"
            >
              {content.title}
            </h2>
          </div>

          {/*
            La référence ouvre ici une fenêtre de recherche de démonstration.
            On pointe vers la recherche réelle de l'application : même rôle,
            même place, mais branché sur le catalogue.
          */}
          <Link
            href="/recherche"
            className="mt-3 hidden text-[9px] text-[#adb4b6] underline underline-offset-[3px] hover:text-white lg:mt-0 lg:inline-block"
          >
            Vous connaissez votre référence ? <span className="ml-2">↗</span>
          </Link>
        </div>

        <VehicleSelector layout="inline" />

        {/* .finder-footnote : 8 px, bouclier à gauche, exemple poussé à droite. */}
        <p className="mt-[11px] flex items-center gap-1.5 text-[8px] text-[#a7b0b5]">
          <IconShield className="size-[11px] shrink-0" />
          {content.note}
        </p>
      </div>
    </section>
  )
}
