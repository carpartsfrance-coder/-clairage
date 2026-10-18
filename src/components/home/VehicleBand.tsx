import { VehicleSelector } from '@/components/vehicle/VehicleSelector'

/**
 * Bandeau sombre de sélection du véhicule, juste sous le hero.
 *
 * Le bandeau reste sombre : seuls les trois champs du sélecteur sont blancs.
 * La bascule Voiture/Moto, les champs et le bouton appartiennent à
 * `VehicleSelector` (composant client), qui est le seul à connaître l'état de
 * la cascade marque → modèle → année.
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
    <section aria-labelledby={TITLE_ID} className="bg-ink on-dark">
      <div className="container-page py-8">
        <h2
          id={TITLE_ID}
          className="text-[1.35rem] leading-tight font-bold text-white"
        >
          {content.title}
        </h2>

        <VehicleSelector layout="inline" className="mt-4" />

        {/* Précision sur l'équipement d'origine : elle suit les champs, sous le bouton. */}
        <p className="mt-3 text-xs text-white/60 md:text-right">{content.note}</p>
      </div>
    </section>
  )
}
