import Link from 'next/link'
import type { SelectedVehicle } from '@/lib/session'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'
import { IconArrowRight, IconShield } from '@/components/ui/icons'

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
 *
 * **Deux états, parce que la question n'est pas la même.** Sans véhicule, le
 * bandeau demande lequel. Avec un véhicule déjà retenu, il n'a plus de
 * question à poser : il mène à ses éclairages, et range le formulaire derrière
 * « Changer de véhicule ». Le bandeau redemandait l'information qu'il affichait
 * déjà dans l'en-tête, avec des champs vides à re-saisir.
 */

export type VehicleBandProps = {
  content: {
    title: string
    note: string
  }
  /** Véhicule déjà retenu, s'il y en a un. */
  vehicle?: SelectedVehicle | null
}

const TITLE_ID = 'selection-vehicule-titre'

export function VehicleBand({ content, vehicle = null }: VehicleBandProps) {
  const initial = vehicle
    ? {
        type: vehicle.type,
        makeId: vehicle.selection.makeId,
        modelId: vehicle.selection.modelId,
        year: vehicle.selection.year,
      }
    : null

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
              {vehicle
                ? `Vos éclairages pour la ${vehicle.label}`
                : content.title}
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

        {vehicle ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/vehicule/resultats"
                className="inline-flex min-h-[43px] items-center justify-center gap-[18px] rounded-[7px] bg-brand px-[17px] py-[11px] text-[11px] font-bold text-white transition-colors hover:bg-brand-dark"
              >
                Voir les éclairages compatibles
                <IconArrowRight className="size-4 shrink-0" />
              </Link>

              {vehicle.equipmentLabel ? (
                <p className="text-[10px] text-[#a7b0b5]">
                  Équipement d&apos;origine retenu :{' '}
                  <span className="text-white">{vehicle.equipmentLabel}</span>
                </p>
              ) : null}
            </div>

            {/*
              Action distincte, et formulaire rangé : le client qui revient
              n'a pas à traverser un formulaire pour atteindre ses éclairages.
              `<details>` plutôt qu'un état React — l'ouverture, la fermeture
              et le clavier sont assurés par le navigateur.
            */}
            <details className="group mt-[15px]">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[10px] text-[#adb4b6] underline underline-offset-[3px] hover:text-white [&::-webkit-details-marker]:hidden">
                Changer de véhicule
                <span aria-hidden="true" className="ml-2 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3">
                <VehicleSelector layout="inline" initial={initial} />
              </div>
            </details>
          </>
        ) : (
          <VehicleSelector layout="inline" initial={null} />
        )}

        {/* .finder-footnote : 8 px, bouclier à gauche, exemple poussé à droite. */}
        <p className="mt-[11px] flex items-center gap-1.5 text-[8px] text-[#a7b0b5]">
          <IconShield className="size-[11px] shrink-0" />
          {content.note}
        </p>
      </div>
    </section>
  )
}
