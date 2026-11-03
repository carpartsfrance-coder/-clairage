'use client'

import { useActionState } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPencil, IconPlus } from '@/components/ui/icons'
import { texteSaisi, type Saisie } from '@/lib/admin/catalogue'
import {
  FITMENT_STATUSES,
  FITMENT_STATUS_LABELS,
  ROAD_APPROVALS,
  ROAD_APPROVAL_LABELS,
  type FitmentStatusValue,
  type RoadApprovalValue,
} from '@/lib/admin/vehicles'
import { noteConfigurationInactive } from '@/lib/admin/produit-liens'
import {
  createProductFitment,
  removeProductFitment,
  updateProductFitment,
} from '@/lib/actions/admin-product-links'
import { ETAT_VIDE, Retour, ZoneTexte } from './ContentFields'
import { RechercheLien, ReponseRecherche } from './LinkSearch'

/**
 * Les compatibilités véhicule d'une référence, éditées depuis la fiche produit.
 *
 * Elles s'écrivaient déjà — mais seulement depuis l'écran Véhicules, qui
 * travaille génération par génération. C'est le bon sens de travail quand on
 * documente un véhicule ; c'est le mauvais quand on vient d'ajouter une
 * référence qui équipe quarante véhicules, et qu'il faut ouvrir quarante
 * écrans pour le dire.
 *
 * Le point d'entrée change, les règles non : `parseFitment` est partagé avec
 * l'écran Véhicules. Un statut « confirmé » exige donc ici aussi sa source et
 * sa date, et rien n'écrit de date de vérification à la place de
 * l'exploitant — une compatibilité datée d'office serait une vérification
 * inventée.
 *
 * Trois choses que l'écran dit et qui ne se devinent pas :
 *
 * - **Le véhicule et l'emplacement ne se modifient pas.** La table a une
 *   contrainte d'unicité sur le triplet véhicule-emplacement-référence : en
 *   changer un fait une autre ligne. Pour déplacer une compatibilité, on la
 *   retire et on la redocumente, ce qui laisse deux traces au journal au lieu
 *   d'une modification qui aurait l'air d'une correction de détail.
 * - **Retirer n'est pas « incompatible ».** L'absence de ligne vaut « à
 *   vérifier » côté lecture, jamais incompatible : le schéma le dit dès son
 *   en-tête. Déclarer une incompatibilité se fait par le statut.
 * - **Une configuration désactivée accepte la ligne mais ne la montre pas** :
 *   le parcours véhicule filtre les configurations sur `active`.
 */

const TONS_STATUT: Record<FitmentStatusValue, BadgeTone> = {
  CONFIRMED: 'ok',
  UNKNOWN: 'warn',
  INCOMPATIBLE: 'danger',
}

export type CompatibiliteFiche = {
  id: string
  vehicule: string
  equipement: string
  emplacement: string
  statut: FitmentStatusValue
  quantite: number
  restrictions: string | null
  homologation: RoadApprovalValue
  marche: string
  noteHomologation: string | null
  source: string | null
  /** Date au format du champ `date` (AAAA-MM-JJ), vide si rien n'est vérifié. */
  verifieLe: string
  verifieLeAffiche: string | null
  configurationActive: boolean
  accessoires: number
}

export type ConditionnementCompatible = {
  id: string
  sku: string
  name: string
  compatibilites: CompatibiliteFiche[]
}

export type ConfigurationCandidate = {
  id: string
  vehicule: string
  equipement: string
  active: boolean
}

export type EmplacementOption = { id: string; label: string }

/**
 * Les champs d'une compatibilité, les mêmes à la création et à la modification.
 *
 * Les deux listes déroulantes portent une `key` dérivée de leur valeur :
 * `defaultValue` n'est appliqué à un `<select>` qu'au montage, et React 19
 * réinitialise le formulaire dès que l'action se termine — sans cette clé, un
 * statut enregistré réafficherait l'ancien.
 */
function ChampsCompatibilite({
  cle,
  valeurs,
  saisie,
}: {
  cle: string
  valeurs: {
    statut: FitmentStatusValue
    quantite: string
    restrictions: string
    homologation: RoadApprovalValue
    marche: string
    noteHomologation: string
    source: string
    verifieLe: string
  }
  saisie: Saisie | undefined
}) {
  const statut = texteSaisi(saisie, 'status', valeurs.statut)
  const homologation = texteSaisi(saisie, 'roadApproval', valeurs.homologation)

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField
          key={`status-${cle}-${statut}`}
          id={`status-${cle}`}
          name="status"
          label="Statut"
          hint="« Confirmée » demande une source et une date."
          fieldSize="sm"
          defaultValue={statut}
        >
          {FITMENT_STATUSES.map((valeur) => (
            <option key={valeur} value={valeur}>
              {FITMENT_STATUS_LABELS[valeur]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`quantity-${cle}`}
          name="quantity"
          label="Quantité pour l’emplacement"
          hint="Deux ampoules pour deux phares."
          fieldSize="sm"
          inputMode="numeric"
          defaultValue={texteSaisi(saisie, 'quantity', valeurs.quantite)}
        />
        <SelectField
          key={`approval-${cle}-${homologation}`}
          id={`roadApproval-${cle}`}
          name="roadApproval"
          label="Homologation route"
          hint="Indépendante de la compatibilité de montage."
          fieldSize="sm"
          defaultValue={homologation}
        >
          {ROAD_APPROVALS.map((valeur) => (
            <option key={valeur} value={valeur}>
              {ROAD_APPROVAL_LABELS[valeur]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`approvalMarket-${cle}`}
          name="approvalMarket"
          label="Marché d’homologation"
          hint="Deux lettres : FR, DE, EU…"
          fieldSize="sm"
          className="uppercase"
          maxLength={2}
          defaultValue={texteSaisi(saisie, 'approvalMarket', valeurs.marche)}
        />
        <TextField
          id={`source-${cle}`}
          name="source"
          label="Source"
          hint="D’où vient l’information : catalogue fournisseur, essai, notice."
          fieldSize="sm"
          defaultValue={texteSaisi(saisie, 'source', valeurs.source)}
          placeholder="Catalogue Valeo 2026"
        />
        <TextField
          id={`verifiedAt-${cle}`}
          name="verifiedAt"
          label="Vérifié le"
          hint="Rien n’est inscrit à votre place : sans date, personne n’a vérifié."
          fieldSize="sm"
          type="date"
          defaultValue={texteSaisi(saisie, 'verifiedAt', valeurs.verifieLe)}
        />
      </div>
      <ZoneTexte
        id={`restrictions-${cle}`}
        name="restrictions"
        label="Restrictions de montage"
        hint="Ce qu’il faut démonter, le cache à retirer, l’outil nécessaire."
        rows={2}
        defaultValue={texteSaisi(saisie, 'restrictions', valeurs.restrictions)}
        wrapperClassName="mt-3"
      />
      <TextField
        id={`approvalNote-${cle}`}
        name="approvalNote"
        label="Note d’homologation"
        hint="Précision affichée avec l’homologation : usage piste, marquage E…"
        fieldSize="sm"
        defaultValue={texteSaisi(saisie, 'approvalNote', valeurs.noteHomologation)}
        wrapperClassName="mt-3"
      />
    </>
  )
}

function LigneCompatibilite({ compatibilite }: { compatibilite: CompatibiliteFiche }) {
  const [edition, actionEdition, editionPending] = useActionState(updateProductFitment, ETAT_VIDE)
  const [retrait, actionRetrait, retraitPending] = useActionState(removeProductFitment, ETAT_VIDE)
  const inactive = noteConfigurationInactive({ active: compatibilite.configurationActive })

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">
            {compatibilite.vehicule}
            <span className="ml-2 text-xs font-normal text-muted-strong">
              {compatibilite.emplacement}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-strong">{compatibilite.equipement}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-strong">
            <Badge tone={TONS_STATUT[compatibilite.statut]}>
              {FITMENT_STATUS_LABELS[compatibilite.statut]}
            </Badge>
            <span className="tabular-nums">{compatibilite.quantite} par emplacement</span>
            <span>
              {ROAD_APPROVAL_LABELS[compatibilite.homologation]} ({compatibilite.marche})
            </span>
            {compatibilite.source ? <span>Source : {compatibilite.source}</span> : null}
            {compatibilite.verifieLeAffiche ? (
              <span>Vérifié le {compatibilite.verifieLeAffiche}</span>
            ) : null}
          </p>
          {compatibilite.restrictions ? (
            <p className="mt-1 text-xs whitespace-pre-wrap text-muted-strong">
              {compatibilite.restrictions}
            </p>
          ) : null}
          {inactive ? <p className="mt-1 text-xs text-muted-strong">{inactive}</p> : null}
        </div>
      </div>

      <details className="mt-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
          <IconPencil className="size-3.5 shrink-0" />
          Modifier
        </summary>

        <form action={actionEdition} className="mt-2 border-t border-line pt-3">
          <input type="hidden" name="fitmentId" value={compatibilite.id} />
          {/*
            Le véhicule et l'emplacement ne sont pas dans ce formulaire : les
            changer ferait une autre ligne, et la contrainte d'unicité porte
            sur le triplet.
          */}
          <ChampsCompatibilite
            cle={compatibilite.id}
            valeurs={{
              statut: compatibilite.statut,
              quantite: String(compatibilite.quantite),
              restrictions: compatibilite.restrictions ?? '',
              homologation: compatibilite.homologation,
              marche: compatibilite.marche,
              noteHomologation: compatibilite.noteHomologation ?? '',
              source: compatibilite.source ?? '',
              verifieLe: compatibilite.verifieLe,
            }}
            saisie={edition.saisie}
          />
          <Button type="submit" size="sm" className="mt-3" disabled={editionPending}>
            {editionPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Retour state={edition} />
        </form>

        <form action={actionRetrait} className="mt-3 border-t border-line pt-3">
          <input type="hidden" name="fitmentId" value={compatibilite.id} />
          <p className="max-w-[70ch] text-xs text-muted-strong">
            Retirer la ligne n’est pas déclarer une incompatibilité : sans ligne, ce véhicule
            redevient «&nbsp;à vérifier&nbsp;» pour cette référence, et la source comme la date de
            vérification sont perdues. Pour dire qu’elle ne va pas, passez le statut à
            «&nbsp;Incompatible&nbsp;».
            {compatibilite.accessoires > 0
              ? ` Les ${compatibilite.accessoires} accessoires de montage rattachés partiront avec elle.`
              : ''}
          </p>
          <Button type="submit" size="sm" variant="ghost" disabled={retraitPending}>
            <span className="flex items-center gap-1.5 text-danger">
              <IconClose className="size-4 shrink-0" />
              {retraitPending ? 'Retrait…' : 'Retirer cette compatibilité'}
            </span>
          </Button>
          {retrait.error ? (
            <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
              {retrait.error}
            </p>
          ) : null}
        </form>
      </details>
    </li>
  )
}

function AjoutCompatibilite({
  conditionnement,
  emplacements,
  terme,
  candidates,
}: {
  conditionnement: ConditionnementCompatible
  emplacements: EmplacementOption[]
  terme: string
  candidates: ConfigurationCandidate[]
}) {
  const [state, action, pending] = useActionState(createProductFitment, ETAT_VIDE)
  const choisie = texteSaisi(state.saisie, 'configurationId', '')
  const emplacementChoisi = texteSaisi(state.saisie, 'positionId', '')

  return (
    <div className="mt-3 rounded-md border border-line p-3">
      <h5 className="flex items-center gap-1.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Documenter une compatibilité
      </h5>
      <RechercheLien
        nomChamp="vehicule"
        terme={terme}
        label="Chercher un véhicule"
        placeholder="Peugeot 208, Golf VII, Valeo 89010552…"
        hint="Par marque, modèle, génération, équipement ou référence de bloc optique."
        champsCaches={{ onglet: 'compat', compat: conditionnement.id }}
      />

      <ReponseRecherche
        terme={terme}
        nombre={candidates.length}
        invitation="Cherchez le véhicule que cette référence équipe. Chaque mot doit se retrouver : « peugeot 208 » fonctionne."
        aucunResultat="Le véhicule doit exister dans le référentiel : il se crée depuis l’écran Véhicules."
      />

      {candidates.length > 0 ? (
        <form action={action} className="mt-3">
          <input type="hidden" name="variantId" value={conditionnement.id} />

          {/*
            Le véhicule et l'emplacement sont réaffichés depuis la saisie
            refusée : React 19 réinitialise le formulaire dès que l'action se
            termine, et sans cela un refus — « confirmée » sans source, par
            exemple — obligerait à retrouver le véhicule dans la liste de dix
            qu'on vient de parcourir.
          */}
          <fieldset>
            <legend className="text-[11px] font-bold">Configuration véhicule</legend>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {candidates.map((candidate) => {
                const inactive = noteConfigurationInactive({ active: candidate.active })
                return (
                  <li key={candidate.id}>
                    <label className="flex min-h-9 items-start gap-2 rounded-md border border-line bg-surface-soft px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="configurationId"
                        value={candidate.id}
                        defaultChecked={choisie === candidate.id}
                        className="mt-0.5 size-4 shrink-0"
                        required
                      />
                      <span className="min-w-0">
                        {candidate.vehicule}
                        <span className="mt-0.5 block text-xs text-muted-strong">
                          {candidate.equipement}
                        </span>
                        {inactive ? (
                          <span className="mt-0.5 block text-xs text-muted-strong">
                            {inactive}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>

          <SelectField
            key={`positionId-${conditionnement.id}-${emplacementChoisi}`}
            id={`positionId-${conditionnement.id}`}
            name="positionId"
            label="Emplacement lumineux"
            hint="La compatibilité porte sur un emplacement précis, pas sur le véhicule entier."
            fieldSize="sm"
            defaultValue={emplacementChoisi}
            wrapperClassName="mt-3"
            required
          >
            <option value="" disabled>
              Choisir un emplacement
            </option>
            {emplacements.map((emplacement) => (
              <option key={emplacement.id} value={emplacement.id}>
                {emplacement.label}
              </option>
            ))}
          </SelectField>

          <div className="mt-3 border-t border-line pt-3">
            <ChampsCompatibilite
              cle={`nouveau-${conditionnement.id}`}
              valeurs={{
                statut: 'UNKNOWN',
                quantite: '1',
                restrictions: '',
                homologation: 'UNKNOWN',
                marche: 'FR',
                noteHomologation: '',
                source: '',
                verifieLe: '',
              }}
              saisie={state.saisie}
            />
          </div>

          <Button type="submit" className="mt-3" size="sm" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer la compatibilité'}
          </Button>
          <Retour state={state} />
        </form>
      ) : (
        <Retour state={state} />
      )}
    </div>
  )
}

function BlocCompatibilites({
  conditionnement,
  emplacements,
  terme,
  candidates,
  mayEdit,
}: {
  conditionnement: ConditionnementCompatible
  emplacements: EmplacementOption[]
  terme: string
  candidates: ConfigurationCandidate[]
  mayEdit: boolean
}) {
  return (
    <div className="rounded-md border border-line bg-surface-soft p-3">
      <h4 className="text-sm font-semibold">
        {conditionnement.name}{' '}
        <span className="font-mono text-xs text-muted">{conditionnement.sku}</span>
      </h4>

      {conditionnement.compatibilites.length === 0 ? (
        <p className="mt-1 text-xs text-muted-strong">
          Aucune compatibilité documentée : le parcours véhicule ne proposera jamais cette
          référence, et la fiche la donne pour «&nbsp;à vérifier&nbsp;».
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {conditionnement.compatibilites.map((compatibilite) => (
            <LigneCompatibilite key={compatibilite.id} compatibilite={compatibilite} />
          ))}
        </ul>
      )}

      {mayEdit ? (
        <AjoutCompatibilite
          conditionnement={conditionnement}
          emplacements={emplacements}
          terme={terme}
          candidates={candidates}
        />
      ) : null}
    </div>
  )
}

export function ProductFitmentsManager({
  conditionnements,
  emplacements,
  compatCible,
  terme,
  candidates,
  mayEdit,
}: {
  conditionnements: ConditionnementCompatible[]
  emplacements: EmplacementOption[]
  /** Le conditionnement pour lequel on cherche un véhicule, d'après l'adresse. */
  compatCible: string | null
  terme: string
  candidates: ConfigurationCandidate[]
  mayEdit: boolean
}) {
  if (conditionnements.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-strong">
        Aucun conditionnement : il n’y a donc aucune compatibilité à documenter.
      </p>
    )
  }

  if (emplacements.length === 0 && mayEdit) {
    return (
      <Alert tone="warn" title="Aucun emplacement lumineux" className="mt-2">
        Une compatibilité porte sur un emplacement (feu de croisement, de route, antibrouillard).
        Le référentiel n’en contient aucun : il vient du jeu de données.
      </Alert>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {conditionnements.map((conditionnement) => (
        <BlocCompatibilites
          key={conditionnement.id}
          conditionnement={conditionnement}
          emplacements={emplacements}
          terme={compatCible === conditionnement.id ? terme : ''}
          candidates={compatCible === conditionnement.id ? candidates : []}
          mayEdit={mayEdit}
        />
      ))}
    </div>
  )
}
