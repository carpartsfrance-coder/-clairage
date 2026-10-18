import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/session'
import { getMySavedVehicles } from '@/lib/queries/account'
import { deleteSavedVehicle, useSavedVehicle } from '@/lib/actions/account'
import { getSelectedVehicle } from '@/lib/session'
import { AccountNav } from '@/components/account/AccountNav'
import { SaveVehicleForm } from '@/components/account/SaveVehicleForm'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Surface'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Véhicules enregistrés.
 *
 * `requireUser()` est la première instruction : le contrôle d'accès est fait
 * côté serveur, avant toute lecture. La lecture passe par
 * `getMySavedVehicles`, qui pose `userId` dans le `where` — aucune requête
 * Prisma n'est écrite ici.
 */

export const metadata: Metadata = {
  title: 'Mes véhicules',
  robots: { index: false, follow: false },
}

export default async function MesVehiculesPage() {
  const user = await requireUser()
  const [vehicles, selected] = await Promise.all([
    getMySavedVehicles(user.id),
    getSelectedVehicle(),
  ])

  // Le véhicule de la session en cours n'est proposé que s'il n'est pas déjà
  // enregistré : sinon la carte inviterait à créer un doublon.
  const offerToSave =
    selected !== null &&
    !vehicles.some((vehicle) => vehicle.configurationId === selected.configurationId)

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon compte', href: '/compte' },
          { label: 'Mes véhicules' },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Mes véhicules
      </h1>

      <p className="mt-3 max-w-prose text-muted-strong">
        Un véhicule enregistré permet de retrouver la compatibilité des pièces sans le ressaisir.
      </p>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="vehicules" />

        <div className="min-w-0 flex-1">
          {offerToSave ? (
            <section aria-labelledby="vehicules-session">
              <h2 id="vehicules-session" className="text-lg font-bold">
                Véhicule sélectionné
              </h2>

              <Card className="mt-4 p-5">
                <div className="flex items-start gap-3">
                  {selected.type === 'MOTORCYCLE' ? (
                    <IconMotorcycle className="mt-0.5 size-6 shrink-0 text-muted-strong" />
                  ) : (
                    <IconCar className="mt-0.5 size-6 shrink-0 text-muted-strong" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold">{selected.label}</p>
                    {selected.equipmentLabel ? (
                      <p className="text-sm text-muted-strong">{selected.equipmentLabel}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-line pt-4">
                  <SaveVehicleForm configurationId={selected.configurationId} />
                </div>
              </Card>
            </section>
          ) : null}

          <section
            aria-labelledby="vehicules-liste"
            className={offerToSave ? 'mt-10' : undefined}
          >
            <h2 id="vehicules-liste" className="sr-only">
              Véhicules enregistrés
            </h2>

            {vehicles.length === 0 ? (
              // Rien d'enregistré mais un véhicule en session : la carte
              // ci-dessus est déjà la sortie, un état vide ferait doublon.
              offerToSave ? null : (
                <EmptyState
                  icon={<IconCar className="size-8" />}
                  title="Aucun véhicule enregistré."
                  description="Sélectionnez un véhicule pour l'enregistrer et le retrouver ensuite sans le ressaisir."
                  action={{ label: 'Choisir mon véhicule', href: '/vehicule' }}
                />
              )
            ) : (
              <ul className="flex flex-col gap-4">
                {vehicles.map((vehicle) => (
                  <Card as="li" key={vehicle.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {vehicle.type === 'MOTORCYCLE' ? (
                          <IconMotorcycle className="mt-0.5 size-6 shrink-0 text-muted-strong" />
                        ) : (
                          <IconCar className="mt-0.5 size-6 shrink-0 text-muted-strong" />
                        )}
                        <div className="min-w-0">
                          <p className="font-bold">{vehicle.label}</p>
                          <p className="text-sm text-muted-strong">{vehicle.equipmentLabel}</p>
                          {vehicle.nickname ? (
                            <p className="mt-1 text-sm text-muted">{vehicle.nickname}</p>
                          ) : null}
                          {vehicle.plate ? (
                            <p className="text-sm text-muted">{vehicle.plate}</p>
                          ) : null}
                        </div>
                      </div>
                      {vehicle.isPrimary ? <Badge>Principal</Badge> : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4">
                      <form action={useSavedVehicle}>
                        <input type="hidden" name="id" value={vehicle.id} />
                        <Button
                          type="submit"
                          variant="secondary"
                          aria-label={`Utiliser le véhicule ${vehicle.label}`}
                        >
                          Utiliser ce véhicule
                        </Button>
                      </form>

                      <form action={deleteSavedVehicle}>
                        <input type="hidden" name="id" value={vehicle.id} />
                        <button
                          type="submit"
                          aria-label={`Retirer le véhicule ${vehicle.label}`}
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-danger underline underline-offset-4"
                        >
                          Retirer
                        </button>
                      </form>
                    </div>
                  </Card>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
