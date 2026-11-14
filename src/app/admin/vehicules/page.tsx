import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { listMediaOptions, listVehicleMakes } from '@/lib/queries/admin'
import {
  VEHICLE_TYPE_LABELS,
  periodLabel,
  typePath,
  type VehicleTypeValue,
} from '@/lib/admin/vehicles'
import { Badge } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'
import { BrandMark } from '@/components/packs/BrandMark'
import { VehicleTree, type MakeRow } from '@/components/admin/VehicleTree'

/**
 * Référentiel des véhicules — marques, modèles, générations.
 *
 * Cet écran était en lecture seule : le référentiel ne se chargeait que par le
 * script d'amorçage ou par import, ce qui réservait la croissance du catalogue
 * à qui dispose d'un terminal. Il écrit désormais, et ce qu'il écrit pilote
 * directement le site : une marque sans modèle actif n'entre pas dans le menu,
 * un modèle sans génération n'ouvre sur rien.
 *
 * Les configurations et les compatibilités sont sur la page de chaque
 * génération : elles y ont besoin de place, et c'est là qu'on y pense.
 */

export const metadata: Metadata = {
  title: 'Véhicules',
  robots: { index: false, follow: false },
}

export default async function AdminVehiculesPage() {
  const staff = await requireStaff('vehicles.view')
  const canEdit = can(staff.role, 'vehicles.edit')
  const [makes, medias] = await Promise.all([listVehicleMakes(), listMediaOptions()])

  // Les compatibilités sont comptées à chaque étage : c'est ce qui décide
  // qu'une ligne se supprime sans perte, ou qu'elle doit seulement se
  // désactiver.
  const rows: MakeRow[] = makes.map((make) => {
    const models = make.models.map((model) => {
      const generations = model.generations.map((generation) => {
        const fitments = generation.configurations.reduce(
          (total, configuration) => total + configuration._count.fitments,
          0,
        )
        return {
          id: generation.id,
          slug: generation.slug,
          name: generation.name,
          phase: generation.phase,
          yearFrom: generation.yearFrom,
          yearTo: generation.yearTo,
          active: generation.active,
          configurations: generation._count.configurations,
          activeConfigurations: generation.configurations.filter((c) => c.active).length,
          fitments,
        }
      })
      return {
        id: model.id,
        slug: model.slug,
        name: model.name,
        active: model.active,
        fitments: generations.reduce((total, generation) => total + generation.fitments, 0),
        generations,
      }
    })

    return {
      id: make.id,
      slug: make.slug,
      name: make.name,
      type: make.type as VehicleTypeValue,
      position: make.position,
      active: make.active,
      fitments: models.reduce((total, model) => total + model.fitments, 0),
      logo: make.logo
        ? { id: make.logo.id, url: make.logo.url, alt: make.logo.alt ?? make.name }
        : null,
      models,
    }
  })

  const generationsSansConfiguration = rows.reduce(
    (total, make) =>
      total +
      make.models.reduce(
        (perMake, model) =>
          perMake + model.generations.filter((generation) => generation.configurations === 0).length,
        0,
      ),
    0,
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.6px]">Véhicules</h1>
        <p className="mt-1 max-w-[680px] text-[11px] leading-[1.8] text-muted-strong">
          Le référentiel qui sert aux compatibilités : c&apos;est lui que le client parcourt pour
          désigner son véhicule, et c&apos;est sur lui que les pièces sont rattachées. Une
          <strong> configuration</strong> — génération + finition + équipement d&apos;origine — est
          la seule chose qui porte une compatibilité : une génération sans configuration
          n&apos;est atteignable par aucune pièce.
        </p>
      </div>

      {generationsSansConfiguration > 0 ? (
        <Alert tone="warn">
          {generationsSansConfiguration > 1
            ? `${generationsSansConfiguration} générations sont sans configuration : leurs pages publiques n'affichent aucune pièce. Ouvrez-les et donnez-leur un équipement d'origine.`
            : "1 génération est sans configuration : sa page publique n'affiche aucune pièce. Ouvrez-la et donnez-lui un équipement d'origine."}
        </Alert>
      ) : null}

      {makes.length === 0 && !canEdit ? (
        <EmptyState
          icon={<IconCar className="size-8" />}
          title="Aucune marque enregistrée."
          description="Votre rôle ne permet pas la saisie des véhicules : le référentiel se charge depuis un compte catalogue ou administration, ou par import."
        />
      ) : null}

      {canEdit ? (
        <VehicleTree
          makes={rows}
          medias={medias.map((media) => ({
            id: media.id,
            // Ce qui permet de reconnaître le visuel : son texte alternatif,
            // sa légende, ou à défaut sa clé de stockage. Jamais un libellé
            // inventé — un visuel sans texte alternatif doit se voir.
            label: media.alt || media.caption || media.storageKey,
          }))}
        />
      ) : (
        <ReferentielEnLecture rows={rows} />
      )}

      <p className="text-[11px] leading-[1.8] text-muted">
        Les chargements en nombre restent du ressort de l&apos;
        <Link href="/admin/imports" className="font-semibold underline underline-offset-4">
          import CSV
        </Link>
        {' '}: cet écran est fait pour quelques véhicules à la fois, pas pour un catalogue
        constructeur entier.
      </p>
    </div>
  )
}

/**
 * Vue sans écriture, pour les rôles qui n'ont pas `vehicles.edit`.
 *
 * Afficher les formulaires à un rôle qui sera refusé au moment du clic serait
 * une porte qui se referme : on montre le référentiel, et on dit pourquoi il
 * n'est pas modifiable ici.
 */
function ReferentielEnLecture({ rows }: { rows: MakeRow[] }) {
  if (rows.length === 0) return null

  return (
    <>
      <Alert tone="info">
        Votre rôle donne la consultation du référentiel véhicule, pas sa modification.
      </Alert>

      <Card className="divide-y divide-line">
        {rows.map((make) => {
          const chemin = typePath(make.type)
          return (
            <details key={make.id} open={rows.length === 1}>
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] hover:bg-surface-soft">
                <BrandMark name={make.name} logo={make.logo} size="sm" />
                {make.type === 'MOTORCYCLE' ? (
                  <IconMotorcycle className="size-4 shrink-0 text-muted-strong" />
                ) : (
                  <IconCar className="size-4 shrink-0 text-muted-strong" />
                )}
                <span className="font-semibold">{make.name}</span>
                <span className="text-[11px] text-muted">{VEHICLE_TYPE_LABELS[make.type]}</span>
                <span className="text-[11px] text-muted">
                  {make.models.length} modèle{make.models.length > 1 ? 's' : ''}
                </span>
                {make.active ? null : <Badge tone="neutral">Inactive</Badge>}
              </summary>

              <div className="border-t border-line bg-surface-soft px-3 py-3">
                {make.models.length === 0 ? (
                  <p className="text-[11px] text-muted-strong">Aucun modèle pour cette marque.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {make.models.map((model) => (
                      <li key={model.id}>
                        <h3 className="text-[12px] font-semibold">
                          {model.name}
                          {model.active ? null : (
                            <span className="ml-2 align-middle">
                              <Badge tone="neutral">Inactif</Badge>
                            </span>
                          )}
                        </h3>

                        {model.generations.length === 0 ? (
                          <p className="mt-1 text-[11px] text-warn">
                            Aucune génération : ce modèle n&apos;apparaît pas dans le parcours
                            véhicule.
                          </p>
                        ) : (
                          <ul className="mt-1 flex flex-col gap-1">
                            {model.generations.map((generation) => (
                              <li
                                key={generation.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]"
                              >
                                <Link
                                  href={`/admin/vehicules/${generation.id}`}
                                  className="font-medium underline underline-offset-4"
                                >
                                  {generation.name}
                                </Link>
                                {generation.phase ? (
                                  <span className="text-muted">{generation.phase}</span>
                                ) : null}
                                <span className="text-muted">
                                  {periodLabel(generation.yearFrom, generation.yearTo)}
                                </span>
                                {generation.configurations === 0 ? (
                                  <span className="text-warn">
                                    aucune configuration — aucune pièce ne peut s&apos;y rattacher
                                  </span>
                                ) : (
                                  <span className="text-muted">
                                    {generation.configurations} configuration
                                    {generation.configurations > 1 ? 's' : ''} ·{' '}
                                    {generation.fitments} compatibilité
                                    {generation.fitments > 1 ? 's' : ''}
                                  </span>
                                )}
                                {chemin ? (
                                  <code className="rounded bg-white px-1 text-[10px] text-muted">
                                    /packs/{chemin}/{make.slug}/{model.slug}/{generation.slug}
                                  </code>
                                ) : null}
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
          )
        })}
      </Card>
    </>
  )
}
