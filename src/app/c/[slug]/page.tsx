import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Pagination } from '@/components/catalogue/Pagination'
import { ProductCard } from '@/components/catalogue/ProductCard'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/Surface'
import { IconClose, IconSliders } from '@/components/ui/icons'
import {
  SORT_OPTIONS,
  getCategory,
  listProducts,
  type CatalogueFilters,
  type Facet,
  type SortKey,
} from '@/lib/queries/catalogue'
import { getSelectedVehicle } from '@/lib/session'

/**
 * Liste d'une catégorie.
 *
 * Filtres et tri passent par de vrais formulaires `method="get"` : la page
 * fonctionne sans JavaScript, chaque sélection a son URL, et le retour arrière
 * du navigateur fait ce qu'on attend de lui. Rien n'est filtré sur la
 * compatibilité — le véhicule teinte les cartes, il ne masque pas le
 * catalogue.
 */

type SearchParams = Record<string, string | string[] | undefined>

/** Clé d'URL → groupe de facettes. */
const FILTER_KEYS = {
  bases: 'culot',
  temperatures: 'temp',
  packagings: 'cond',
} as const

type ParsedFilters = {
  bases: string[]
  /** Kelvins conservés en texte : c'est la graphie des facettes et de l'URL. */
  temperatures: string[]
  packagings: string[]
  sort: SortKey
  page: number
}

/**
 * Normalise une valeur de searchParams : une clé répétée arrive en tableau,
 * une clé unique en chaîne, une clé absente en `undefined`. Le plafond évite
 * qu'une URL fabriquée n'envoie une liste sans fin à la base.
 */
function readList(value: string | string[] | undefined, limit = 20): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))].slice(0, limit)
}

function readSort(value: string | string[] | undefined): SortKey {
  const candidate = readList(value, 1)[0]
  return SORT_OPTIONS.some((option) => option.value === candidate)
    ? (candidate as SortKey)
    : 'pertinence'
}

function readPage(value: string | string[] | undefined): number {
  const candidate = Number(readList(value, 1)[0])
  return Number.isInteger(candidate) && candidate > 0 ? candidate : 1
}

function parseFilters(searchParams: SearchParams): ParsedFilters {
  return {
    bases: readList(searchParams[FILTER_KEYS.bases]),
    temperatures: readList(searchParams[FILTER_KEYS.temperatures]).filter((value) =>
      /^\d{3,5}$/.test(value),
    ),
    packagings: readList(searchParams[FILTER_KEYS.packagings]),
    sort: readSort(searchParams.tri),
    page: readPage(searchParams.page),
  }
}

function activeCount(filters: ParsedFilters): number {
  return filters.bases.length + filters.temperatures.length + filters.packagings.length
}

function toCatalogueFilters(slug: string, filters: ParsedFilters): CatalogueFilters {
  return {
    categorySlug: slug,
    bases: filters.bases,
    temperatures: filters.temperatures.map(Number),
    packagings: filters.packagings,
    sort: filters.sort,
    page: filters.page,
  }
}

/**
 * Les liens sont reconstruits depuis les valeurs validées, jamais recopiés
 * depuis la requête : une URL reste canonique et ne traîne pas de paramètre
 * étranger derrière elle.
 */
function buildParams(filters: ParsedFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const value of filters.bases) params.append(FILTER_KEYS.bases, value)
  for (const value of filters.temperatures) params.append(FILTER_KEYS.temperatures, value)
  for (const value of filters.packagings) params.append(FILTER_KEYS.packagings, value)
  if (filters.sort !== 'pertinence') params.set('tri', filters.sort)
  return params
}

/** Retire une seule valeur d'un groupe, et repart de la première page. */
function withoutValue(
  filters: ParsedFilters,
  field: 'bases' | 'temperatures' | 'packagings',
  value: string,
): ParsedFilters {
  const keep = (list: string[]) => list.filter((item) => item !== value)
  return {
    ...filters,
    page: 1,
    bases: field === 'bases' ? keep(filters.bases) : filters.bases,
    temperatures: field === 'temperatures' ? keep(filters.temperatures) : filters.temperatures,
    packagings: field === 'packagings' ? keep(filters.packagings) : filters.packagings,
  }
}

function hrefFor(slug: string, params: URLSearchParams): string {
  const query = params.toString()
  return query ? `/c/${slug}?${query}` : `/c/${slug}`
}

/** Une lecture par requête, partagée entre `generateMetadata` et la page. */
const loadCategory = cache((slug: string) => getCategory(slug))

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { slug } = await params
  const category = await loadCategory(slug)

  if (!category) {
    return { title: 'Catégorie introuvable', robots: { index: false, follow: false } }
  }

  const filters = parseFilters(await searchParams)
  const narrowed = activeCount(filters) > 0 || filters.page > 1

  return {
    title: category.metaTitle ?? category.name,
    description: category.metaDescription ?? category.description ?? undefined,
    // La canonique ignore les filtres : une combinaison de cases cochées ne
    // doit pas devenir une page de plus à indexer.
    alternates: { canonical: `/c/${slug}` },
    ...(narrowed ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const { slug } = await params
  const sp = await searchParams

  const [category, vehicle] = await Promise.all([loadCategory(slug), getSelectedVehicle()])
  if (!category) notFound()

  const filters = parseFilters(sp)
  const filterCount = activeCount(filters)
  const basePath = `/c/${slug}`

  const result = await listProducts(
    toCatalogueFilters(slug, filters),
    vehicle?.configurationId ?? null,
  )

  const groups: FilterGroup[] = [
    { key: FILTER_KEYS.bases, legend: 'Culot', facets: result.facets.bases, selected: filters.bases },
    {
      key: FILTER_KEYS.temperatures,
      legend: 'Température',
      facets: result.facets.temperatures,
      selected: filters.temperatures,
    },
    {
      key: FILTER_KEYS.packagings,
      legend: 'Conditionnement',
      facets: result.facets.packagings,
      selected: filters.packagings,
    },
  ]

  /** Chaque filtre actif est retirable seul, sans toucher aux autres. */
  const activeChips = (
    [
      { field: 'bases', values: filters.bases, label: (value: string) => `Culot ${value}` },
      {
        field: 'temperatures',
        values: filters.temperatures,
        label: (value: string) => `Température ${value} K`,
      },
      {
        field: 'packagings',
        values: filters.packagings,
        label: (value: string) =>
          `Conditionnement ${
            result.facets.packagings.find((facet) => facet.value === value)?.label ?? value
          }`,
      },
    ] as const
  ).flatMap(({ field, values, label }) =>
    values.map((value) => ({
      field,
      value,
      label: label(value),
      href: hrefFor(slug, buildParams(withoutValue(filters, field, value))),
    })),
  )

  const buildPageHref = (page: number) => {
    const params = buildParams(filters)
    if (page > 1) params.set('page', String(page))
    return hrefFor(slug, params)
  }

  const empty =
    result.items.length > 0
      ? null
      : filterCount > 0
        ? {
            title: 'Aucun produit ne correspond à ces filtres.',
            description: 'Retirez un critère pour élargir la sélection.',
            action: { label: 'Retirer les filtres', href: basePath },
          }
        : filters.page > 1
          ? {
              title: 'Cette page ne contient aucun produit.',
              description: undefined,
              action: { label: 'Revenir à la première page', href: buildPageHref(1) },
            }
          : {
              title: 'Cette catégorie ne contient aucun produit publié.',
              description: undefined,
              action: { label: 'Voir toutes les catégories', href: '/c' },
            }

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Catégories', href: '/c' },
          ...(category.parent
            ? [{ label: category.parent.name, href: `/c/${category.parent.slug}` }]
            : []),
          { label: category.name },
        ]}
      />

      <header className="mt-4 max-w-3xl">
        <h1 className="text-[1.75rem] leading-[1.15] font-extrabold sm:text-[2.125rem]">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-3 text-base text-muted-strong">{category.description}</p>
        ) : null}
      </header>

      <VehicleBar vehicle={vehicle} variant="compact" className="mt-5" />

      {category.children.length > 0 ? (
        <section aria-labelledby="sous-categories-titre" className="mt-6">
          <h2 id="sous-categories-titre" className="sr-only">
            Sous-catégories
          </h2>
          <ul className="flex flex-wrap gap-2">
            {category.children.map((child) => (
              <li key={child.slug}>
                <Link
                  href={`/c/${child.slug}`}
                  className="inline-flex h-9 items-center rounded-sm border border-line-strong bg-white px-3.5 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Colonne de filtres : visible dès lg, remplacée par un dépliant sur mobile. */}
        <section
          aria-labelledby="filtres-titre"
          className="hidden lg:block lg:w-64 lg:shrink-0"
        >
          <h2 id="filtres-titre" className="text-base font-bold">
            Filtres
          </h2>
          <FiltersForm basePath={basePath} groups={groups} sort={filters.sort} hasFilters={filterCount > 0} />
        </section>

        <section aria-labelledby="resultats-titre" className="min-w-0 flex-1">
          <h2 id="resultats-titre" className="sr-only">
            Produits
          </h2>

          <details className="mb-5 rounded-md border border-line lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
              <IconSliders className="size-5 shrink-0 text-muted-strong" />
              Filtres
              {filterCount > 0 ? <span className="text-muted">({filterCount})</span> : null}
            </summary>
            <div className="border-t border-line px-4 pb-4">
              <FiltersForm
                basePath={basePath}
                groups={groups}
                sort={filters.sort}
                hasFilters={filterCount > 0}
              />
            </div>
          </details>

          <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm font-semibold text-muted-strong">
              {result.total} {result.total === 1 ? 'produit' : 'produits'}
            </p>

            {/* Tri sans JavaScript : un select, un bouton, une URL. */}
            <form method="get" action={basePath} className="flex items-end gap-2">
              <HiddenFilters filters={filters} />
              <SelectField
                id="tri-catalogue"
                name="tri"
                label="Trier par"
                hideLabel
                fieldSize="sm"
                defaultValue={filters.sort}
                wrapperClassName="w-48"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" variant="secondary" size="sm">
                Trier
              </Button>
            </form>
          </div>

          {activeChips.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <li key={`${chip.field}-${chip.value}`}>
                  <Link
                    href={chip.href}
                    aria-label={`Retirer le filtre ${chip.label}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong bg-surface-soft px-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink"
                  >
                    {chip.label}
                    <IconClose className="size-3.5 shrink-0 text-muted-strong" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {empty ? (
            <EmptyState
              className="mt-6"
              title={empty.title}
              description={empty.description}
              action={empty.action}
            />
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((item) => (
                <ProductCard key={item.slug} product={item} />
              ))}
            </ul>
          )}

          <Pagination page={result.page} pageCount={result.pageCount} buildHref={buildPageHref} />
        </section>
      </div>
    </div>
  )
}

type FilterGroup = {
  key: (typeof FILTER_KEYS)[keyof typeof FILTER_KEYS]
  legend: string
  facets: Facet[]
  selected: string[]
}

/** Reporte les filtres actifs dans le formulaire de tri, qui les perdrait sinon. */
function HiddenFilters({ filters }: { filters: ParsedFilters }) {
  return (
    <>
      {filters.bases.map((value) => (
        <input key={`culot-${value}`} type="hidden" name={FILTER_KEYS.bases} value={value} />
      ))}
      {filters.temperatures.map((value) => (
        <input key={`temp-${value}`} type="hidden" name={FILTER_KEYS.temperatures} value={value} />
      ))}
      {filters.packagings.map((value) => (
        <input key={`cond-${value}`} type="hidden" name={FILTER_KEYS.packagings} value={value} />
      ))}
    </>
  )
}

/**
 * Formulaire de filtres, rendu deux fois : en colonne sur grand écran, dans le
 * dépliant sur mobile. Les champs sont enveloppés dans leur `label`, donc le
 * doublon n'introduit aucun identifiant en conflit.
 *
 * Le tri en cours est reporté en champ caché, et la page n'est pas reportée :
 * changer de filtre repart de la première page, sinon on atterrit sur une
 * pagination qui n'existe plus.
 */
function FiltersForm({
  basePath,
  groups,
  sort,
  hasFilters,
}: {
  basePath: string
  groups: FilterGroup[]
  sort: SortKey
  hasFilters: boolean
}) {
  const available = groups.filter((group) => group.facets.length > 0)

  if (available.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-sm text-muted-strong">Aucun filtre disponible ici.</p>
        {hasFilters ? (
          <Link
            href={basePath}
            className="mt-2 inline-block text-sm font-semibold text-brand underline underline-offset-4"
          >
            Réinitialiser
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <form method="get" action={basePath} className="mt-3 flex flex-col gap-5">
      <input type="hidden" name="tri" value={sort} />

      {available.map((group) => (
        <fieldset key={group.key} className="min-w-0 border-0 p-0">
          <legend className="text-sm font-bold">{group.legend}</legend>
          <ul className="mt-1 flex flex-col">
            {group.facets.map((facet) => (
              <li key={facet.value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name={group.key}
                    value={facet.value}
                    defaultChecked={group.selected.includes(facet.value)}
                    className="size-5 shrink-0 rounded-xs border border-line-strong accent-brand"
                  />
                  <span>
                    {facet.label} <span className="text-muted">({facet.count})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}

      <Button type="submit" variant="secondary" block>
        Appliquer
      </Button>

      {hasFilters ? (
        <Link
          href={basePath}
          className="text-center text-sm font-semibold text-brand underline underline-offset-4"
        >
          Réinitialiser
        </Link>
      ) : null}
    </form>
  )
}
