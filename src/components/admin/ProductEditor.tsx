'use client'

import { useActionState, useState } from 'react'
import {
  setProductStatus,
  updateMediaAlt,
  updateProductPublication,
  updateProductSeo,
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
 * Chaque bloc a sa propre action et son propre retour. Un seul gros
 * « Enregistrer » obligerait à tout renvoyer pour corriger un texte
 * alternatif, et ferait d'une correction de détail une réécriture complète.
 *
 * Deux formulaires vivent ici, séparés par le passage aux onglets : le
 * référencement, qui a son propre onglet, et la publication — rubriques et
 * mise en avant — qui reste dans la colonne de droite, visible pendant qu'on
 * travaille ailleurs. Ils ne formaient qu'un seul formulaire tant que la fiche
 * tenait sur une page.
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

/** Titre et description de référencement : l'onglet SEO. */
export function SeoForm({
  productId,
  metaTitle,
  metaDescription,
  nomProduit,
}: {
  productId: string
  metaTitle: string | null
  metaDescription: string | null
  /** Ce que les moteurs reprendront si le titre reste vide. */
  nomProduit: string
}) {
  const [state, action, pending] = useActionState<ProductEditState, FormData>(updateProductSeo, {})

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />

      <TextField
        id="metaTitle"
        name="metaTitle"
        label="Titre de référencement"
        hint={`Repris par les moteurs. Laissé vide, c’est le nom du produit : « ${nomProduit} ».`}
        defaultValue={metaTitle ?? ''}
        maxLength={120}
      />
      <TextField
        id="metaDescription"
        name="metaDescription"
        label="Description de référencement"
        hint="Deux phrases. Vide, les moteurs reprennent un extrait au hasard de la page."
        wrapperClassName="mt-4"
        defaultValue={metaDescription ?? ''}
        maxLength={320}
      />

      <Button type="submit" className="mt-4" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer le référencement'}
      </Button>

      <Retour state={state} />
    </form>
  )
}

/** Rubriques et mise en avant : la colonne de droite. */
export function PublicationForm({
  productId,
  categories,
  selectedCategoryIds,
  featured,
}: {
  productId: string
  categories: Array<{ id: string; name: string; path: string }>
  selectedCategoryIds: string[]
  featured: boolean
}) {
  const [state, action, pending] = useActionState<ProductEditState, FormData>(
    updateProductPublication,
    {},
  )
  const [filtre, setFiltre] = useState('')
  // Les rubriques cochées d'abord, puis par chemin : on voit tout de suite où
  // est rangé le produit, et la recherche trouve le reste.
  const triees = [...categories].sort(
    (a, b) =>
      Number(selectedCategoryIds.includes(b.id)) - Number(selectedCategoryIds.includes(a.id)) ||
      a.path.localeCompare(b.path, 'fr'),
  )
  const mot = filtre.trim().toLowerCase()

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />

      <fieldset>
        <legend className="text-xs font-bold">Rubriques</legend>
        <p className="mt-1 text-xs text-muted-strong">
          Où le produit est rangé dans les menus. Cochez-en au moins une.
        </p>
        <input
          type="search"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Chercher une rubrique…"
          aria-label="Chercher une rubrique"
          className="mt-2 h-9 w-full rounded-sm border border-[#d4d4d4] px-2 text-xs"
        />
        {/*
          `grid-cols-1` explicite : sans lui, la colonne implicite se dimensionne
          sur son contenu, et un chemin de rubrique long pousse la page entière
          en débordement horizontal sous 640 px.
        */}
        <div className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto pr-1">
          {triees.map((categorie) => (
            <label
              key={categorie.id}
              className="flex min-h-9 items-center gap-2 text-xs"
              hidden={mot !== '' && !categorie.path.toLowerCase().includes(mot)}
            >
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
      <label className="mt-4 flex min-h-9 items-start gap-2 border-t border-line pt-3 text-xs">
        <input
          type="checkbox"
          name="featured"
          defaultChecked={featured}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          Mettre en avant sur l’accueil
          <span className="mt-0.5 block text-xs text-muted-strong">
            La vitrine en montre quatre au plus. C’est un choix éditorial, pas un classement des
            ventes.
          </span>
        </span>
      </label>

      <Button type="submit" size="sm" className="mt-3" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
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
    <form action={action} className="flex flex-wrap items-end gap-2">
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
        /*
          `min-w-0` autorise le champ à rétrécir dans une vignette étroite, et
          `flex-wrap` sur le formulaire fait passer le bouton dessous plutôt
          que de réduire le champ à deux lettres.
        */
        wrapperClassName="min-w-[8rem] flex-1"
        aria-label="Texte alternatif du visuel"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? '…' : 'Enregistrer'}
      </Button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  )
}
