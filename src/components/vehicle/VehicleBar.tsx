import type { SelectedVehicle } from '@/lib/session'
import { VehicleMenu } from '@/components/layout/VehicleMenu'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Bandeau « votre véhicule » des pages catalogue et fiche produit
 * (02-fiche-produit.png, sous le fil d'Ariane).
 *
 * Deux états seulement, et ils ne se ressemblent pas : un véhicule est
 * sélectionné, ou il ne l'est pas. Le second n'est pas un état dégradé qu'on
 * masque — c'est le moment où l'on demande l'information qui conditionne tout
 * le reste.
 */
export function VehicleBar({
  vehicle,
  className,
}: {
  vehicle: SelectedVehicle | null
  className?: string
}) {
  const Icon = vehicle?.type === 'MOTORCYCLE' ? IconMotorcycle : IconCar

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
