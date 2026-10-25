'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import {
  reorderCategories,
  toggleCategoryVisibility,
  type CategoryAdminState,
} from '@/lib/actions/admin-categories'
import { Alert } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

export type CategoryRow = {
  id: string
  slug: string
  name: string
  family: string
  position: number
  published: boolean
  parentName: string | null
  childCount: number
  publishedProducts: number
}

/**
 * Tableau des catégories : ordre et visibilité.
 *
 * **L'ordre se saisit en clair, et s'enregistre d'un bloc.** Des flèches
 * « monter / descendre » appliqueraient chacune un décalage calculé sur l'état
 * affiché ; deux onglets ouverts, ou un rechargement entre deux clics, et
 * l'ordre obtenu n'est plus celui qu'on voyait. Un champ par ligne et un seul
 * enregistrement, c'est ce que l'on relit avant de valider.
 *
 * Les positions peuvent être espacées (10, 20, 30) : seul leur ordre relatif
 * compte, et des trous laissent de la place pour intercaler sans tout
 * renuméroter.
 */
export function CategoryBoard({ categories }: { categories: CategoryRow[] }) {
  const [ordreState, ordreAction, ordrePending] = useActionState<CategoryAdminState, FormData>(
    reorderCategories,
    {},
  )
  const [visibiliteState, visibiliteAction, visibilitePending] = useActionState<
    CategoryAdminState,
    FormData
  >(toggleCategoryVisibility, {})

  const retour = visibiliteState.error || visibiliteState.notice ? visibiliteState : ordreState

  return (
    <div className="flex flex-col gap-4">
      {retour.error ? (
        <Alert tone="danger" live="assertive">
          {retour.error}
        </Alert>
      ) : null}
      {retour.notice ? (
        <Alert tone="ok" live="polite">
          {retour.notice}
        </Alert>
      ) : null}

      <form action={ordreAction}>
        <div className="overflow-x-auto rounded-[9px] border border-[#e0e0e0]">
          <table className="w-full min-w-[720px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line bg-surface-soft text-left">
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Ordre
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Catégorie
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Famille
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Produits publiés
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Dans le menu
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-bold">
                  Visibilité
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5">
                    <input type="hidden" name="categoryId" value={category.id} />
                    <label htmlFor={`position-${category.id}`} className="sr-only">
                      Position de {category.name}
                    </label>
                    <input
                      id={`position-${category.id}`}
                      name="position"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={category.position}
                      className="h-9 w-16 rounded-[7px] border border-[#d4d4d4] px-2 text-[12px]"
                    />
                  </td>

                  <td className="px-3 py-2.5">
                    <Link
                      href={`/c/${category.slug}`}
                      className="font-semibold underline-offset-[3px] hover:underline"
                    >
                      {category.name}
                    </Link>
                    <span className="block text-[10px] text-muted">
                      /c/{category.slug}
                      {category.parentName ? ` · sous ${category.parentName}` : null}
                      {category.childCount > 0 ? ` · ${category.childCount} sous-catégories` : null}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-[10px] text-muted-strong">{category.family}</td>

                  <td className="px-3 py-2.5">{category.publishedProducts}</td>

                  {/*
                    Présence réelle dans le menu : publiée ET non vide. C'est
                    la règle de `lib/queries/navigation.ts`, affichée ici pour
                    qu'une absence s'explique sans aller lire le code.
                  */}
                  <td className="px-3 py-2.5">
                    {category.published && category.publishedProducts > 0 ? (
                      <Badge tone="ok">Affichée</Badge>
                    ) : (
                      <Badge tone="neutral">
                        {!category.published ? 'Dépubliée' : 'Vide'}
                      </Badge>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="submit"
                      form={`visibilite-${category.id}`}
                      disabled={visibilitePending}
                      className={cn(
                        'inline-flex min-h-9 items-center rounded-md border px-3 text-[11px] font-semibold transition-colors',
                        category.published
                          ? 'border-[#c4c4c4] hover:border-slate-ink'
                          : 'border-brand text-brand hover:bg-brand-soft',
                      )}
                    >
                      {category.published ? 'Dépublier' : 'Publier'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button
          type="submit"
          disabled={ordrePending}
          className="mt-3 min-h-[42px] gap-3 rounded-md px-[17px] text-[11px]"
        >
          {ordrePending ? 'Enregistrement…' : "Enregistrer l'ordre"}
        </Button>
      </form>

      {/*
        Un formulaire par ligne, hors du tableau : imbriquer des formulaires
        est invalide en HTML, et le bouton de chaque ligne y est rattaché par
        son attribut `form`.
      */}
      {categories.map((category) => (
        <form key={category.id} id={`visibilite-${category.id}`} action={visibiliteAction} hidden>
          <input type="hidden" name="categoryId" value={category.id} />
          <input type="hidden" name="published" value={category.published ? 'false' : 'true'} />
        </form>
      ))}
    </div>
  )
}
