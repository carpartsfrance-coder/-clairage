'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPencil, IconPlus } from '@/components/ui/icons'
import { texteSaisi } from '@/lib/admin/catalogue'
import { SPEC_LABEL_MAX, SPEC_VALUE_MAX, SPECS_MAX } from '@/lib/admin/produit-contenu'
import {
  createProductSpec,
  moveProductSpec,
  removeProductSpec,
  updateProductSpec,
} from '@/lib/actions/admin-product-content'
import { ETAT_VIDE, FlechesOrdre, Retour } from './ContentFields'

/**
 * Les caractéristiques d'une fiche produit.
 *
 * La section était un tableau en lecture seule, et le relevé des manques
 * reprochait précisément son absence : « la section caractéristiques ne
 * s'affiche pas : culot, teinte et tension manquent ». Il montrait le trou
 * sans donner le moyen de le boucher.
 *
 * Deux choses que l'écran rend visibles, parce que ce sont elles qui se
 * perdent :
 *
 * - **L'ordre est celui que le client lira.** La fiche affiche les lignes dans
 *   cet ordre, les premières sous ses yeux. D'où les flèches, et la
 *   renumérotation côté serveur après chaque changement.
 * - **Un libellé ne se répète pas.** Deux lignes « Culot » avec deux valeurs
 *   différentes sont une contradiction affichée au client ; le serveur refuse,
 *   en nommant la ligne qui existe déjà.
 *
 * Le groupe (`ProductSpec.group`) n'est pas proposé : la fiche publique affiche
 * toutes les lignes dans une seule grille sans regarder ce champ, et offrir un
 * réglage sans effet est pire que ne rien offrir.
 */

export type SpecFiche = { id: string; label: string; value: string }

function LigneSpec({
  spec,
  premier,
  dernier,
}: {
  spec: SpecFiche
  premier: boolean
  dernier: boolean
}) {
  const [edition, actionEdition, editionPending] = useActionState(updateProductSpec, ETAT_VIDE)
  const [retrait, actionRetrait, retraitPending] = useActionState(removeProductSpec, ETAT_VIDE)

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-strong">{spec.label}</p>
          <p className="text-sm break-words">{spec.value}</p>
        </div>
        <FlechesOrdre
          action={moveProductSpec}
          nomChamp="specId"
          id={spec.id}
          premier={premier}
          dernier={dernier}
          designation="cette caractéristique"
          occupe={editionPending || retraitPending}
        />
      </div>

      {/*
        Le retrait vit dans le dépliant de modification, et non sur la ligne :
        une liste de vingt caractéristiques avec vingt croix se nettoie d'un
        clic distrait. Il reste à un seul temps, lui — une ligne retirée se
        retape en dix secondes, là où un conditionnement supprimé emporte ses
        compatibilités.
      */}
      <details className="mt-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
          <IconPencil className="size-3.5 shrink-0" />
          Modifier
        </summary>

        <form action={actionEdition} className="mt-2 border-t border-line pt-3">
          <input type="hidden" name="specId" value={spec.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <TextField
              id={`label-${spec.id}`}
              name="label"
              label="Libellé"
              fieldSize="sm"
              defaultValue={texteSaisi(edition.saisie, 'label', spec.label)}
              maxLength={SPEC_LABEL_MAX}
              required
            />
            <TextField
              id={`value-${spec.id}`}
              name="value"
              label="Valeur"
              fieldSize="sm"
              defaultValue={texteSaisi(edition.saisie, 'value', spec.value)}
              maxLength={SPEC_VALUE_MAX}
              required
            />
          </div>
          <Button type="submit" size="sm" className="mt-3" disabled={editionPending}>
            {editionPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Retour state={edition} />
        </form>

        <form action={actionRetrait} className="mt-3">
          <input type="hidden" name="specId" value={spec.id} />
          <Button type="submit" size="sm" variant="ghost" disabled={retraitPending}>
            {/* La couleur est portée par le contenu : `cn` ne déduplique pas les
                utilitaires Tailwind, et un `text-danger` posé sur le bouton
                perdrait contre la classe de sa variante. */}
            <span className="flex items-center gap-1.5 text-danger">
              <IconClose className="size-4 shrink-0" />
              {retraitPending ? 'Retrait…' : 'Retirer cette ligne'}
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

function AjoutSpec({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(createProductSpec, ETAT_VIDE)

  return (
    <details className="rounded-md border border-line">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Ajouter une caractéristique
      </summary>
      <form action={action} className="border-t border-line p-3">
        <input type="hidden" name="productId" value={productId} />
        <p className="mb-3 max-w-[70ch] text-xs text-muted-strong">
          Ce que le client vérifie avant d’acheter : culot, température de couleur, tension,
          puissance, flux lumineux, durée de vie. Un libellé, une valeur.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <TextField
            id="spec-label"
            name="label"
            label="Libellé"
            placeholder="Culot"
            defaultValue={texteSaisi(state.saisie, 'label', '')}
            maxLength={SPEC_LABEL_MAX}
            required
          />
          <TextField
            id="spec-value"
            name="value"
            label="Valeur"
            placeholder="H7"
            defaultValue={texteSaisi(state.saisie, 'value', '')}
            maxLength={SPEC_VALUE_MAX}
            required
          />
        </div>
        <Button type="submit" className="mt-4" disabled={pending}>
          {pending ? 'Ajout…' : 'Ajouter la caractéristique'}
        </Button>
        <Retour state={state} />
      </form>
    </details>
  )
}

export function ProductSpecsManager({
  productId,
  specs,
  mayEdit,
}: {
  productId: string
  specs: SpecFiche[]
  mayEdit: boolean
}) {
  if (!mayEdit) {
    return specs.length === 0 ? (
      <p className="mt-2 text-sm text-muted-strong">Aucune caractéristique renseignée.</p>
    ) : (
      <dl className="mt-2 rounded-md border border-line bg-white">
        {specs.map((spec) => (
          <div
            key={spec.id}
            className="flex flex-col gap-0.5 border-t border-line px-3 py-2 first:border-t-0 sm:flex-row sm:gap-4"
          >
            <dt className="text-xs font-semibold text-muted-strong sm:w-72 sm:shrink-0">
              {spec.label}
            </dt>
            <dd className="min-w-0 text-sm break-words">{spec.value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {specs.length === 0 ? (
        <Alert tone="warn" title="Aucune caractéristique">
          La section « Caractéristiques » ne s’affiche pas sur la fiche : le client n’y trouve ni
          culot, ni teinte, ni tension.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-2">
          {specs.map((spec, index) => (
            <LigneSpec
              key={spec.id}
              spec={spec}
              premier={index === 0}
              dernier={index === specs.length - 1}
            />
          ))}
        </ul>
      )}

      {specs.length >= SPECS_MAX ? (
        <p className="text-xs text-muted-strong">
          Cette fiche compte {SPECS_MAX} caractéristiques : au-delà, le tableau n’est plus lu.
        </p>
      ) : (
        <AjoutSpec productId={productId} />
      )}
    </div>
  )
}
