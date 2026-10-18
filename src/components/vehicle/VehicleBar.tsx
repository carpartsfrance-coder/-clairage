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

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
        vehicle ? 'border-line bg-surface-soft' : 'border-brand-border bg-brand-soft',
        className,
      )}
    >
      <Icon className="size-7 shrink-0 text-slate-ink" />

      {vehicle ? (
        <>
          <p className="min-w-0 flex-1 text-sm">
            <span className="mr-3 text-xs font-bold uppercase tracking-wide text-muted">
              Votre véhicule
            </span>
            <span className="font-semibold">{vehicle.label}</span>
            {vehicle.equipmentLabel ? (
              <span className="text-muted-strong"> · {vehicle.equipmentLabel}</span>
            ) : null}
          </p>
          <div className="shrink-0">
            <VehicleMenu vehicle={vehicle} variant="action" />
          </div>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Aucun véhicule sélectionné.</span>{' '}
            <span className="text-muted-strong">Aucune compatibilité ne peut être affirmée.</span>
          </p>
          <div className="shrink-0">
            <VehicleMenu vehicle={null} variant="action" />
          </div>
        </>
      )}
    </div>
  )
}
