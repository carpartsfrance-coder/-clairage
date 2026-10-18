import type { Metadata } from 'next'
import Link from 'next/link'
import type { TicketStatus, TicketType } from '@prisma/client'
import { requireStaff } from '@/lib/admin/guard'
import { listTickets } from '@/lib/queries/admin'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Card, EmptyState } from '@/components/ui/Surface'

/**
 * File des demandes de service après-vente.
 *
 * Écran de lecture : le traitement d'une demande (répondre, changer de statut,
 * accepter un retour) n'est pas implémenté, et aucun bouton ne le laisse
 * croire. Le droit exigé est donc `sav.view`, le plus précis qui convienne.
 */

export const metadata: Metadata = {
  title: 'SAV',
  robots: { index: false, follow: false },
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

// `Record` plutôt qu'un objet libre : TypeScript refuse de compiler si un
// statut de l'énumération Prisma n'a pas son libellé.
const statusCopy: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Ouverte', tone: 'warn' },
  WAITING_CUSTOMER: { label: 'Attente client', tone: 'neutral' },
  WAITING_RETURN: { label: 'Attente du retour', tone: 'neutral' },
  RECEIVED: { label: 'Colis reçu', tone: 'info' },
  APPROVED: { label: 'Acceptée', tone: 'ok' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
  CLOSED: { label: 'Clôturée', tone: 'neutral' },
}

const STATUS_ORDER: readonly TicketStatus[] = [
  'OPEN',
  'WAITING_CUSTOMER',
  'WAITING_RETURN',
  'RECEIVED',
  'APPROVED',
  'REJECTED',
  'CLOSED',
]

const typeCopy: Record<TicketType, string> = {
  RETURN: 'Retour',
  WARRANTY: 'Garantie',
  CANCELLATION: 'Annulation',
  QUESTION: 'Question',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

/**
 * Le statut est repris de l'URL : on ne le transmet à la requête que s'il
 * appartient à l'énumération. Une valeur libre finirait dans un `where`
 * Prisma, où elle provoquerait une erreur plutôt qu'un filtre vide.
 */
function readStatus(raw: string | string[] | undefined): TicketStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return STATUS_ORDER.find((status) => status === value)
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'

export default async function AdminSavPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireStaff('sav.view')

  const status = readStatus((await searchParams).statut)
  const tickets = await listTickets(status)
  const plural = tickets.length > 1 ? 's' : ''

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">Service après-vente</h1>
        <p className="mt-1 text-sm text-muted-strong">
          {status
            ? `${tickets.length} demande${plural} au statut « ${statusCopy[status].label} ».`
            : `${tickets.length} demande${plural} en cours. Les demandes clôturées et refusées ne sont pas listées par défaut.`}
        </p>
      </div>

      {/* Filtre en GET : l'état du filtre reste dans l'URL, donc partageable. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <SelectField
          id="statut"
          name="statut"
          label="Statut"
          fieldSize="sm"
          defaultValue={status ?? ''}
          wrapperClassName="w-full sm:w-72"
        >
          <option value="">En cours</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusCopy[value].label}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary" size="sm">
          Filtrer
        </Button>
      </form>

      {tickets.length === 0 ? (
        <EmptyState title={status ? 'Aucune demande avec ce statut.' : 'Aucune demande en cours.'} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <caption className="sr-only">Demandes de service après-vente</caption>
              <thead>
                <tr className="border-b border-line bg-surface-soft">
                  <th scope="col" className={thClass}>
                    Référence
                  </th>
                  <th scope="col" className={thClass}>
                    Type
                  </th>
                  <th scope="col" className={thClass}>
                    Commande
                  </th>
                  <th scope="col" className={thClass}>
                    Motif
                  </th>
                  <th scope="col" className={thClass}>
                    Statut
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Messages
                  </th>
                  <th scope="col" className={thClass}>
                    Ouvert le
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const state = statusCopy[ticket.status]
                  return (
                    <tr key={ticket.id} className="border-b border-line last:border-b-0">
                      <th scope="row" className={`${tdClass} text-left font-semibold`}>
                        <Link
                          href={`/admin/sav/${ticket.id}`}
                          className="inline-flex min-h-9 items-center text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand"
                        >
                          {ticket.reference}
                        </Link>
                      </th>
                      <td className={tdClass}>{typeCopy[ticket.type]}</td>
                      <td className={tdClass}>
                        {ticket.order ? (
                          <Link
                            href={`/admin/commandes/${ticket.order.id}`}
                            className="inline-flex min-h-9 items-center underline decoration-line-strong underline-offset-4 hover:text-brand"
                          >
                            {ticket.order.reference}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className="block max-w-[26rem]">{ticket.reason}</span>
                      </td>
                      <td className={tdClass}>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </td>
                      <td className={`${tdClass} text-right tabular-nums`}>
                        {ticket._count.messages}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-muted-strong`}>
                        <time dateTime={ticket.createdAt.toISOString()}>
                          {dateFormatter.format(ticket.createdAt)}
                        </time>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
