import Link from 'next/link'
import type { SelectedVehicle } from '@/lib/session'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'
import { IconArrowRight, IconShield } from '@/components/ui/icons'

/**
 * Sélection du véhicule.
 *
 * **Une carte claire posée sur le bas du bandeau d'ouverture.** C'était un
 * second bandeau sombre, collé sous un hero lui-même sombre : deux masses de
 * même valeur se suivaient et le haut de page s'alourdissait, sans que rien
 * ne désigne par où commencer. La carte blanche, elle, est l'objet le plus
 * clair de l'écran — donc le premier regardé — et son chevauchement la relie
 * à la photo au lieu de l'empiler dessous.
 *
 * Elle emporte avec elle les deux défauts du bandeau : le filet saumon
 * #e76b5d sous l'onglet actif, resté de la maquette de référence et étranger
 * à la charte, et les libellés de champ écrits pour 7 px — que le plancher de
 * lisibilité remontait de toute façon à 10 px. Les champs passent de 43 à
 * 48 px, les libellés à 12 px.
 *
 * Le numéro d'étape « 01 » disparaît : il n'annonçait pas de « 02 ».
 *
 * Le sélecteur lui-même reste le composant de l'application : c'est lui qui
 * connaît la cascade marque → modèle → année, l'étape d'équipement d'origine
 * et le véhicule enregistré en session.
 *
 * **Deux états, parce que la question n'est pas la même.** Sans véhicule, la
 * carte demande lequel. Avec un véhicule déjà retenu, elle n'a plus de
 * question à poser : elle mène à ses éclairages, et range le formulaire
 * derrière « Changer de véhicule ». La carte redemandait l'information
 * qu'elle affichait déjà dans l'en-tête, avec des champs vides à re-saisir.
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

  /*
    Le fond reprend le gris du bandeau de réassurance qui suit, et non le gris
    papier : les deux ne différaient que de trois valeurs, ce qui donnait une
    couture visible sans être lisible comme une séparation. Ensemble ils
    forment une seule zone claire entre le bandeau d'ouverture, sombre, et le
    contenu, blanc — et c'est la carte qui porte le contraste.
  */
  return (
    <section aria-labelledby={TITLE_ID} className="bg-surface-soft">
      <div id="choisir-mon-vehicule" className="container-page scroll-mt-40 pb-7 fiche:pb-9">
        {/*
          Le chevauchement. `z-[1]` est nécessaire : le bandeau d'ouverture est
          `relative`, et sans indice la carte passerait dessous. La remontée
          reste modeste sur téléphone, où le bandeau est court et où la mention
          « Illustration de rendu » occupe déjà le bas.
        */}
        <div className="relative z-[1] -mt-6 rounded-[14px] border border-line bg-white p-5 shadow-[0_10px_30px_-14px_#0000003d] sm:-mt-8 sm:p-6">
          <div className="mb-4 items-center justify-between gap-5 sm:flex">
            <h2
              id={TITLE_ID}
              className="m-0 text-[17px] leading-[1.3] font-bold tracking-[-0.4px] sm:text-[18px]"
            >
              {vehicle ? `Vos éclairages pour la ${vehicle.label}` : content.title}
            </h2>

            {/*
              La maquette de référence ouvrait ici une recherche de
              démonstration. On pointe vers la recherche réelle : même rôle,
              même place, mais branchée sur le catalogue.

              Absent du téléphone, où il se plaçait entre le titre et l'action
              principale et la repoussait d'autant. Rien n'est perdu : la barre
              de recherche occupe déjà le haut de l'écran, à portée de pouce.
            */}
            <Link
              href="/recherche"
              className="hidden text-[12px] text-muted-strong underline underline-offset-[3px] hover:text-ink sm:inline-flex sm:shrink-0 sm:items-center"
            >
              Vous connaissez votre référence&nbsp;?
              <span aria-hidden="true" className="ml-1.5">
                ↗
              </span>
            </Link>
          </div>

          {vehicle ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  href="/vehicule/resultats"
                  className="inline-flex min-h-[48px] items-center justify-center gap-3 rounded-[9px] bg-brand px-6 text-[14px] font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  Voir les éclairages compatibles
                  <IconArrowRight className="size-[18px] shrink-0" />
                </Link>

                {vehicle.equipmentLabel ? (
                  <p className="m-0 text-[12px] text-muted-strong">
                    Équipement d&apos;origine retenu&nbsp;:{' '}
                    <span className="font-semibold text-ink">{vehicle.equipmentLabel}</span>
                  </p>
                ) : null}
              </div>

              {/*
                Action distincte, et formulaire rangé : le client qui revient
                n'a pas à traverser un formulaire pour atteindre ses éclairages.
                `<details>` plutôt qu'un état React — l'ouverture, la fermeture
                et le clavier sont assurés par le navigateur.
              */}
              <details className="group mt-3">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[12px] text-muted-strong underline underline-offset-[3px] hover:text-ink [&::-webkit-details-marker]:hidden">
                  Changer de véhicule
                  <span aria-hidden="true" className="ml-2 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-4 border-t border-line pt-5">
                  <VehicleSelector layout="inline" initial={initial} />
                </div>
              </details>
            </>
          ) : (
            <VehicleSelector layout="inline" initial={null} />
          )}

          <p className="mt-4 mb-0 flex items-center gap-2 text-[12px] leading-[1.6] text-muted">
            <IconShield className="size-[15px] shrink-0" />
            {content.note}
          </p>
        </div>
      </div>
    </section>
  )
}
