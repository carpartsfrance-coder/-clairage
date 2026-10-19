import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import {
  getAdminGeneration,
  listLightPositions,
  listLightingEquipments,
  listVariantOptions,
} from '@/lib/queries/admin'
import { periodLabel, typePath, vehiclePackPath, type VehicleTypeValue } from '@/lib/admin/vehicles'
import { Alert, Card } from '@/components/ui/Surface'
import { Badge, FitmentBadge } from '@/components/ui/Badge'
import {
  GenerationCompatibilities,
  type ConfigurationRow,
} from '@/components/admin/GenerationCompatibilities'

/**
 * Configurations et compatibilités d'une génération.
 *
 * C'est le dernier maillon : une génération n'est utile au client que si elle
 * porte au moins une configuration — génération + finition + équipement
 * d'origine — et que cette configuration porte des compatibilités. Les deux se
 * saisissent ici, avec les règles qui les gouvernent affichées à côté des
 * champs plutôt que cachées dans la validation.
 */

export const metadata: Metadata = {
  title: 'Compatibilités',
  robots: { index: false, follow: false },
}

/** `Date` → `AAAA-MM-JJ`, le format qu'attend `<input type="date">`. */
function dateDeChamp(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

export default async function AdminGenerationPage({
  params,
}: {
  params: Promise<{ generationId: string }>
}) {
  const staff = await requireStaff('vehicles.view')
  const { generationId } = await params

  const [generation, equipments, positions, variants] = await Promise.all([
    getAdminGeneration(generationId),
    listLightingEquipments(),
    listLightPositions(),
    listVariantOptions(),
  ])
  if (!generation) notFound()

  const canEdit = can(staff.role, 'vehicles.edit')
  const make = generation.model.make
  const chemin = typePath(make.type as VehicleTypeValue)
  const cheminPublic = chemin
    ? vehiclePackPath(chemin, make.slug, generation.model.slug, generation.slug)
    : null

  const configurations: ConfigurationRow[] = generation.configurations.map((configuration) => ({
    id: configuration.id,
    equipmentLabel: configuration.equipment.label,
    trimName: configuration.trim?.name ?? null,
    headlampRef: configuration.headlampRef,
    label: configuration.label,
    active: configuration.active,
    attachments:
      configuration._count.savedVehicles +
      configuration._count.carts +
      configuration._count.orders,
    fitments: configuration.fitments.map((fitment) => ({
      id: fitment.id,
      positionLabel: fitment.position.label,
      variantLabel: `${fitment.variant.product.name} — ${fitment.variant.name} (${fitment.variant.sku})`,
      productSlug: fitment.variant.product.slug,
      draft: fitment.variant.product.status !== 'PUBLISHED',
      status: fitment.status,
      quantity: fitment.quantity,
      restrictions: fitment.restrictions,
      roadApproval: fitment.roadApproval,
      approvalMarket: fitment.approvalMarket,
      approvalNote: fitment.approvalNote,
      source: fitment.source,
      verifiedAt: dateDeChamp(fitment.verifiedAt),
      accessories: fitment.accessories.map((accessoire) => ({
        id: accessoire.id,
        label: `${accessoire.variant.product.name} — ${accessoire.variant.name} (${accessoire.variant.sku})`,
        quantity: accessoire.quantity,
        required: accessoire.required,
        note: accessoire.note,
      })),
    })),
  }))

  const total = configurations.reduce(
    (somme, configuration) => somme + configuration.fitments.length,
    0,
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[11px]">
          <Link href="/admin/vehicules" className="font-semibold underline underline-offset-4">
            Véhicules
          </Link>
          <span className="text-muted"> · {make.name}</span>
          <span className="text-muted"> · {generation.model.name}</span>
        </p>

        <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[22px] font-bold tracking-[-0.6px]">
          {generation.name}
          {generation.active ? null : <Badge tone="neutral">Inactive</Badge>}
        </h1>

        <p className="mt-1 text-[11px] text-muted-strong">
          {generation.phase ? `${generation.phase} · ` : ''}
          {periodLabel(generation.yearFrom, generation.yearTo)}
          {' · '}
          {configurations.length} configuration{configurations.length > 1 ? 's' : ''}
          {' · '}
          {total} compatibilité{total > 1 ? 's' : ''}
        </p>

        {/*
          L'adresse publique exacte, cliquable : c'est la vérification la plus
          rapide après une saisie, et elle évite de la deviner.
        */}
        {cheminPublic ? (
          <p className="mt-1 text-[11px]">
            <Link
              href={cheminPublic}
              className="font-semibold underline underline-offset-4"
              target="_blank"
            >
              {cheminPublic}
            </Link>
            {generation.active ? null : (
              <span className="text-warn"> — inactive, cette page ne répond pas</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-warn">
            La marque est de type « voiture et moto » : aucun parcours public ne la liste, cette
            génération n&apos;a donc pas d&apos;adresse.
          </p>
        )}
      </div>

      {canEdit ? (
        <GenerationCompatibilities
          generationId={generation.id}
          configurations={configurations}
          equipments={equipments.map((equipment) => ({
            id: equipment.id,
            label: equipment.label,
            hint: equipment.hint,
          }))}
          positions={positions.map((position) => ({
            id: position.id,
            label: position.label,
            defaultQty: position.defaultQty,
          }))}
          variants={variants.map((variant) => ({
            id: variant.id,
            label: `${variant.product.name} — ${variant.name} (${variant.sku})`,
            draft: variant.product.status !== 'PUBLISHED',
          }))}
        />
      ) : (
        <CompatibilitesEnLecture configurations={configurations} />
      )}
    </div>
  )
}

/** Vue sans écriture, pour les rôles qui n'ont pas `vehicles.edit`. */
function CompatibilitesEnLecture({ configurations }: { configurations: ConfigurationRow[] }) {
  return (
    <>
      <Alert tone="info">
        Votre rôle donne la consultation des compatibilités, pas leur modification.
      </Alert>

      {configurations.length === 0 ? (
        <Alert tone="warn">
          Aucune configuration : cette génération n&apos;affiche aucune pièce côté client.
        </Alert>
      ) : (
        configurations.map((configuration) => (
          <Card key={configuration.id} className="p-4">
            <h2 className="text-[13px] font-bold">{configuration.equipmentLabel}</h2>
            {configuration.fitments.length === 0 ? (
              <p className="mt-2 text-[11px] text-warn">Aucune compatibilité documentée.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {configuration.fitments.map((fitment) => (
                  <li
                    key={fitment.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
                  >
                    <span className="font-semibold">{fitment.positionLabel}</span>
                    <span className="min-w-0 flex-1 text-muted-strong">{fitment.variantLabel}</span>
                    <FitmentBadge status={fitment.status} short />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </>
  )
}
