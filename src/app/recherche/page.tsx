import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Pagination } from '@/components/catalogue/Pagination'
import { ProductCard } from '@/components/catalogue/ProductCard'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Card, EmptyState } from '@/components/ui/Surface'
import { IconClose, IconSearch } from '@/components/ui/icons'
import {
  SORT_OPTIONS,
  getSearchFallbacks,
  listProducts,
  type Facet,
  type SortKey,
} from '@/lib/queries/catalogue'
import { getSelectedVehicle } from '@/lib/session'
import { cn } from '@/lib/cn'

/**
 * Résultats de recherche.
 *
 * La page ne déduit jamais la compatibilité : `listProducts` reçoit la
 * configuration du véhicule seulement pour teinter chaque carte, et sans
 * véhicule aucun badge n'est rendu.
 *
 * Le cas vraiment important ici est le résultat vide : plutôt qu'une page
 * morte, on redonne la main avec les culots et les catégories réellement
 * présents en base (`getSearchFallbacks`). Si la base ne renvoie rien, aucune
 * piste n'est fabriquée — la rangée correspondante disparaît.
 */

type SearchParams = Record<string, string | string[] | undefined>

type SearchState = {
  q: string
  culot: string[]
  temp: string[]
  cond: string[]
  tri: SortKey
  page: number
}

type FacetKey = 'culot' | 'temp' | 'cond'

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value)

function readOne(params: SearchParams, key: string): string {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').trim()
}

/** Une facette peut arriver répétée (`?culot=H7&culot=H11`) ou en liste. */
function readMany(params: SearchParams, key: string): string[] {
  const raw = params[key]
  if (!raw) return []
  const values = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(values)]
}

function readState(params: SearchParams): SearchState {
  const tri = readOne(params, 'tri') as SortKey
  const page = Number.parseInt(readOne(params, 'page'), 10)

  return {
    q: readOne(params, 'q'),
    culot: readMany(params, 'culot'),
    temp: readMany(params, 'temp'),
    cond: readMany(params, 'cond'),
    tri: SORT_VALUES.includes(tri) ? tri : 'pertinence',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  }
}

/** Une seule fonction construit toutes les URL de la page : filtres, tri, pagination. */
function hrefFor(state: SearchState): string {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  for (const value of state.culot) params.append('culot', value)
  for (const value of state.temp) params.append('temp', value)
  for (const value of state.cond) params.append('cond', value)
  if (state.tri !== 'pertinence') params.set('tri', state.tri)
  if (state.page > 1) params.set('page', String(state.page))
  const query = params.toString()
  return query ? `/recherche?${query}` : '/recherche'
}

function toggleHref(state: SearchState, key: FacetKey, value: string): string {
  const current = state[key]
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value]

  // Changer de filtre invalide la pagination : on revient en page 1.
  const target: SearchState = { ...state, page: 1 }
  if (key === 'culot') target.culot = next
  else if (key === 'temp') target.temp = next
  else target.cond = next
  return hrefFor(target)
}

/**
 * Les facettes sont calculées sur le périmètre déjà filtré : une valeur
 * sélectionnée dont le compte retombe à zéro disparaîtrait de la liste, et
 * deviendrait impossible à retirer. On la réinjecte, sans compte inventé.
 */
function mergeFacets(facets: Facet[], selected: string[]) {
  const known = new Set(facets.map((facet) => facet.value))
  return [
    ...facets.map((facet) => ({ value: facet.value, label: facet.label, count: facet.count })),
    ...selected
      .filter((value) => !known.has(value))
      .map((value) => ({ value, label: value, count: null as number | null })),
  ]
}

const pillClass =
  'inline-flex h-11 items-center gap-2 rounded-sm border px-3.5 text-sm font-medium transition-colors'

function FacetLink({
  href,
  label,
  count,
  selected,
}: {
  href: string
  label: string
  count: number | null
  selected: boolean
}) {
  return (
    <Link
      href={href}
      aria-label={selected ? `Retirer le filtre ${label}` : `Filtrer sur ${label}`}
      className={cn(
        pillClass,
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-line-strong bg-white text-slate-ink hover:border-slate-ink',
      )}
    >
      <span>{label}</span>
      {count !== null ? (
        <span className={cn('text-xs', selected ? 'text-white/80' : 'text-muted')}>{count}</span>
      ) : null}
      {selected ? <IconClose className="size-3.5 shrink-0" /> : null}
    </Link>
  )
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const q = readOne(await searchParams, 'q')
  return {
    title: q ? `Recherche : ${q}` : 'Recherche',
    // Une page de résultats n'a pas à être indexée ; les liens qu'elle porte, si.
    robots: { index: false, follow: true },
  }
}

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const state = readState(await searchParams)
  const vehicle = await getSelectedVehicle()

  const hasFacets = state.culot.length > 0 || state.temp.length > 0 || state.cond.length > 0
  // Sans critère, on n'interroge pas la base : il n'y a rien à chercher.
  const hasCriteria = state.q.length > 0 || hasFacets

  const result = hasCriteria
    ? await listProducts(
        {
          query: state.q || undefined,
          bases: state.culot.length ? state.culot : undefined,
          temperatures: state.temp.length
            ? state.temp.map(Number).filter((value) => Number.isFinite(value))
            : undefined,
          packagings: state.cond.length ? state.cond : undefined,
          sort: state.tri,
          page: state.page,
        },
        vehicle?.configurationId ?? null,
      )
    : null

  const fallbacks = result && result.total === 0 ? await getSearchFallbacks(state.q) : null

  const countLabel = !result
    ? null
    : result.total === 0
      ? 'Aucun résultat.'
      : result.total === 1
        ? '1 résultat.'
        : `${result.total.toLocaleString('fr-FR')} résultats.`

  const facetGroups: Array<{ key: FacetKey; legend: string; items: ReturnType<typeof mergeFacets> }> =
    result
      ? [
          {
            key: 'culot',
            legend: 'Culot',
            items: mergeFacets(result.facets.bases, state.culot),
          },
          {
            key: 'temp',
            legend: 'Température de couleur',
            items: mergeFacets(result.facets.temperatures, state.temp),
          },
          {
            key: 'cond',
            legend: 'Conditionnement',
            items: mergeFacets(result.facets.packagings, state.cond),
          },
        ]
      : []

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Recherche' }]} />

      <header className="mt-5 flex flex-col gap-5">
        <div>
          <h1 className="text-[1.75rem] leading-[1.15] font-extrabold sm:text-[2.125rem]">
            {state.q ? `Résultats pour « ${state.q} »` : 'Rechercher'}
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-strong">
            La recherche accepte trois entrées : un nom de produit, une référence (SKU) ou un culot
            — H7, D1S, W5W.
          </p>
          {countLabel ? <p className="mt-2 text-sm font-semibold">{countLabel}</p> : null}
        </div>

        {/* Formulaire réel : la recherche reste utilisable sans JavaScript. */}
        <form method="get" action="/recherche" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            id="recherche-q"
            name="q"
            type="search"
            label="Votre recherche"
            defaultValue={state.q}
            placeholder="Nom, référence ou culot"
            autoComplete="off"
            enterKeyHint="search"
            wrapperClassName="flex-1 min-w-0"
          />
          <Button type="submit" iconLeft={<IconSearch className="size-4" />}>
            Rechercher
          </Button>
        </form>

        <VehicleBar vehicle={vehicle} />
      </header>

      {!result ? (
        <div className="mt-8">
          <EmptyState
            title="Indiquez ce que vous cherchez."
            description="Un nom de produit, une référence (SKU) ou un culot comme H7, D1S ou W5W : les trois fonctionnent. Vous pouvez aussi partir du catalogue."
            action={{ label: 'Parcourir toutes les catégories', href: '/c' }}
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="recherche-filtres" className="mt-8">
            <h2 id="recherche-filtres" className="sr-only">
              Filtrer et trier les résultats
            </h2>

            <Card className="flex flex-col gap-5 p-4 sm:p-5">
              <form
                method="get"
                action="/recherche"
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="q" value={state.q} />
                {state.culot.map((value) => (
                  <input key={`h-culot-${value}`} type="hidden" name="culot" value={value} />
                ))}
                {state.temp.map((value) => (
                  <input key={`h-temp-${value}`} type="hidden" name="temp" value={value} />
                ))}
                {state.cond.map((value) => (
                  <input key={`h-cond-${value}`} type="hidden" name="cond" value={value} />
                ))}

                <SelectField
                  id="recherche-tri"
                  name="tri"
                  label="Trier par"
                  defaultValue={state.tri}
                  wrapperClassName="sm:w-64"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
                <Button type="submit" variant="secondary">
                  Appliquer le tri
                </Button>
              </form>

              {facetGroups.some((group) => group.items.length > 0) ? (
                <div className="flex flex-col gap-4 border-t border-line pt-5">
                  {facetGroups
                    .filter((group) => group.items.length > 0)
                    .map((group) => (
                      <div key={group.key}>
                        <h3 className="text-sm font-semibold">{group.legend}</h3>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {group.items.map((item) => (
                            <li key={`${group.key}-${item.value}`}>
                              <FacetLink
                                href={toggleHref(state, group.key, item.value)}
                                label={item.label}
                                count={item.count}
                                selected={state[group.key].includes(item.value)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                  {hasFacets ? (
                    <p>
                      <Link
                        href={hrefFor({ ...state, culot: [], temp: [], cond: [], page: 1 })}
                        className="text-sm font-semibold text-brand underline underline-offset-4"
                      >
                        Retirer tous les filtres
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </section>

          <section aria-labelledby="recherche-resultats" className="mt-8">
            <h2 id="recherche-resultats" className="sr-only">
              Résultats de la recherche
            </h2>

            {result.items.length > 0 ? (
              <>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {result.items.map((product) => (
                    <ProductCard key={product.slug} product={product} />
                  ))}
                </ul>
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  buildHref={(page) => hrefFor({ ...state, page })}
                />
              </>
            ) : result.total > 0 ? (
              // Page demandée au-delà du dernier résultat (`?page=99`) : le
              // compte annoncé plus haut est juste, c'est la page qui n'existe
              // pas. Dire « aucun résultat » ici serait faux, et la pagination
              // n'est pas rendue — sans ce lien la page est sans issue.
              <EmptyState
                title="Cette page de résultats n'existe pas."
                description="Les résultats annoncés se trouvent sur les pages précédentes."
                action={{
                  label: 'Revenir à la première page',
                  href: hrefFor({ ...state, page: 1 }),
                }}
              />
            ) : (
              <EmptyState
                title={
                  state.q
                    ? `Aucun résultat pour « ${state.q} ».`
                    : 'Aucun résultat avec ces filtres.'
                }
                description="Vérifiez l'orthographe de la référence, ou partez du culot ou de la catégorie."
                action={{ label: 'Parcourir toutes les catégories', href: '/c' }}
              />
            )}
          </section>

          {fallbacks && (fallbacks.bases.length > 0 || fallbacks.categories.length > 0) ? (
            <section aria-labelledby="recherche-alternatives" className="mt-8">
              <h2 id="recherche-alternatives" className="text-xl font-extrabold">
                Autres pistes
              </h2>

              <div className="mt-4 flex flex-col gap-5">
                {fallbacks.bases.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold">Par culot</h3>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {fallbacks.bases.map((base) => (
                        <li key={`fallback-base-${base}`}>
                          <Link
                            href={`/recherche?q=${encodeURIComponent(base)}`}
                            className={cn(
                              pillClass,
                              'border-line-strong bg-white text-slate-ink hover:border-slate-ink',
                            )}
                          >
                            Culot {base}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {fallbacks.categories.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold">Par catégorie</h3>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {fallbacks.categories.map((category) => (
                        <li key={`fallback-cat-${category.slug}`}>
                          <Link
                            href={`/c/${category.slug}`}
                            className={cn(
                              pillClass,
                              'border-line-strong bg-white text-slate-ink hover:border-slate-ink',
                            )}
                          >
                            {category.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
