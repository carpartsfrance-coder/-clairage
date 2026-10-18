import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { listOrders, type OrderFilters } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Surface'
import { SelectField, TextField } from '@/components/ui/Field'

/**
 * Liste des commandes.
 *
 * Aucune requête Prisma n'est écrite ici : la lecture passe par
 * `listOrders`, et l'accès par `requireStaff`. Les valeurs de filtre venant
 * de l'URL sont confrontées aux listes ci-dessous avant d'être transmises :
 * une valeur inconnue est ignorée, pas passée telle quelle à la base — sinon
 * un paramètre fantaisiste vide la liste sans que l'écran l'explique.
 */

export const metadata: Metadata = {
  title: 'Commandes',
  robots: { index: false, follow: false },
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

/*
  Tons : payé ou expédié → ok, en attente → warn, échoué ou annulé → danger,
  le reste → neutral. Un statut intermédiaire n'est ni une bonne ni une
  mauvaise nouvelle, et la couleur ne doit pas en inventer une.
*/
const statusCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'warn' },
  CONFIRMED: { label: 'Confirmée', tone: 'neutral' },
  PROCESSING: { label: 'En préparation', tone: 'neutral' },
  SHIPPED: { label: 'Expédiée', tone: 'ok' },
  DELIVERED: { label: 'Livrée', tone: 'ok' },
  CANCELLED: { label: 'Annulée', tone: 'danger' },
}

const paymentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'warn' },
  AUTHORIZED: { label: 'Autorisé', tone: 'warn' },
  PAID: { label: 'Payé', tone: 'ok' },
  PARTIALLY_REFUNDED: { label: 'Partiellement remboursé', tone: 'neutral' },
  REFUNDED: { label: 'Remboursé', tone: 'neutral' },
  FAILED: { label: 'Échoué', tone: 'danger' },
  EXPIRED: { label: 'Expiré', tone: 'danger' },
}

const fulfillmentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  UNFULFILLED: { label: 'À préparer', tone: 'neutral' },
  PARTIALLY_FULFILLED: { label: 'Partiellement expédiée', tone: 'warn' },
  FULFILLED: { label: 'Expédiée', tone: 'ok' },
  RETURNED: { label: 'Retournée', tone: 'neutral' },
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

/* -------------------------------------------------------------------------- */
/* Lecture des paramètres d'URL                                               */
/* -------------------------------------------------------------------------- */

type RawParams = Record<string, string | string[] | undefined>

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** Une valeur hors liste est écartée : la base ne voit que des codes connus. */
function pick(value: string, allowed: Record<string, unknown>): string | undefined {
  return value && value in allowed ? value : undefined
}

/** Date au format aaaa-mm-jj uniquement : le reste n'est pas une date. */
function pickDate(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function readFilters(raw: RawParams): OrderFilters {
  const page = Number.parseInt(one(raw.page), 10)
  return {
    q: one(raw.q) || undefined,
    status: pick(one(raw.status), statusCopy),
    // Le tableau de bord renvoie ?paiement=PENDING : les deux noms marchent.
    payment: pick(one(raw.payment) || one(raw.paiement), paymentCopy),
    fulfillment: pick(one(raw.fulfillment), fulfillmentCopy),
    from: pickDate(one(raw.from)),
    to: pickDate(one(raw.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/** Lien de pagination : les filtres en cours sont conservés. */
function pageHref(filters: OrderFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.payment) params.set('payment', filters.payment)
  if (filters.fulfillment) params.set('fulfillment', filters.fulfillment)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/commandes?${query}` : '/admin/commandes'
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawParams>
}) {
  await requireStaff('orders.view')

  const raw = await searchParams
  const filters = readFilters(raw)
  const { items, total, page, pageCount } = await listOrders(filters)

  const filtered = Boolean(
    filters.q || filters.status || filters.payment || filters.fulfillment || filters.from || filters.to,
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-extrabold">Commandes</h1>

      {/* ------------------------------------------------------------------
          Recherche et filtres — un formulaire GET : l'URL reste partageable
          et le bouton « retour » du navigateur fonctionne.
          ------------------------------------------------------------------ */}
      <Card className="p-3">
        <form method="get" className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <TextField
              id="filtre-q"
              name="q"
              label="Recherche"
              fieldSize="sm"
              defaultValue={filters.q ?? ''}
              placeholder="Référence, e-mail ou référence d'article"
              wrapperClassName="sm:col-span-2"
            />

            <SelectField
              id="filtre-statut"
              name="status"
              label="Statut"
              fieldSize="sm"
              defaultValue={filters.status ?? ''}
            >
              <option value="">Tous</option>
              {Object.entries(statusCopy).map(([code, copy]) => (
                <option key={code} value={code}>
                  {copy.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="filtre-paiement"
              name="payment"
              label="Paiement"
              fieldSize="sm"
              defaultValue={filters.payment ?? ''}
            >
              <option value="">Tous</option>
              {Object.entries(paymentCopy).map(([code, copy]) => (
                <option key={code} value={code}>
                  {copy.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="filtre-preparation"
              name="fulfillment"
              label="Préparation"
              fieldSize="sm"
              defaultValue={filters.fulfillment ?? ''}
            >
              <option value="">Toutes</option>
              {Object.entries(fulfillmentCopy).map(([code, copy]) => (
                <option key={code} value={code}>
                  {copy.label}
                </option>
              ))}
            </SelectField>

            <div className="grid grid-cols-2 gap-3 sm:col-span-2 xl:col-span-1">
              <TextField
                id="filtre-du"
                name="from"
                label="Du"
                type="date"
                fieldSize="sm"
                defaultValue={filters.from ?? ''}
              />
              <TextField
                id="filtre-au"
                name="to"
                label="Au"
                type="date"
                fieldSize="sm"
                defaultValue={filters.to ?? ''}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm">
              Filtrer
            </Button>
            <Link
              href="/admin/commandes"
              className="inline-flex min-h-9 items-center text-sm font-semibold text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand"
            >
              Réinitialiser
            </Link>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------------
          Résultats
          ------------------------------------------------------------------ */}
      <section aria-labelledby="commandes-resultats" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="commandes-resultats" className="text-sm font-semibold">
            {total} commande{total === 1 ? '' : 's'}
            {filtered ? <span className="text-muted"> correspondant aux filtres</span> : null}
          </h2>
          {/* Aucune route d'export n'existe : on le dit plutôt que d'afficher
              un bouton qui ne ferait rien. */}
          <p className="text-xs text-muted">L&apos;export comptable n&apos;est pas encore disponible.</p>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Aucune commande"
            description={
              filtered
                ? 'Aucune commande ne correspond à ces filtres sur cette période.'
                : "Aucune commande n'a encore été enregistrée."
            }
            action={filtered ? { label: 'Réinitialiser les filtres', href: '/admin/commandes' } : undefined}
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-line bg-surface-soft">
                <tr>
                  <th scope="col" className={thClass}>
                    Référence
                  </th>
                  <th scope="col" className={thClass}>
                    Date
                  </th>
                  <th scope="col" className={thClass}>
                    Client
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Articles
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Total
                  </th>
                  <th scope="col" className={thClass}>
                    Paiement
                  </th>
                  <th scope="col" className={thClass}>
                    Préparation
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const status = statusCopy[order.status]
                  const payment = paymentCopy[order.paymentStatus]
                  const fulfillment = fulfillmentCopy[order.fulfillmentStatus]
                  return (
                    <tr key={order.id} className="border-b border-line last:border-0 hover:bg-surface-soft">
                      <td className={tdClass}>
                        <Link
                          href={`/admin/commandes/${order.id}`}
                          className="inline-flex min-h-9 items-center font-semibold text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand"
                        >
                          {order.reference}
                        </Link>
                        {status ? (
                          <span className="mt-0.5 block">
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-muted-strong`}>
                        {dateFormatter.format(order.placedAt ?? order.createdAt)}
                      </td>
                      <td className={`${tdClass} max-w-[18rem]`}>
                        <span className="block truncate">{order.email}</span>
                        {order.hasAccount ? null : (
                          <span className="block text-xs text-muted">sans compte</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right tabular-nums`}>{order.itemCount}</td>
                      <td className={`${tdClass} text-right font-semibold tabular-nums whitespace-nowrap`}>
                        {formatPrice(order.totalCents)}
                      </td>
                      <td className={tdClass}>
                        {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : null}
                      </td>
                      <td className={tdClass}>
                        {fulfillment ? (
                          <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Pagination par liens : navigable sans JavaScript, et chaque page a
            son URL. */}
        {pageCount > 1 ? (
          <nav aria-label="Pagination" className="flex flex-wrap items-center gap-3 text-sm">
            {page > 1 ? (
              <Link
                href={pageHref(filters, page - 1)}
                className="inline-flex min-h-9 items-center font-semibold underline decoration-line-strong underline-offset-4 hover:text-brand"
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
                className="inline-flex min-h-9 items-center font-semibold underline decoration-line-strong underline-offset-4 hover:text-brand"
              >
                Page suivante
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  )
}
