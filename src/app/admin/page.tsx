import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, Card } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { requireStaff } from '@/lib/admin/guard'
import { can, PERMISSIONS, type Permission } from '@/lib/admin/permissions'
import { getDashboard, PERIOD_LABELS, type Metric, type Period } from '@/lib/admin/metrics'
import { formatPrice } from '@/lib/identity'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Tableau de bord',
  robots: { index: false, follow: false },
}

/* -------------------------------------------------------------------------- */
/* Utilitaires locaux                                                         */
/* -------------------------------------------------------------------------- */

const PERIODS = Object.keys(PERIOD_LABELS) as Period[]

function readPeriod(value: string | undefined): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : '30d'
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})

function formatDate(date: Date | null): string {
  return date ? dateFormat.format(date) : '—'
}

/**
 * Droit nécessaire pour suivre le lien d'un indicateur. Un indicateur dont la
 * destination est fermée au rôle reste affiché — le chiffre est une
 * information utile — mais il n'est plus cliquable : un lien qui renverrait
 * aussitôt sur un refus serait une fausse promesse.
 */
const LINK_PERMISSION: Record<string, Permission> = {
  toPrepare: 'orders.fulfil',
  pendingPayments: 'orders.view',
  openTickets: 'sav.view',
  lowStock: 'catalog.view',
  outOfStock: 'catalog.view',
}

function MetricCard({ metric, href }: { metric: Metric; href?: string }) {
  const value =
    metric.kind === 'money' ? formatPrice(metric.value) : metric.value.toLocaleString('fr-FR')
  const toneClass =
    metric.tone === 'danger' ? 'text-danger' : metric.tone === 'warn' ? 'text-warn' : 'text-slate-ink'

  // La définition est toujours rendue : un chiffre d'affaires sans sa
  // définition ne veut rien dire (TTC ? port compris ? quelle date ?).
  const body = (
    <>
      <p className="text-xs font-semibold text-muted-strong">{metric.label}</p>
      <p className={cn('mt-1 text-2xl leading-tight font-extrabold tabular-nums', toneClass)}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted">{metric.definition}</p>
    </>
  )

  if (href) {
    return (
      <Card interactive className="h-full">
        <Link href={href} className="block h-full px-3 py-2.5">
          {body}
        </Link>
      </Card>
    )
  }

  return <Card className="h-full px-3 py-2.5">{body}</Card>
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; refus?: string }>
}) {
  const staff = await requireStaff('dashboard.view')
  const { periode, refus } = await searchParams
  const period = readPeriod(periode)
  const data = await getDashboard(period)

  const metrics: Metric[] = [
    data.revenue,
    data.averageBasket,
    data.paidOrders,
    data.refunds,
    data.toPrepare,
    data.pendingPayments,
    data.openTickets,
    data.lowStock,
    data.outOfStock,
  ]

  const canSeeOrders = can(staff.role, 'orders.view')
  const canSeeCatalog = can(staff.role, 'catalog.view')
  // L'adresse du client est une donnée client : sans `customers.view`, la
  // colonne n'est pas rendue. Un rôle qui n'a pas accès à /admin/clients ne
  // doit pas récolter les adresses par le tableau de bord.
  const canSeeCustomers = can(staff.role, 'customers.view')

  // `refus` vient de l'URL : on ne réaffiche que ce qui est un droit connu,
  // sinon n'importe qui pourrait faire afficher n'importe quel texte dans ce
  // bandeau — et annoncer un enregistrement au journal qui n'a pas eu lieu.
  const denied = PERMISSIONS.includes(refus as Permission) ? (refus as Permission) : null

  return (
    <div className="flex flex-col gap-6">
      {denied ? (
        <Alert tone="warn" title="Votre rôle ne donne pas accès à cette section." live="polite">
          Droit demandé : <span className="font-semibold">{denied}</span>. La tentative a été
          enregistrée dans le journal d&apos;administration.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">Tableau de bord</h1>
          <p className="mt-0.5 text-xs text-muted">
            {PERIOD_LABELS[period]} · depuis le {formatDate(data.periodFrom)}
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <SelectField
            id="periode"
            name="periode"
            label="Période"
            defaultValue={period}
            fieldSize="sm"
            wrapperClassName="w-52"
          >
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="secondary" size="sm">
            Afficher
          </Button>
        </form>
      </div>

      {/* ---------------- Indicateurs ---------------- */}
      <section aria-labelledby="titre-indicateurs">
        <h2 id="titre-indicateurs" className="sr-only">
          Indicateurs de la période
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const permission = LINK_PERMISSION[metric.key]
            const href =
              metric.href && (!permission || can(staff.role, permission)) ? metric.href : undefined
            return <MetricCard key={metric.key} metric={metric} href={href} />
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Toutes les commandes payées sont comptées, y compris celles réglées en mode test : c&apos;est
          le paiement qui porte cet indicateur, pas la commande.
        </p>
      </section>

      {/* ---------------- Commandes payées non expédiées ---------------- */}
      <section aria-labelledby="titre-expedier">
        <h2 id="titre-expedier" className="text-base font-bold">
          Commandes payées en attente d&apos;expédition
        </h2>

        {data.oldestUnfulfilled.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">Rien à expédier.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-left text-xs text-muted-strong">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Référence
                  </th>
                  {canSeeCustomers ? (
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Client
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Payée le
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Âge
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.oldestUnfulfilled.map((order) => {
                  const late = order.ageDays > 3
                  return (
                    <tr key={order.id} className="border-t border-line hover:bg-surface-soft">
                      <td className="px-3 py-1.5">
                        {canSeeOrders ? (
                          <Link
                            href={`/admin/commandes/${order.id}`}
                            className="inline-flex h-9 items-center font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
                          >
                            {order.reference}
                          </Link>
                        ) : (
                          <span className="font-semibold">{order.reference}</span>
                        )}
                      </td>
                      {canSeeCustomers ? (
                        <td className="px-3 py-1.5 text-muted-strong">{order.email}</td>
                      ) : null}
                      <td className="px-3 py-1.5 text-muted-strong tabular-nums">
                        {formatDate(order.placedAt)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-1.5 tabular-nums',
                          late ? 'font-semibold text-danger' : 'text-muted-strong',
                        )}
                      >
                        {order.ageDays} j{late ? ' · en retard' : ''}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatPrice(order.totalCents, { alwaysDecimals: true })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Stocks faibles ---------------- */}
      <section aria-labelledby="titre-stocks">
        <h2 id="titre-stocks" className="text-base font-bold">
          Stocks faibles
        </h2>

        {data.lowStockVariants.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">Aucun stock sous son seuil d&apos;alerte.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-left text-xs text-muted-strong">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Référence
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Produit
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Vendable
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Seuil
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockVariants.map((variant) => (
                  <tr key={variant.id} className="border-t border-line hover:bg-surface-soft">
                    <td className="px-3 py-1.5">
                      {canSeeCatalog ? (
                        <Link
                          href={`/admin/catalogue?q=${encodeURIComponent(variant.sku)}`}
                          className="inline-flex h-9 items-center font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
                        >
                          {variant.sku}
                        </Link>
                      ) : (
                        <span className="font-semibold">{variant.sku}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-strong">{variant.productName}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-warn tabular-nums">
                      {variant.sellable}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-strong tabular-nums">
                      {variant.threshold}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
