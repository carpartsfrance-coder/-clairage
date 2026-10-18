import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { listCustomers } from '@/lib/queries/admin'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Card, EmptyState } from '@/components/ui/Surface'
import { IconUser } from '@/components/ui/icons'

/**
 * Liste des clients.
 *
 * Lecture seule : la recherche est un simple formulaire GET, l'état tient donc
 * dans l'URL et la page reste un composant serveur. Aucune requête Prisma ici,
 * tout passe par `listCustomers`.
 */

export const metadata: Metadata = {
  title: 'Clients',
  robots: { index: false, follow: false },
}

type SearchParams = Record<string, string | string[] | undefined>

function readOne(params: SearchParams, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('customers.view')

  const params = await searchParams
  const q = readOne(params, 'q')
  const page = Math.max(1, Number.parseInt(readOne(params, 'page'), 10) || 1)

  const { items, total, pageCount } = await listCustomers(q || undefined, page)

  // `page` vient de l'URL : rien n'interdit /admin/clients?page=99. Sans ce cas,
  // l'écran annonçait « Aucun client enregistré » juste sous le compte réel —
  // une page vide n'est pas un référentiel vide.
  const beyondLastPage = items.length === 0 && total > 0

  /** Conserve la recherche en changeant de page. */
  const pageHref = (target: number) => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (target > 1) next.set('page', String(target))
    const query = next.toString()
    return query ? `/admin/clients?${query}` : '/admin/clients'
  }

  return (
    <div className="container-page py-6">
      <h1 className="text-2xl font-extrabold">Clients</h1>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <TextField
          id="q"
          name="q"
          label="Nom, e-mail ou téléphone"
          defaultValue={q}
          fieldSize="sm"
          wrapperClassName="w-full max-w-sm"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" size="sm">
          Rechercher
        </Button>
        {q ? (
          <Link
            href="/admin/clients"
            aria-label="Effacer la recherche"
            className="inline-flex h-9 items-center px-2 text-sm underline underline-offset-4 hover:text-brand"
          >
            Effacer
          </Link>
        ) : null}
      </form>

      <p className="mt-3 text-sm text-muted-strong">
        {total} client{total > 1 ? 's' : ''}
        {q ? ' pour cette recherche' : ' avec un compte'}.
      </p>

      <section aria-labelledby="liste-clients" className="mt-4">
        <h2 id="liste-clients" className="sr-only">
          Résultats
        </h2>

        {items.length === 0 ? (
          <EmptyState
            icon={<IconUser className="size-8" />}
            title={
              beyondLastPage
                ? 'Cette page ne contient aucun client.'
                : q
                  ? 'Aucun client ne correspond.'
                  : 'Aucun client enregistré.'
            }
            description={
              beyondLastPage
                ? `La liste s'arrête à la page ${pageCount}.`
                : q
                  ? 'Vérifiez l’orthographe, ou cherchez sur une partie de l’e-mail seulement.'
                  : 'Les comptes clients apparaissent ici dès la première inscription.'
            }
            action={
              beyondLastPage ? { label: 'Revenir à la première page', href: pageHref(1) } : undefined
            }
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    E-mail
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Téléphone
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Commandes
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Demandes SAV
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Inscrit le
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Actif
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => {
                  const fullName = [customer.firstName, customer.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim()
                  return (
                    <tr key={customer.id} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/admin/clients/${customer.id}`}
                          className="inline-flex min-h-9 items-center font-medium underline underline-offset-4 hover:text-brand"
                        >
                          {fullName || '—'}
                          {fullName ? null : (
                            <span className="sr-only">Fiche de {customer.email}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-muted-strong">{customer.email}</td>
                      <td className="px-3 py-1.5 text-muted-strong">{customer.phone ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {customer._count.orders}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {customer._count.tickets}
                      </td>
                      <td className="px-3 py-1.5 text-muted-strong">
                        {dateFormatter.format(customer.createdAt)}
                      </td>
                      <td className="px-3 py-1.5">
                        {customer.active ? (
                          <Badge tone="ok">Actif</Badge>
                        ) : (
                          <Badge tone="danger">Désactivé</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}

        {pageCount > 1 && items.length > 0 ? (
          <nav aria-label="Pagination" className="mt-4 flex items-center gap-3 text-sm">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 hover:border-slate-ink"
              >
                Page précédente
              </Link>
            ) : null}
            <span className="text-muted-strong">
              Page {page} sur {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(page + 1)}
                className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 hover:border-slate-ink"
              >
                Page suivante
              </Link>
            ) : null}
          </nav>
        ) : null}

        <p className="mt-4 text-xs text-muted">
          Les commandes passées sans compte n&apos;apparaissent pas ici ; elles se retrouvent depuis
          la liste des commandes.
        </p>
      </section>
    </div>
  )
}
