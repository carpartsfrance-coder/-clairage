'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { manageVehicle, type VehicleAdminState } from '@/lib/actions/admin-vehicles'
import {
  VEHICLE_TYPE_LABELS,
  periodLabel,
  typePath,
  vehiclePackPath,
  type VehicleTypeValue,
} from '@/lib/admin/vehicles'
import { BrandMark } from '@/components/packs/BrandMark'
import { Alert, Card } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SelectField, TextField } from '@/components/ui/Field'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Saisie du référentiel véhicule : marques, modèles, générations.
 *
 * Trois partis pris d'interface, qui viennent des règles du projet :
 *
 * 1. **L'adresse publique est affichée partout, et son changement est une
 *    opération à part.** Renommer « Golf » ne déplace pas
 *    `/packs/auto/volkswagen/golf` ; le panneau « Changer l'adresse » le dit
 *    et réclame une confirmation, parce qu'aucune redirection n'existe dans ce
 *    projet pour rattraper les anciens liens.
 * 2. **« Supprimer » n'apparaît que lorsque la suppression est sans perte.**
 *    Dès qu'une ligne porte un enfant ou une compatibilité, le bouton laisse
 *    place à une phrase qui dit de désactiver — plutôt qu'un bouton qui
 *    refuserait après le clic.
 * 3. **Chaque ligne dit ce qui lui manque pour servir.** Une marque sans
 *    modèle actif n'est pas dans le menu, un modèle sans génération n'ouvre
 *    sur rien, une génération sans configuration ne porte aucune pièce : c'est
 *    écrit sur la ligne, à l'endroit où l'on peut y remédier.
 */

export type GenerationRow = {
  id: string
  slug: string
  name: string
  phase: string | null
  yearFrom: number
  yearTo: number | null
  active: boolean
  configurations: number
  activeConfigurations: number
  fitments: number
}

export type ModelRow = {
  id: string
  slug: string
  name: string
  active: boolean
  fitments: number
  generations: GenerationRow[]
}

export type MediaOption = {
  id: string
  /** Ce qui permet de reconnaître le visuel dans la liste. */
  label: string
}

export type MakeRow = {
  id: string
  slug: string
  name: string
  type: VehicleTypeValue
  position: number
  active: boolean
  fitments: number
  /** Logo rattaché, tel que le site public l'affiche. */
  logo: { id: string; url: string; alt: string } | null
  models: ModelRow[]
}

type Dispatch = {
  action: (formData: FormData) => void
  pending: boolean
}

/* -------------------------------------------------------------------------- */
/* Fragments partagés                                                         */
/* -------------------------------------------------------------------------- */

const ligneBoutons = 'flex flex-wrap items-end gap-2'
const miniBouton =
  'inline-flex min-h-9 items-center rounded-md border border-[#c7c9c0] px-3 text-[11px] font-semibold transition-colors hover:border-slate-ink disabled:opacity-50'

/** Les deux champs cachés que tout formulaire de cet écran porte. */
function Cible({ level, intent }: { level: 'make' | 'model' | 'generation'; intent: string }) {
  return (
    <>
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="intent" value={intent} />
    </>
  )
}

/**
 * Bouton d'activation.
 *
 * Le libellé dit l'effet (« Désactiver »), et la phrase d'aide dit la
 * conséquence côté client : une désactivation retire du site sans rien perdre,
 * ce qui n'est évident pour personne.
 */
function BoutonActivation({
  level,
  idName,
  id,
  active,
  dispatch,
}: {
  level: 'make' | 'model' | 'generation'
  idName: string
  id: string
  active: boolean
  dispatch: Dispatch
}) {
  return (
    <form action={dispatch.action}>
      <Cible level={level} intent="toggle" />
      <input type="hidden" name={idName} value={id} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <button type="submit" disabled={dispatch.pending} className={miniBouton}>
        {active ? 'Désactiver' : 'Activer'}
      </button>
    </form>
  )
}

/** Bouton de suppression, ou la raison pour laquelle il n'est pas là. */
function Suppression({
  level,
  idName,
  id,
  blocked,
  dispatch,
}: {
  level: 'make' | 'model' | 'generation'
  idName: string
  id: string
  /** Phrase expliquant le refus, ou `null` si la suppression est sans perte. */
  blocked: string | null
  dispatch: Dispatch
}) {
  if (blocked) {
    return <p className="basis-full text-[10px] leading-[1.6] text-muted">{blocked}</p>
  }
  return (
    <form action={dispatch.action}>
      <Cible level={level} intent="delete" />
      <input type="hidden" name={idName} value={id} />
      <button
        type="submit"
        disabled={dispatch.pending}
        className={`${miniBouton} border-danger text-danger hover:border-danger`}
      >
        Supprimer
      </button>
    </form>
  )
}

/**
 * Panneau de changement d'adresse publique.
 *
 * Replié par défaut : ce n'est pas une opération courante, et la mettre au
 * même rang que le renommage inviterait à la faire par mégarde. Le texte
 * annonce la conséquence exacte — les anciens liens ne répondront plus — et la
 * case à cocher est revérifiée côté serveur.
 */
function PanneauAdresse({
  level,
  id,
  slug,
  publicPath,
  portée,
  dispatch,
}: {
  level: 'make' | 'model' | 'generation'
  id: string
  slug: string
  /** Adresse publique actuelle, ou `null` si aucun parcours ne la sert. */
  publicPath: string | null
  /** Ce que le changement emporte avec lui (« et de ses 3 modèles »). */
  portée: string
  dispatch: Dispatch
}) {
  return (
    <details className="mt-2 rounded-[7px] border border-[#e2e3dc] bg-white">
      <summary className="flex min-h-9 cursor-pointer items-center px-3 py-2 text-[11px] font-semibold">
        Changer l&apos;adresse publique
      </summary>
      <form action={dispatch.action} className="border-t border-line px-3 py-3">
        <Cible level={level} intent="slug" />
        <input type="hidden" name="entityId" value={id} />

        <p className="text-[11px] leading-[1.7] text-muted-strong">
          L&apos;adresse actuelle est{' '}
          <code className="rounded bg-surface-soft px-1">{publicPath ?? slug}</code>. La changer
          rend introuvables les liens déjà partagés ou indexés{portée} : aucune redirection
          n&apos;est posée, ce projet n&apos;en tient pas.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <TextField
            id={`slug-${id}`}
            name="slug"
            label="Nouvelle adresse"
            defaultValue={slug}
            fieldSize="sm"
            wrapperClassName="min-w-0 flex-1 basis-[200px]"
            pattern="[a-z0-9-]+"
            hint="Minuscules, chiffres et traits d’union."
          />
          <button type="submit" disabled={dispatch.pending} className={miniBouton}>
            Changer l&apos;adresse
          </button>
        </div>

        <label className="mt-3 flex items-start gap-2 text-[11px] leading-[1.6]">
          <input
            type="checkbox"
            name="confirm"
            value="oui"
            className="mt-0.5 size-4 shrink-0 accent-[#31372c]"
          />
          <span>Je comprends que les liens vers l&apos;ancienne adresse ne répondront plus.</span>
        </label>
      </form>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/* Générations                                                                */
/* -------------------------------------------------------------------------- */

function LigneGeneration({
  generation,
  publicPath,
  dispatch,
}: {
  generation: GenerationRow
  publicPath: string | null
  dispatch: Dispatch
}) {
  const blocage =
    generation.fitments > 0
      ? `Porte ${generation.fitments} compatibilité${generation.fitments > 1 ? 's' : ''} : désactivez-la plutôt que de la supprimer, rien ne sera perdu.`
      : generation.configurations > 0
        ? `Contient ${generation.configurations} configuration${generation.configurations > 1 ? 's' : ''} : videz-la d'abord, ou désactivez-la.`
        : null

  return (
    <li className="rounded-[7px] border border-[#e2e3dc] bg-white p-3">
      <form action={dispatch.action} className="flex flex-wrap items-end gap-2">
        <Cible level="generation" intent="update" />
        <input type="hidden" name="generationId" value={generation.id} />

        <TextField
          id={`gen-name-${generation.id}`}
          name="name"
          label="Génération"
          defaultValue={generation.name}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[160px]"
          required
        />
        <TextField
          id={`gen-phase-${generation.id}`}
          name="phase"
          label="Phase"
          defaultValue={generation.phase ?? ''}
          fieldSize="sm"
          wrapperClassName="min-w-0 basis-[110px]"
          placeholder="Restylage"
        />
        <TextField
          id={`gen-from-${generation.id}`}
          name="yearFrom"
          label="De"
          type="number"
          inputMode="numeric"
          defaultValue={generation.yearFrom}
          fieldSize="sm"
          wrapperClassName="basis-[84px]"
          required
        />
        <TextField
          id={`gen-to-${generation.id}`}
          name="yearTo"
          label="À"
          type="number"
          inputMode="numeric"
          defaultValue={generation.yearTo ?? ''}
          fieldSize="sm"
          wrapperClassName="basis-[84px]"
          hint="Vide = en cours"
        />
        <button type="submit" disabled={dispatch.pending} className={miniBouton}>
          Enregistrer
        </button>
      </form>

      <p className="mt-2 text-[10px] text-muted">
        {periodLabel(generation.yearFrom, generation.yearTo)}
        {' · '}
        <code className="rounded bg-surface-soft px-1">{publicPath ?? generation.slug}</code>
      </p>

      {/*
        La configuration est ce qui rend une génération utilisable : sans
        équipement d'origine rattaché, sa page publique n'affiche aucune pièce.
        On le dit ici, avec le lien pour y remédier.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <Link
          href={`/admin/vehicules/${generation.id}`}
          className="font-semibold underline underline-offset-4"
        >
          Configurations et compatibilités
        </Link>
        {generation.configurations === 0 ? (
          <span className="text-warn">
            aucune configuration — aucune pièce ne peut s&apos;y rattacher
          </span>
        ) : (
          <span className="text-muted">
            {generation.activeConfigurations} configuration
            {generation.activeConfigurations > 1 ? 's' : ''} active
            {generation.activeConfigurations > 1 ? 's' : ''} sur {generation.configurations}
            {' · '}
            {generation.fitments} compatibilité{generation.fitments > 1 ? 's' : ''}
          </span>
        )}
        {generation.active ? null : <Badge tone="neutral">Inactive</Badge>}
      </div>

      <div className={`${ligneBoutons} mt-2`}>
        <BoutonActivation
          level="generation"
          idName="generationId"
          id={generation.id}
          active={generation.active}
          dispatch={dispatch}
        />
        <Suppression
          level="generation"
          idName="generationId"
          id={generation.id}
          blocked={blocage}
          dispatch={dispatch}
        />
      </div>

      <PanneauAdresse
        level="generation"
        id={generation.id}
        slug={generation.slug}
        publicPath={publicPath}
        portée=""
        dispatch={dispatch}
      />
    </li>
  )
}

function FormulaireGeneration({ modelId, dispatch }: { modelId: string; dispatch: Dispatch }) {
  return (
    <form
      action={dispatch.action}
      className="mt-2 rounded-[7px] border border-dashed border-[#c7c9c0] p-3"
    >
      <Cible level="generation" intent="create" />
      <input type="hidden" name="modelId" value={modelId} />

      <p className="text-[11px] font-bold">Ajouter une génération</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextField
          id={`new-gen-name-${modelId}`}
          name="name"
          label="Nom"
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[160px]"
          placeholder="Golf VIII"
          required
        />
        <TextField
          id={`new-gen-phase-${modelId}`}
          name="phase"
          label="Phase"
          fieldSize="sm"
          wrapperClassName="min-w-0 basis-[110px]"
          placeholder="Phase 1"
        />
        <TextField
          id={`new-gen-from-${modelId}`}
          name="yearFrom"
          label="De"
          type="number"
          inputMode="numeric"
          fieldSize="sm"
          wrapperClassName="basis-[84px]"
          required
        />
        <TextField
          id={`new-gen-to-${modelId}`}
          name="yearTo"
          label="À"
          type="number"
          inputMode="numeric"
          fieldSize="sm"
          wrapperClassName="basis-[84px]"
          hint="Vide = en cours"
        />
        <TextField
          id={`new-gen-slug-${modelId}`}
          name="slug"
          label="Adresse"
          fieldSize="sm"
          wrapperClassName="min-w-0 basis-[140px]"
          hint="Vide = tirée du nom"
          pattern="[a-z0-9-]*"
        />
        <Button type="submit" size="sm" disabled={dispatch.pending} className="text-[11px]">
          Ajouter
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Modèles                                                                    */
/* -------------------------------------------------------------------------- */

function BlocModele({
  model,
  makePath,
  dispatch,
}: {
  model: ModelRow
  /** Adresse publique de la marque, ou `null` si elle n'est servie nulle part. */
  makePath: string | null
  dispatch: Dispatch
}) {
  const modelPath = makePath ? `${makePath}/${model.slug}` : null
  const blocage =
    model.fitments > 0
      ? `Porte ${model.fitments} compatibilité${model.fitments > 1 ? 's' : ''} : désactivez-le plutôt que de le supprimer, rien ne sera perdu.`
      : model.generations.length > 0
        ? `Contient ${model.generations.length} génération${model.generations.length > 1 ? 's' : ''} : videz-le d'abord, ou désactivez-le.`
        : null

  return (
    <li className="rounded-[9px] border border-[#e2e3dc] bg-surface-soft p-3">
      <form action={dispatch.action} className="flex flex-wrap items-end gap-2">
        <Cible level="model" intent="update" />
        <input type="hidden" name="modelId" value={model.id} />
        <TextField
          id={`model-name-${model.id}`}
          name="name"
          label="Modèle"
          defaultValue={model.name}
          fieldSize="sm"
          wrapperClassName="min-w-0 flex-1 basis-[180px]"
          required
        />
        <button type="submit" disabled={dispatch.pending} className={miniBouton}>
          Enregistrer
        </button>
      </form>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
        <code className="rounded bg-white px-1">{modelPath ?? model.slug}</code>
        {model.active ? null : <Badge tone="neutral">Inactif</Badge>}
      </p>

      <div className={`${ligneBoutons} mt-2`}>
        <BoutonActivation
          level="model"
          idName="modelId"
          id={model.id}
          active={model.active}
          dispatch={dispatch}
        />
        <Suppression
          level="model"
          idName="modelId"
          id={model.id}
          blocked={blocage}
          dispatch={dispatch}
        />
      </div>

      <PanneauAdresse
        level="model"
        id={model.id}
        slug={model.slug}
        publicPath={modelPath}
        portée={
          model.generations.length > 0
            ? ` et de ses ${model.generations.length} génération${model.generations.length > 1 ? 's' : ''}`
            : ''
        }
        dispatch={dispatch}
      />

      {model.generations.length === 0 ? (
        <p className="mt-3 text-[11px] text-warn">
          Aucune génération : ce modèle n&apos;apparaît pas dans le parcours véhicule.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {model.generations.map((generation) => (
            <LigneGeneration
              key={generation.id}
              generation={generation}
              publicPath={modelPath ? `${modelPath}/${generation.slug}` : null}
              dispatch={dispatch}
            />
          ))}
        </ul>
      )}

      <FormulaireGeneration modelId={model.id} dispatch={dispatch} />
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Marques                                                                    */
/* -------------------------------------------------------------------------- */

function ChampType({
  id,
  defaultValue,
  includeBoth,
}: {
  id: string
  defaultValue: VehicleTypeValue
  /** `BOTH` n'est proposé que s'il est déjà la valeur enregistrée. */
  includeBoth: boolean
}) {
  return (
    <SelectField
      id={id}
      name="type"
      label="Type"
      defaultValue={defaultValue}
      fieldSize="sm"
      wrapperClassName="min-w-0 basis-[140px]"
    >
      <option value="CAR">{VEHICLE_TYPE_LABELS.CAR}</option>
      <option value="MOTORCYCLE">{VEHICLE_TYPE_LABELS.MOTORCYCLE}</option>
      {includeBoth ? <option value="BOTH">{VEHICLE_TYPE_LABELS.BOTH}</option> : null}
    </SelectField>
  )
}

/**
 * Choix du logo d'une marque, parmi les médias déjà déposés.
 *
 * Pas de téléversement ici : les médias se gèrent dans `/admin/medias`, et
 * dupliquer ce dépôt donnerait deux chemins à maintenir pour un seul geste.
 * « Aucun » est une option de plein droit — un logo de constructeur est une
 * marque déposée, que l'exploitant n'a pas forcément le droit d'afficher.
 */
function ChampLogo({
  id,
  medias,
  defaultValue,
}: {
  id: string
  medias: MediaOption[]
  defaultValue?: string | null
}) {
  return (
    <SelectField
      id={id}
      name="logoMediaId"
      label="Logo"
      defaultValue={defaultValue ?? ''}
      fieldSize="sm"
      wrapperClassName="min-w-0 basis-[190px]"
      hint={medias.length === 0 ? 'Aucun visuel déposé' : 'Déposé dans Médias'}
      disabled={medias.length === 0}
    >
      <option value="">Aucun — monogramme</option>
      {medias.map((media) => (
        <option key={media.id} value={media.id}>
          {media.label}
        </option>
      ))}
    </SelectField>
  )
}

function BlocMarque({
  make,
  medias,
  dispatch,
}: {
  make: MakeRow
  medias: MediaOption[]
  dispatch: Dispatch
}) {
  const chemin = typePath(make.type)
  const makePath = chemin ? vehiclePackPath(chemin, make.slug) : null
  const modelesActifs = make.models.filter((model) => model.active).length
  const blocage =
    make.fitments > 0
      ? `Porte ${make.fitments} compatibilité${make.fitments > 1 ? 's' : ''} : désactivez-la plutôt que de la supprimer, rien ne sera perdu.`
      : make.models.length > 0
        ? `Contient ${make.models.length} modèle${make.models.length > 1 ? 's' : ''} : videz-la d'abord, ou désactivez-la.`
        : null

  return (
    <details className="border-b border-line last:border-b-0" open={false}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] hover:bg-surface-soft">
        {/*
          La pastille publique elle-même, monogramme de repli compris : ce que
          l'administrateur voit ici est exactement ce que le menu affichera.
        */}
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
        {make.active && modelesActifs === 0 ? <Badge tone="warn">Hors menu</Badge> : null}
      </summary>

      <div className="border-t border-line bg-surface-soft px-3 py-3">
        {/*
          Pourquoi cette marque n'est pas dans le menu, dit à l'endroit où on
          peut agir. La règle est celle de `lib/queries/navigation.ts` : une
          marque n'est listée qu'active et dotée d'au moins un modèle actif.
        */}
        {make.type === 'BOTH' ? (
          <Alert tone="warn" className="mb-3">
            Le type « voiture et moto » n&apos;est listé par aucun des deux parcours publics :
            cette marque n&apos;apparaît ni dans /packs/auto, ni dans /packs/moto. Choisissez
            voiture ou moto pour la rendre visible.
          </Alert>
        ) : make.active && modelesActifs === 0 ? (
          <Alert tone="warn" className="mb-3">
            Pas de modèle actif : cette marque n&apos;apparaît pas dans le menu ni dans{' '}
            {makePath ? <code>/packs/{chemin}</code> : 'le parcours véhicule'}.
          </Alert>
        ) : null}

        <form action={dispatch.action} className="flex flex-wrap items-end gap-2">
          <Cible level="make" intent="update" />
          <input type="hidden" name="makeId" value={make.id} />
          <TextField
            id={`make-name-${make.id}`}
            name="name"
            label="Marque"
            defaultValue={make.name}
            fieldSize="sm"
            wrapperClassName="min-w-0 flex-1 basis-[180px]"
            required
          />
          <ChampType
            id={`make-type-${make.id}`}
            defaultValue={make.type}
            includeBoth={make.type === 'BOTH'}
          />
          <ChampLogo
            id={`make-logo-${make.id}`}
            medias={medias}
            defaultValue={make.logo?.id ?? null}
          />
          <TextField
            id={`make-position-${make.id}`}
            name="position"
            label="Position"
            type="number"
            min={0}
            step={1}
            defaultValue={make.position}
            fieldSize="sm"
            wrapperClassName="basis-[92px]"
            hint="Ordre du menu"
          />
          <button type="submit" disabled={dispatch.pending} className={miniBouton}>
            Enregistrer
          </button>
        </form>

        <p className="mt-2 text-[10px] text-muted">
          <code className="rounded bg-white px-1">{makePath ?? make.slug}</code>
        </p>

        <div className={`${ligneBoutons} mt-2`}>
          <BoutonActivation
            level="make"
            idName="makeId"
            id={make.id}
            active={make.active}
            dispatch={dispatch}
          />
          <Suppression
            level="make"
            idName="makeId"
            id={make.id}
            blocked={blocage}
            dispatch={dispatch}
          />
        </div>

        <PanneauAdresse
          level="make"
          id={make.id}
          slug={make.slug}
          publicPath={makePath}
          portée={
            make.models.length > 0
              ? ` et de ses ${make.models.length} modèle${make.models.length > 1 ? 's' : ''}`
              : ''
          }
          dispatch={dispatch}
        />

        <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-strong">
          Modèles
        </h3>

        {make.models.length === 0 ? (
          <p className="mt-2 text-[11px] text-warn">
            Aucun modèle : cette marque ne mène à rien côté client.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {make.models.map((model) => (
              <BlocModele key={model.id} model={model} makePath={makePath} dispatch={dispatch} />
            ))}
          </ul>
        )}

        <form
          action={dispatch.action}
          className="mt-3 rounded-[7px] border border-dashed border-[#c7c9c0] p-3"
        >
          <Cible level="model" intent="create" />
          <input type="hidden" name="makeId" value={make.id} />
          <p className="text-[11px] font-bold">Ajouter un modèle</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <TextField
              id={`new-model-name-${make.id}`}
              name="name"
              label="Nom"
              fieldSize="sm"
              wrapperClassName="min-w-0 flex-1 basis-[180px]"
              placeholder="Golf"
              required
            />
            <TextField
              id={`new-model-slug-${make.id}`}
              name="slug"
              label="Adresse"
              fieldSize="sm"
              wrapperClassName="min-w-0 basis-[160px]"
              hint="Vide = tirée du nom"
              pattern="[a-z0-9-]*"
            />
            <Button type="submit" size="sm" disabled={dispatch.pending} className="text-[11px]">
              Ajouter
            </Button>
          </div>
        </form>
      </div>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/* Écran                                                                      */
/* -------------------------------------------------------------------------- */

export function VehicleTree({
  makes,
  medias,
}: {
  makes: MakeRow[]
  medias: MediaOption[]
}) {
  const [state, action, pending] = useActionState<VehicleAdminState, FormData>(manageVehicle, {})
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

      {/* Création de marque : l'entrée du parcours, donc en premier. */}
      <Card className="p-4">
        <h2 className="text-[13px] font-bold">Ajouter une marque</h2>
        <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
          <Cible level="make" intent="create" />
          <TextField
            id="new-make-name"
            name="name"
            label="Nom"
            fieldSize="sm"
            wrapperClassName="min-w-0 flex-1 basis-[180px]"
            placeholder="Yamaha"
            required
          />
          <ChampType id="new-make-type" defaultValue="CAR" includeBoth={false} />
          <ChampLogo id="new-make-logo" medias={medias} />
          <TextField
            id="new-make-slug"
            name="slug"
            label="Adresse"
            fieldSize="sm"
            wrapperClassName="min-w-0 basis-[160px]"
            hint="Vide = tirée du nom"
            pattern="[a-z0-9-]*"
          />
          <Button type="submit" size="sm" disabled={pending} className="text-[11px]">
            Créer la marque
          </Button>
        </form>
        <p className="mt-2 text-[10px] leading-[1.7] text-muted">
          Le type décide du parcours qui la listera : <code>/packs/auto</code> ou{' '}
          <code>/packs/moto</code>. L&apos;adresse entre dans les URL publiques et ne change plus
          d&apos;elle-même ensuite : <code>/packs/moto/yamaha</code>. Le logo se choisit parmi
          les visuels déposés dans{' '}
          <Link href="/admin/medias" className="font-semibold underline underline-offset-4">
            Médias
          </Link>{' '}
          ; sans lui, le menu affiche le monogramme de la marque.
        </p>
      </Card>

      {makes.length === 0 ? null : (
        <Card className="overflow-hidden p-0">
          {makes.map((make) => (
            <BlocMarque key={make.id} make={make} medias={medias} dispatch={dispatch} />
          ))}
        </Card>
      )}
    </div>
  )
}
