import type { SelectedVehicle } from '@/lib/session'
import { VehicleMenu } from '@/components/layout/VehicleMenu'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Bandeau « votre véhicule » des pages catalogue et fiche produit
 * (02-fiche-produit.png, sous le fil d'Ariane).
 *
 * Deux états, et deux tailles.
 *
 * L'état « aucun véhicule » a longtemps été rendu partout en rouge pâle, de la
 * taille d'une alerte. Sur une liste de résultats, c'était le plus gros bloc de
 * l'écran avant même le premier produit : on barrait le catalogue pour réclamer
 * une information dont la navigation n'a pas besoin. Le variant `compact` dit
 * la même chose en une ligne neutre, et laisse passer.
 *
 * Le variant `full` reste pour l'endroit où la question se pose vraiment : la
 * fiche produit, où l'on s'apprête à acheter une pièce qui doit se monter.
 * C'est le moment utile, pas avant.
 */
export function VehicleBar({
  vehicle,
  className,
  variant = 'full',
}: {
  vehicle: SelectedVehicle | null
  className?: string
  /** `compact` sur les listes, `full` là où la compatibilité engage l'achat. */
  variant?: 'full' | 'compact'
}) {
  const Icon = vehicle?.type === 'MOTORCYCLE' ? IconMotorcycle : IconCar

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-surface-soft px-3 py-2 text-sm',
          className,
        )}
      >
        <Icon className="size-5 shrink-0 text-muted-strong" />

        {vehicle ? (
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{vehicle.label}</span>
            {vehicle.equipmentLabel ? (
              <span className="text-muted-strong"> · {vehicle.equipmentLabel}</span>
            ) : null}
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-muted-strong">
            Ajoutez votre véhicule pour vérifier la compatibilité.
          </p>
        )}

        <div className="shrink-0">
          <VehicleMenu vehicle={vehicle} variant="action" />
        </div>
      </div>
    )
  }

  /*
    `.vehicle-bar` du code de référence : fond #f5f6f3, filet #e7e9e2, rayon
    8 px, 12/19 px de retrait, pastille blanche de 36 px, surtitre à 8 px et
    intitulé à 12 px. L'état « aucun véhicule » garde le fond rouge pâle du
    projet : c'est le seul endroit de la fiche qui dit qu'aucune compatibilité
    ne peut être affirmée, et la référence n'a pas cet état.
  */
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-[11px] fiche:px-[19px] fiche:py-3',
        vehicle ? 'border-[#e7e9e2] bg-[#f5f6f3]' : 'border-brand-border bg-brand-soft',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 fiche:gap-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-white fiche:size-9">
          <Icon className="size-5 text-slate-ink fiche:size-[22px]" />
        </span>

        {vehicle ? (
          <div className="min-w-0">
            <small className="mb-px block text-[7px] tracking-[1.3px] text-[#697164] uppercase fiche:text-[8px]">
              Votre véhicule
            </small>
            <strong className="block text-[10px] fiche:text-[12px]">
              {vehicle.label}
              {vehicle.equipmentLabel ? (
                <span className="mt-0.5 block font-normal text-[9px] text-[#686c67] fiche:mt-0 fiche:ml-[5px] fiche:inline fiche:text-[12px]">
                  · {vehicle.equipmentLabel}
                </span>
              ) : null}
            </strong>
          </div>
        ) : (
          <p className="min-w-0 text-[10px] fiche:text-[12px]">
            <span className="font-semibold">Aucun véhicule sélectionné.</span>{' '}
            <span className="text-muted-strong">Aucune compatibilité ne peut être affirmée.</span>
          </p>
        )}
      </div>

      <div className="shrink-0">
        <VehicleMenu vehicle={vehicle} variant="action" />
      </div>
    </div>
  )
}
