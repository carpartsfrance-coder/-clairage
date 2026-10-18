import type { Metadata } from 'next'
import { requireStaff } from '@/lib/admin/guard'
import { listVehicleMakes } from '@/lib/queries/admin'
import { Badge } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Référentiel des véhicules.
 *
 * Écran de lecture seule, et il le dit. Aucune action d'écriture n'existe pour
 * les véhicules ni pour les compatibilités : afficher un bouton « Ajouter »
 * ferait croire à une saisie possible. Le chargement passe par le script
 * d'amorçage ou par un import.
 */

export const metadata: Metadata = {
  title: 'Véhicules',
  robots: { index: false, follow: false },
}

const TYPE_LABELS: Record<string, string> = {
  CAR: 'Voiture',
  MOTORCYCLE: 'Moto',
  BOTH: 'Voiture et moto',
}

/** « 2012–2019 » si la génération est arrêtée, « depuis 2019 » sinon. */
function periodLabel(yearFrom: number, yearTo: number | null): string {
  return yearTo ? `${yearFrom}–${yearTo}` : `depuis ${yearFrom}`
}

export default async function AdminVehiculesPage() {
  await requireStaff('vehicles.view')
  const makes = await listVehicleMakes()

  // Compté sur les données chargées, pas estimé : une génération sans
  // configuration ne peut porter aucune compatibilité.
  const orphanGenerations = makes.reduce(
    (total, make) =>
      total +
      make.models.reduce(
        (perMake, model) =>
          perMake + model.generations.filter((g) => g._count.configurations === 0).length,
        0,
      ),
    0,
  )

  return (
    <div className="container-page py-6">
      <h1 className="text-2xl font-extrabold">Véhicules</h1>

      <p className="mt-2 max-w-prose text-sm text-muted-strong">
        Le référentiel qui sert aux compatibilités : c&apos;est lui que le client parcourt pour
        désigner son véhicule, et c&apos;est sur lui que les pièces sont rattachées.
      </p>

      <Alert tone="info" title="Comment une compatibilité se rattache" className="mt-5">
        <p>
          Une <strong>configuration</strong> est le triplet génération + version + équipement
          d&apos;origine. C&apos;est elle, et elle seule, qui porte les compatibilités : une
          génération sans configuration n&apos;est atteignable par aucune pièce.
        </p>
        {orphanGenerations > 0 ? (
          <p className="mt-1">
            {orphanGenerations} génération{orphanGenerations > 1 ? 's' : ''} sans configuration dans
            ce référentiel.
          </p>
        ) : null}
      </Alert>

      <p className="mt-4 text-sm text-muted-strong">
        La saisie des véhicules et des compatibilités depuis le back-office n&apos;est pas encore
        disponible ; elles se chargent par le script d&apos;amorçage ou par import.
      </p>

      <section aria-labelledby="referentiel" className="mt-6">
        <h2 id="referentiel" className="text-lg font-bold">
          Marques
        </h2>

        {makes.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<IconCar className="size-8" />}
            title="Aucune marque enregistrée."
            description="Le référentiel se charge par le script d'amorçage (npm run seed) ou par un import ; il ne se saisit pas depuis cette page."
          />
        ) : (
          <Card className="mt-4 divide-y divide-line">
            {makes.map((make) => (
              <details key={make.id} open={makes.length === 1}>
                <summary className="flex min-h-9 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm hover:bg-surface-soft">
                  {make.type === 'MOTORCYCLE' ? (
                    <IconMotorcycle className="size-4 shrink-0 text-muted-strong" />
                  ) : (
                    <IconCar className="size-4 shrink-0 text-muted-strong" />
                  )}
                  <span className="font-semibold">{make.name}</span>
                  <span className="text-muted">{TYPE_LABELS[make.type] ?? make.type}</span>
                  <span className="text-muted">
                    {make._count.models} modèle{make._count.models > 1 ? 's' : ''}
                  </span>
                  {make.active ? null : <Badge tone="neutral">Inactive</Badge>}
                </summary>

                <div className="border-t border-line bg-surface-soft px-3 py-3">
                  {make.models.length === 0 ? (
                    <p className="text-sm text-muted-strong">Aucun modèle pour cette marque.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {make.models.map((model) => (
                        <li key={model.id}>
                          <h3 className="text-sm font-semibold">
                            {model.name}
                            {model.active ? null : (
                              <span className="ml-2 align-middle">
                                <Badge tone="neutral">Inactif</Badge>
                              </span>
                            )}
                          </h3>

                          {model.generations.length === 0 ? (
                            <p className="mt-1 text-sm text-warn">
                              Aucune génération : ce modèle n&apos;apparaît pas dans le parcours
                              véhicule.
                            </p>
                          ) : (
                            <ul className="mt-1 flex flex-col gap-1">
                              {model.generations.map((generation) => (
                                <li
                                  key={generation.id}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
                                >
                                  <span className="font-medium">{generation.name}</span>
                                  {generation.phase ? (
                                    <span className="text-muted">{generation.phase}</span>
                                  ) : null}
                                  <span className="text-muted">
                                    {periodLabel(generation.yearFrom, generation.yearTo)}
                                  </span>
                                  {generation._count.configurations === 0 ? (
                                    <span className="text-warn">
                                      aucune configuration — aucune compatibilité ne peut être
                                      rattachée, le véhicule est inutilisable dans le parcours
                                    </span>
                                  ) : (
                                    <span className="text-muted">
                                      {generation._count.configurations} configuration
                                      {generation._count.configurations > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {generation.active ? null : <Badge tone="neutral">Inactive</Badge>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}
