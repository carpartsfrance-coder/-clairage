'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { manageCompatibility, type VehicleAdminState } from '@/lib/actions/admin-vehicles'
import {
  FITMENT_STATUSES,
  FITMENT_STATUS_LABELS,
  ROAD_APPROVALS,
  ROAD_APPROVAL_LABELS,
  type FitmentStatusValue,
  type RoadApprovalValue,
} from '@/lib/admin/vehicles'
import { Alert, Card } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { Badge, FitmentBadge } from '@/components/ui/Badge'
import { SelectField, TextField } from '@/components/ui/Field'

/**
 * Configurations d'une génération, et compatibilités de chacune.
 *
 * C'est l'écran qui manquait pour que la boutique grandisse sans ligne de
 * commande : une génération sans configuration ne mène à rien, et une
 * configuration sans compatibilité n'affiche aucune pièce.
 *
 * Deux règles sont inscrites dans l'interface elle-même, pas seulement dans la
 * validation :
 *
 * - **Le statut proposé par défaut est « à vérifier ».** La liste s'ouvre
 *   dessus ; « confirmée » existe mais réclame une source et une date. Rien
 *   n'est pré-rempli à la place de l'administrateur : une date du jour posée
 *   automatiquement inscrirait comme vérifiée une compatibilité que personne
 *   n'a vérifiée.
 * - **Compatibilité de montage et homologation routière sont deux champs
 *   distincts.** Un kit peut se monter et n'être pas homologué ; aucun des
 *   deux ne se déduit de l'autre, et l'écran ne les fusionne pas.
 */

export type VariantOption = {
  id: string
  label: string
  /** Produit encore en brouillon : signalé, mais sélectionnable. */
  draft: boolean
}

export type EquipmentOption = { id: string; label: string; hint: string | null }
export type PositionOption = { id: string; label: string; defaultQty: number }

export type AccessoryRow = {
  id: string
  label: string
  quantity: number
  required: boolean
  note: string | null
}

export type FitmentRow = {
  id: string
  positionLabel: string
  variantLabel: string
  productSlug: string
  draft: boolean
  status: FitmentStatusValue
  quantity: number
  restrictions: string | null
  roadApproval: RoadApprovalValue
  approvalMarket: string
  approvalNote: string | null
  source: string | null
  /** Déjà formatée en AAAA-MM-JJ pour le champ date. */
  verifiedAt: string | null
  accessories: AccessoryRow[]
}

export type ConfigurationRow = {
  id: string
  equipmentLabel: string
  trimName: string | null
  headlampRef: string | null
  label: string | null
  active: boolean
  /** Véhicules enregistrés, paniers et commandes qui pointent dessus. */
  attachments: number
  fitments: FitmentRow[]
}

type Dispatch = {
  action: (formData: FormData) => void
  pending: boolean
}

const miniBouton =
  'inline-flex min-h-9 items-center rounded-md border border-[#c4c4c4] px-3 text-[11px] font-semibold transition-colors hover:border-slate-ink disabled:opacity-50'

function Cible({ level, intent }: { level: 'configuration' | 'fitment'; intent: string }) {
  return (
    <>
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="intent" value={intent} />
    </>
  )
}

/** Liste déroulante des références, brouillons signalés. */
function ChampReference({
  id,
  variants,
  defaultValue,
  label = 'Référence',
}: {
  id: string
  variants: VariantOption[]
  defaultValue?: string
  label?: string
}) {
  return (
    <SelectField
      id={id}
      name="variantId"
      label={label}
      defaultValue={defaultValue}
      fieldSize="sm"
      wrapperClassName="min-w-0 flex-1 basis-[240px]"
      required
    >
      <option value="">Choisir…</option>
      {variants.map((variant) => (
        <option key={variant.id} value={variant.id}>
          {variant.label}
          {variant.draft ? ' — brouillon' : ''}
        </option>
      ))}
    </SelectField>
  )
}

/* -------------------------------------------------------------------------- */
/* Champs d'une compatibilité                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Les champs partagés par la création et la modification.
 *
 * Écrits une seule fois : deux copies divergeraient, et c'est précisément ici
 * que résident les garde-fous — statut par défaut, source et date saisies à la
 * main. L'aide sous le statut répète la règle, pour qu'elle se lise au moment
 * du choix et pas seulement dans le message d'erreur.
 */
function ChampsCompatibilite({ fitment }: { fitment?: FitmentRow }) {
  const prefix = fitment ? `fit-${fitment.id}` : 'new-fit'

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          id={`${prefix}-status`}
          name="status"
          label="Compatibilité de montage"
          defaultValue={fitment?.status ?? 'UNKNOWN'}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[200px]"
        >
          {FITMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {FITMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </SelectField>

        <TextField
          id={`${prefix}-quantity`}
          name="quantity"
          label="Quantité"
          type="number"
          min={1}
          max={99}
          step={1}
          defaultValue={fitment?.quantity ?? 1}
          fieldSize="sm"
          wrapperClassName="basis-[92px]"
          hint="Par emplacement"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextField
          id={`${prefix}-source`}
          name="source"
          label="Source"
          defaultValue={fitment?.source ?? ''}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[200px]"
          placeholder="Catalogue Valeo 2025, essai en atelier…"
        />
        <TextField
          id={`${prefix}-verifiedAt`}
          name="verifiedAt"
          label="Vérifiée le"
          type="date"
          defaultValue={fitment?.verifiedAt ?? ''}
          fieldSize="sm"
          wrapperClassName="basis-[170px]"
        />
      </div>

      <p className="mt-1 text-[10px] leading-[1.7] text-muted">
        « Compatibilité confirmée » exige la source et la date : sans elles, la ligne reste « à
        vérifier ». Aucune des deux n&apos;est remplie automatiquement — une vérification non
        faite ne doit pas s&apos;inscrire comme faite.
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <SelectField
          id={`${prefix}-roadApproval`}
          name="roadApproval"
          label="Homologation routière"
          defaultValue={fitment?.roadApproval ?? 'UNKNOWN'}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[200px]"
        >
          {ROAD_APPROVALS.map((approval) => (
            <option key={approval} value={approval}>
              {ROAD_APPROVAL_LABELS[approval]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${prefix}-approvalMarket`}
          name="approvalMarket"
          label="Marché"
          defaultValue={fitment?.approvalMarket ?? 'FR'}
          fieldSize="sm"
          wrapperClassName="basis-[92px]"
          maxLength={2}
          pattern="[A-Za-z]{2}"
          hint="FR, DE…"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextField
          id={`${prefix}-restrictions`}
          name="restrictions"
          label="Restrictions de montage"
          defaultValue={fitment?.restrictions ?? ''}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[220px]"
          placeholder="Démontage du pare-chocs nécessaire"
        />
        <TextField
          id={`${prefix}-approvalNote`}
          name="approvalNote"
          label="Note d’homologation"
          defaultValue={fitment?.approvalNote ?? ''}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[220px]"
        />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Accessoires exigés                                                         */
/* -------------------------------------------------------------------------- */

function Accessoires({
  fitment,
  variants,
  dispatch,
}: {
  fitment: FitmentRow
  variants: VariantOption[]
  dispatch: Dispatch
}) {
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h5 className="text-[11px] font-bold">Accessoires exigés par ce montage</h5>
      <p className="mt-1 text-[10px] leading-[1.7] text-muted">
        Un accessoire « indispensable » est signalé au panier quand il manque, et compte dans le
        conditionnement conseillé. Un complément facultatif est seulement proposé.
      </p>

      {fitment.accessories.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-strong">Aucun accessoire exigé.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {fitment.accessories.map((accessoire) => (
            <li
              key={accessoire.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[7px] border border-[#e0e0e0] bg-white px-2.5 py-2 text-[11px]"
            >
              <span className="min-w-0 flex-1 font-medium">{accessoire.label}</span>
              <span className="text-muted">× {accessoire.quantity}</span>
              <Badge tone={accessoire.required ? 'warn' : 'neutral'}>
                {accessoire.required ? 'Indispensable' : 'Facultatif'}
              </Badge>
              {accessoire.note ? (
                <span className="basis-full text-[10px] text-muted">{accessoire.note}</span>
              ) : null}
              <form action={dispatch.action}>
                <Cible level="fitment" intent="accessory.remove" />
                <input type="hidden" name="accessoryId" value={accessoire.id} />
                <button type="submit" disabled={dispatch.pending} className={miniBouton}>
                  Retirer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={dispatch.action} className="mt-2 flex flex-wrap items-end gap-2">
        <Cible level="fitment" intent="accessory.add" />
        <input type="hidden" name="fitmentId" value={fitment.id} />
        <ChampReference
          id={`acc-variant-${fitment.id}`}
          variants={variants}
          label="Ajouter un accessoire"
        />
        <TextField
          id={`acc-qty-${fitment.id}`}
          name="quantity"
          label="Quantité"
          type="number"
          min={1}
          max={99}
          step={1}
          defaultValue={1}
          fieldSize="sm"
          wrapperClassName="basis-[92px]"
        />
        <SelectField
          id={`acc-required-${fitment.id}`}
          name="required"
          label="Nécessité"
          defaultValue="true"
          fieldSize="sm"
          wrapperClassName="min-w-0 basis-[150px]"
        >
          <option value="true">Indispensable</option>
          <option value="false">Facultatif</option>
        </SelectField>
        <TextField
          id={`acc-note-${fitment.id}`}
          name="note"
          label="Note"
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[160px]"
        />
        <button type="submit" disabled={dispatch.pending} className={miniBouton}>
          Ajouter
        </button>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Une compatibilité                                                          */
/* -------------------------------------------------------------------------- */

function BlocCompatibilite({
  fitment,
  variants,
  dispatch,
}: {
  fitment: FitmentRow
  variants: VariantOption[]
  dispatch: Dispatch
}) {
  return (
    <details className="rounded-[7px] border border-[#e0e0e0] bg-surface-soft">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-[12px]">
        <span className="font-semibold">{fitment.positionLabel}</span>
        <span className="min-w-0 flex-1 text-muted-strong">{fitment.variantLabel}</span>
        <FitmentBadge status={fitment.status} short />
        {fitment.draft ? <Badge tone="neutral">Brouillon</Badge> : null}
        {fitment.accessories.length > 0 ? (
          <Badge tone="neutral">
            {fitment.accessories.length} accessoire{fitment.accessories.length > 1 ? 's' : ''}
          </Badge>
        ) : null}
      </summary>

      <div className="border-t border-line px-3 py-3">
        <form action={dispatch.action}>
          <Cible level="fitment" intent="update" />
          <input type="hidden" name="fitmentId" value={fitment.id} />
          <ChampsCompatibilite fitment={fitment} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={dispatch.pending} className="text-[11px]">
              Enregistrer
            </Button>
            <Link
              href={`/p/${fitment.productSlug}`}
              className="text-[11px] font-semibold underline underline-offset-4"
            >
              Voir la fiche produit
            </Link>
          </div>
        </form>

        <Accessoires fitment={fitment} variants={variants} dispatch={dispatch} />

        <form action={dispatch.action} className="mt-3 border-t border-line pt-3">
          <Cible level="fitment" intent="delete" />
          <input type="hidden" name="fitmentId" value={fitment.id} />
          <button
            type="submit"
            disabled={dispatch.pending}
            className={`${miniBouton} border-danger text-danger hover:border-danger`}
          >
            Retirer cette compatibilité
          </button>
          <p className="mt-1 text-[10px] leading-[1.6] text-muted">
            Sans ligne, cette pièce redevient « à vérifier » sur ce véhicule : on ne perd pas une
            confirmation au profit d&apos;une affirmation contraire.
          </p>
        </form>
      </div>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/* Une configuration                                                          */
/* -------------------------------------------------------------------------- */

function BlocConfiguration({
  configuration,
  positions,
  variants,
  dispatch,
}: {
  configuration: ConfigurationRow
  positions: PositionOption[]
  variants: VariantOption[]
  dispatch: Dispatch
}) {
  const précisions = [
    configuration.trimName ? `finition ${configuration.trimName}` : null,
    configuration.headlampRef ? `bloc optique ${configuration.headlampRef}` : null,
    configuration.label,
  ].filter(Boolean)

  const blocageSuppression =
    configuration.fitments.length > 0
      ? `Porte ${configuration.fitments.length} compatibilité${configuration.fitments.length > 1 ? 's' : ''} : désactivez-la plutôt que de la supprimer.`
      : configuration.attachments > 0
        ? `Rattachée à ${configuration.attachments} véhicule enregistré, panier ou commande : désactivez-la plutôt que de la supprimer.`
        : null

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold">{configuration.equipmentLabel}</h3>
        {précisions.length > 0 ? (
          <span className="text-[11px] text-muted">{précisions.join(' · ')}</span>
        ) : null}
        {configuration.active ? null : <Badge tone="neutral">Inactive</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={dispatch.action}>
          <Cible level="configuration" intent="toggle" />
          <input type="hidden" name="configurationId" value={configuration.id} />
          <input type="hidden" name="active" value={configuration.active ? 'false' : 'true'} />
          <button type="submit" disabled={dispatch.pending} className={miniBouton}>
            {configuration.active ? 'Désactiver' : 'Activer'}
          </button>
        </form>

        {blocageSuppression ? (
          <p className="basis-full text-[10px] leading-[1.6] text-muted">{blocageSuppression}</p>
        ) : (
          <form action={dispatch.action}>
            <Cible level="configuration" intent="delete" />
            <input type="hidden" name="configurationId" value={configuration.id} />
            <button
              type="submit"
              disabled={dispatch.pending}
              className={`${miniBouton} border-danger text-danger hover:border-danger`}
            >
              Supprimer
            </button>
          </form>
        )}
      </div>

      <h4 className="mt-4 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-strong">
        Compatibilités
      </h4>

      {configuration.fitments.length === 0 ? (
        <p className="mt-2 text-[11px] text-warn">
          Aucune compatibilité : cette configuration n&apos;affiche aucune pièce côté client.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {configuration.fitments.map((fitment) => (
            <li key={fitment.id}>
              <BlocCompatibilite fitment={fitment} variants={variants} dispatch={dispatch} />
            </li>
          ))}
        </ul>
      )}

      <form
        action={dispatch.action}
        className="mt-3 rounded-[7px] border border-dashed border-[#c4c4c4] p-3"
      >
        <Cible level="fitment" intent="create" />
        <input type="hidden" name="configurationId" value={configuration.id} />
        <p className="text-[11px] font-bold">Ajouter une compatibilité</p>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <SelectField
            id={`new-fit-position-${configuration.id}`}
            name="positionId"
            label="Emplacement"
            fieldSize="sm"
            wrapperClassName="min-w-0 flex-1 basis-[180px]"
            required
          >
            <option value="">Choisir…</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.label}
              </option>
            ))}
          </SelectField>
          <ChampReference id={`new-fit-variant-${configuration.id}`} variants={variants} />
        </div>

        <div className="mt-2">
          <ChampsCompatibilite />
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={dispatch.pending}
          className="mt-3 text-[11px]"
        >
          Ajouter la compatibilité
        </Button>
      </form>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Écran                                                                      */
/* -------------------------------------------------------------------------- */

export function GenerationCompatibilities({
  generationId,
  configurations,
  equipments,
  positions,
  variants,
}: {
  generationId: string
  configurations: ConfigurationRow[]
  equipments: EquipmentOption[]
  positions: PositionOption[]
  variants: VariantOption[]
}) {
  const [state, action, pending] = useActionState<VehicleAdminState, FormData>(
    manageCompatibility,
    {},
  )
  const dispatch: Dispatch = { action, pending }

  return (
    <div className="flex flex-col gap-4">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="ok" live="polite">
          {state.notice}
        </Alert>
      ) : null}

      {configurations.map((configuration) => (
        <BlocConfiguration
          key={configuration.id}
          configuration={configuration}
          positions={positions}
          variants={variants}
          dispatch={dispatch}
        />
      ))}

      {/* Ajouter une configuration : l'étape sans laquelle rien ne s'attache. */}
      <Card className="p-4">
        <h3 className="text-[13px] font-bold">Ajouter une configuration</h3>
        <p className="mt-1 max-w-[640px] text-[11px] leading-[1.7] text-muted-strong">
          L&apos;équipement d&apos;origine est ce qui décide si une pièce se monte — jamais le
          culot seul. La finition et la référence de bloc optique ne se renseignent que
          lorsqu&apos;elles changent l&apos;équipement lumineux : sinon, elles multiplient les
          configurations sans rien distinguer.
        </p>

        {variants.length === 0 ? (
          <Alert tone="warn" className="mt-3">
            Aucune référence sélectionnable dans le catalogue : créez un produit et ses
            conditionnements avant de documenter des compatibilités.
          </Alert>
        ) : null}

        <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
          <Cible level="configuration" intent="create" />
          <input type="hidden" name="generationId" value={generationId} />

          <SelectField
            id="new-config-equipment"
            name="equipmentId"
            label="Équipement d’origine"
            fieldSize="sm"
            wrapperClassName="min-w-0 flex-1 basis-[220px]"
            required
          >
            <option value="">Choisir…</option>
            {equipments.map((equipment) => (
              <option key={equipment.id} value={equipment.id}>
                {equipment.label}
                {equipment.hint ? ` — ${equipment.hint}` : ''}
              </option>
            ))}
          </SelectField>

          <TextField
            id="new-config-trim"
            name="trimName"
            label="Finition"
            fieldSize="sm"
            wrapperClassName="min-w-0 basis-[160px]"
            placeholder="GTI"
            hint="Facultative"
          />
          <TextField
            id="new-config-headlamp"
            name="headlampRef"
            label="Bloc optique"
            fieldSize="sm"
            wrapperClassName="min-w-0 basis-[170px]"
            placeholder="Valeo 89010552"
            hint="Facultatif"
          />
          <TextField
            id="new-config-label"
            name="label"
            label="Libellé interne"
            fieldSize="sm"
            wrapperClassName="min-w-0 basis-[170px]"
            hint="Facultatif"
          />
          <Button type="submit" size="sm" disabled={pending} className="text-[11px]">
            Ajouter
          </Button>
        </form>
      </Card>
    </div>
  )
}
