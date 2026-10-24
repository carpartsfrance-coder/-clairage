'use client'

import { useActionState } from 'react'
import {
  setProductStatus,
  updateMediaAlt,
  updateProductInfo,
  type ProductEditState,
} from '@/lib/actions/admin-catalogue'
import { TextField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'

/**
 * Édition d'une fiche produit, dans le back-office.
 *
 * L'écran était en lecture seule : il montrait les trous sans permettre de les
 * boucher, et corriger une rubrique manquante demandait une requête à la main.
 *
 * Ce formulaire ne couvre que ce que le relevé des manques reproche —
 * rubrique, accroche, référencement, textes alternatifs, statut. Le prix, le
 * stock, la composition et les compatibilités ont leurs propres écrans ou
 * leurs propres imports : les réunir ici donnerait un formulaire de trente
 * champs que personne ne relit avant d'enregistrer.
 *
 * Chaque bloc a sa propre action et son propre retour. Un seul gros
 * « Enregistrer » obligerait à tout renvoyer pour corriger un texte
 * alternatif, et ferait d'une correction de détail une réécriture complète.
 */

function Retour({ state }: { state: ProductEditState }) {
  if (state.error) {
    return (
      <Alert tone="danger" className="mt-3">
        {state.error}
      </Alert>
    )
  }
  if (state.ok && state.message) {
    return (
      <Alert tone="ok" className="mt-3">
        {state.message}
      </Alert>
    )
  }
  return null
}

export function ProductInfoForm({
  productId,
  tagline,
  metaTitle,
  metaDescription,
  categories,
  selectedCategoryIds,
  featured,
}: {
  productId: string
  tagline: string | null
  metaTitle: string | null
  metaDescription: string | null
  categories: Array<{ id: string; name: string; path: string }>
  selectedCategoryIds: string[]
  featured: boolean
}) {
  const [state, action, pending] = useActionState<ProductEditState, FormData>(updateProductInfo, {})

  return (
    <form action={action} className="mt-3 rounded-lg border border-line p-4">
      <input type="hidden" name="productId" value={productId} />

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="tagline"
          name="tagline"
          label="Accroche"
          hint="La ligne sous le titre, en haut de la fiche."
          defaultValue={tagline ?? ''}
          maxLength={160}
        />
        <TextField
          id="metaTitle"
          name="metaTitle"
          label="Titre de référencement"
          hint="Repris par les moteurs. Laissé vide, c'est le nom du produit."
          defaultValue={metaTitle ?? ''}
          maxLength={120}
        />
      </div>

      <TextField
        id="metaDescription"
        name="metaDescription"
        label="Description de référencement"
        hint="Deux phrases. Vide, les moteurs reprennent un extrait au hasard."
        wrapperClassName="mt-4"
        defaultValue={metaDescription ?? ''}
        maxLength={320}
      />

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Rubriques</legend>
        <p className="mt-1 text-xs text-muted-strong">
          Sans rubrique, le produit n’a pas de fil d’Ariane et n’apparaît dans aucun menu. La
          première cochée porte le fil d’Ariane.
        </p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {categories.map((categorie) => (
            <label key={categorie.id} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="categoryIds"
                value={categorie.id}
                defaultChecked={selectedCategoryIds.includes(categorie.id)}
                className="size-4 shrink-0"
              />
              <span className="min-w-0 truncate">{categorie.path}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        La mise en avant est éditoriale, et elle n'avait aucune commande : le
        champ existait en base, l'accueil le lisait, mais rien ne permettait de
        le poser. Seul le jeu de démonstration en cochait — d'où une vitrine
        vide sur tout environnement installé sans démonstration.
      */}
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Mise en avant</legend>
        <label className="mt-2 flex min-h-9 items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={featured}
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="min-w-0">
            Afficher ce produit sur la page d’accueil
            <span className="mt-0.5 block text-xs text-muted-strong">
              La vitrine en montre quatre au plus. C’est un choix de mise en avant, pas un
              classement : rien ici ne dit que le produit se vend mieux qu’un autre.
            </span>
          </span>
        </label>
      </fieldset>

      <Button type="submit" className="mt-4" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer la fiche'}
      </Button>

      <Retour state={state} />
    </form>
  )
}

export function ProductStatusForm({
  productId,
  status,
  bloquants,
}: {
  productId: string
  status: string
  /** Intitulés des manques bloquants, pour expliquer un bouton désactivé. */
  bloquants: string[]
}) {
  const [state, action, pending] = useActionState<ProductEditState, FormData>(setProductStatus, {})

  const cibles = [
    { valeur: 'DRAFT', libelle: 'Repasser en brouillon' },
    { valeur: 'PUBLISHED', libelle: 'Publier' },
    { valeur: 'ARCHIVED', libelle: 'Archiver' },
  ].filter((cible) => cible.valeur !== status)

  return (
    <form action={action} className="mt-3 rounded-lg border border-line p-4">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-semibold">Statut</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {cibles.map((cible) => {
          const refuse = cible.valeur === 'PUBLISHED' && bloquants.length > 0
          return (
            <Button
              key={cible.valeur}
              type="submit"
              name="status"
              value={cible.valeur}
              variant={cible.valeur === 'PUBLISHED' ? 'primary' : 'secondary'}
              disabled={pending || refuse}
              title={
                refuse
                  ? `À corriger d'abord : ${bloquants.join(', ')}`
                  : undefined
              }
            >
              {cible.libelle}
            </Button>
          )
        })}
      </div>

      {bloquants.length > 0 ? (
        <p className="mt-2 text-xs text-muted-strong">
          La publication est refusée tant que ces points ne sont pas réglés :{' '}
          {bloquants.join(', ').toLowerCase()}. Le serveur refuse aussi, pas seulement ce bouton.
        </p>
      ) : null}

      <Retour state={state} />
    </form>
  )
}

export function MediaAltForm({
  productId,
  mediaId,
  alt,
}: {
  productId: string
  mediaId: string
  alt: string | null
}) {
  const [state, action, pending] = useActionState<ProductEditState, FormData>(updateMediaAlt, {})

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <TextField
        id={`alt-${mediaId}`}
        name="alt"
        label="Texte alternatif"
        hideLabel
        fieldSize="sm"
        placeholder="Décrivez ce que montre l’image"
        defaultValue={alt ?? ''}
        wrapperClassName="flex-1"
        aria-label="Texte alternatif du visuel"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? '…' : 'Enregistrer'}
      </Button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  )
}
