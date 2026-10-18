import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { listAdminProducts, type CatalogFilters } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { cn } from '@/lib/cn'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/Surface'

/**
 * Catalogue — liste de travail.
 *
 * Lecture seule : aucune action d'écriture n'existe encore côté back-office,
 * donc aucun bouton ne prétend le contraire. Le filtre de stock porte sur une
 * valeur dérivée (stock vendable, kits exclus) : il est appliqué avant la
 * pagination, pour que le total affiché corresponde à ce qu'on liste.
 */

export const metadata: Metadata = {
  title: 'Catalogue',
  robots: { index: false, follow: false },
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
}

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'warn',
  PUBLISHED: 'ok',
  ARCHIVED: 'neutral',
}

const STOCK_LABELS: Record<string, string> = {
  faible: 'Stock faible',
  rupture: 'En rupture',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

type SearchParams = Record<string, string | string[] | undefined>

function readOne(params: SearchParams, key: string): string | undefined {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Conserve les filtres courants dans les liens de pagination. */
function pageHref(filters: CatalogFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.stock) params.set('stock', filters.stock)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/catalogue?${query}` : '/admin/catalogue'
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('catalog.view')
  const params = await searchParams

  const statusParam = readOne(params, 'status')
  const stockParam = readOne(params, 'stock')
  const pageParam = Number.parseInt(readOne(params, 'page') ?? '1', 10)

  const filters: CatalogFilters = {
    q: readOne(params, 'q'),
    // Object.hasOwn, pas une lecture nue : « ?status=constructor » remonterait
    // la chaîne de prototypes et partirait en clause Prisma.
    status: statusParam && Object.hasOwn(STATUS_LABELS, statusParam) ? statusParam : undefined,
    stock: stockParam && Object.hasOwn(STOCK_LABELS, stockParam) ? stockParam : undefined,
    page: Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1,
  }

  const { items, total, page, pageCount } = await listAdminProducts(filters)
  const hasFilters = Boolean(filters.q || filters.status || filters.stock)

  return (
    <div className="container-page py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.5rem] leading-tight font-extrabold">Catalogue</h1>
      </header>

      <section aria-labelledby="filtres-catalogue" className="mt-4">
        <h2 id="filtres-catalogue" className="sr-only">
          Filtrer le catalogue
        </h2>
        <form
          method="get"
          className="flex flex-col gap-3 rounded-md border border-line bg-surface-soft p-3 sm:flex-row sm:items-end"
        >
          <TextField
            id="catalogue-q"
            name="q"
            label="Recherche"
            fieldSize="sm"
            defaultValue={filters.q ?? ''}
            placeholder="Nom, slug, culot, SKU"
            wrapperClassName="sm:w-72"
          />
          <SelectField
            id="catalogue-status"
            name="status"
            label="Statut"
            fieldSize="sm"
            defaultValue={filters.status ?? ''}
            wrapperClassName="sm:w-44"
          >
            <option value="">Tous les statuts</option>
            <option value="DRAFT">Brouillon</option>
            <option value="PUBLISHED">Publié</option>
            <option value="ARCHIVED">Archivé</option>
          </SelectField>
          <SelectField
            id="catalogue-stock"
            name="stock"
            label="Stock"
            fieldSize="sm"
            defaultValue={filters.stock ?? ''}
            wrapperClassName="sm:w-44"
          >
            <option value="">Tous les stocks</option>
            <option value="faible">Stock faible</option>
            <option value="rupture">En rupture</option>
          </SelectField>
          <div className="flex items-center gap-3 sm:pb-0.5">
            <Button type="submit" size="sm">
              Filtrer
            </Button>
            {hasFilters ? (
              <Link
                href="/admin/catalogue"
                className="inline-flex h-9 items-center text-sm font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
              >
                Réinitialiser
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="liste-catalogue" className="mt-5">
        <h2 id="liste-catalogue" className="text-base font-bold">
          Produits
        </h2>

        {items.length === 0 ? (
          <EmptyState
            className="mt-3"
            title="Aucun produit"
            description={
              hasFilters
                ? 'Aucun produit ne correspond à ces critères.'
                : "Le catalogue est vide. Il se peuple par le script d'amorçage."
            }
            action={hasFilters ? { label: 'Réinitialiser les filtres', href: '/admin/catalogue' } : undefined}
          />
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
              <thead className="bg-surface-soft text-xs text-muted-strong">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Produit</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Catégorie</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Statut</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Variantes</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Visuels</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Prix à partir de</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Stock vendable</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Modifié le</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  // Pastille de stock : elle porte sur la référence la PLUS FAIBLE
                  // du produit, pas sur le total affiché à côté. La rupture passe
                  // avant le seuil bas. L'état est aussi écrit, la couleur seule ne
                  // dit rien à un lecteur d'écran.
                  const stockState =
                    product.lowest === 0
                      ? { tone: 'text-danger', label: 'une référence en rupture' }
                      : product.lowest <= product.threshold
                        ? { tone: 'text-warn', label: 'une référence sous son seuil' }
                        : { tone: 'text-ok', label: 'toutes les références au-dessus du seuil' }

                  return (
                    <tr key={product.id} className="border-t border-line align-middle">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/catalogue/${product.id}`}
                          className="inline-flex min-h-9 flex-col justify-center font-semibold text-slate-ink underline-offset-4 hover:underline hover:text-brand"
                        >
                          <span className="flex items-center gap-2">
                            {product.name}
                            {product.isDemo ? <Badge tone="warn">démo</Badge> : null}
                          </span>
                          <span className="text-xs font-normal text-muted">{product.slug}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {product.categoryName ?? <span className="text-muted">non classé</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONES[product.status] ?? 'neutral'}>
                          {STATUS_LABELS[product.status] ?? product.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{product.variantCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{product.mediaCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number.isFinite(product.priceFromCents) ? (
                          formatPrice(product.priceFromCents)
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {product.variantCount === 0 ? (
                          <span className="text-muted">aucune variante</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 font-semibold',
                              stockState.tone,
                            )}
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                            {product.sellable}
                            <span className="sr-only"> — {stockState.label}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-strong">
                        {dateFormatter.format(product.updatedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            « Stock vendable » additionne les références qui portent un stock ; les kits n&apos;en
            portent pas, le leur se calcule depuis leurs composants. La pastille, elle, signale
            l&apos;état de la référence la plus faible : un produit peut afficher un total élevé et
            une pastille rouge si l&apos;une de ses références est à zéro.
          </p>
        ) : null}

        {pageCount > 1 ? (
          <nav aria-label="Pagination du catalogue" className="mt-3 flex items-center gap-3 text-sm">
            {page > 1 ? (
              <Link
                href={pageHref(filters, page - 1)}
                className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink"
              >
                Page précédente
              </Link>
            ) : null}
            <span className="text-muted-strong">
              Page {page} sur {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(filters, page + 1)}
                className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink"
              >
                Page suivante
              </Link>
            ) : null}
          </nav>
        ) : null}

        <p className="mt-4 text-sm text-muted-strong">
          La création et la modification des produits depuis le back-office ne sont pas encore
          disponibles ; le catalogue se peuple par le script d&apos;amorçage.
        </p>
      </section>
    </div>
  )
}
