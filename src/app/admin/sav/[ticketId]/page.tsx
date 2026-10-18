import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import type { TicketResolution, TicketStatus, TicketType } from '@prisma/client'
import { getStaffUser, requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { getAdminTicket } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Alert, Card } from '@/components/ui/Surface'

/**
 * Dossier d'une demande de service après-vente.
 *
 * Écran en lecture seule, et il le dit. Répondre au client, changer le statut,
 * accepter ou refuser un retour ne sont pas implémentés : plutôt qu'un bouton
 * qui échouerait, la page affiche une phrase qui annonce la limite.
 */

/* `cache` évite de jouer deux fois la même lecture entre les métadonnées et le
   rendu de la page. */
const loadTicket = cache((ticketId: string) => getAdminTicket(ticketId))

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

const statusCopy: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Ouverte', tone: 'warn' },
  WAITING_CUSTOMER: { label: 'Attente client', tone: 'neutral' },
  WAITING_RETURN: { label: 'Attente du retour', tone: 'neutral' },
  RECEIVED: { label: 'Colis reçu', tone: 'info' },
  APPROVED: { label: 'Acceptée', tone: 'ok' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
  CLOSED: { label: 'Clôturée', tone: 'neutral' },
}

const typeCopy: Record<TicketType, string> = {
  RETURN: 'Retour',
  WARRANTY: 'Garantie',
  CANCELLATION: 'Annulation',
  QUESTION: 'Question',
}

const resolutionCopy: Record<TicketResolution, string> = {
  EXCHANGE: 'Échange',
  REPLACEMENT: 'Remplacement',
  REFUND: 'Remboursement',
  REJECTED: 'Refus',
  NO_ACTION: 'Aucune action',
}

/* `authorKind` est une chaîne libre en base : on garde un repli lisible. */
const authorCopy: Record<string, string> = {
  staff: 'Équipe',
  customer: 'Client',
  system: 'Système',
}

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

/* -------------------------------------------------------------------------- */
/* Lecture prudente du champ Json `lines`                                     */
/* -------------------------------------------------------------------------- */

type OrderLineView = {
  id: string
  sku: string
  productName: string
  variantName: string
  quantity: number
}

type ConcernedLine = { key: string; label: string; quantity: number | null }

/**
 * `SupportTicket.lines` désigne les articles concernés par la demande, mais
 * aucune écriture n'en fixe encore la forme. On accepte donc les formes
 * plausibles — identifiants de lignes, références, objets portant leur propre
 * libellé — et tout ce qui n'est pas reconnu est ignoré. Si rien n'est
 * exploitable, la page écrit « articles non précisés » : c'est préférable à une
 * liste inventée, et préférable à un plantage.
 */
function readConcernedLines(value: unknown, orderLines: OrderLineView[]): ConcernedLine[] {
  if (!Array.isArray(value)) return []

  const byId = new Map(orderLines.map((line) => [line.id, line]))
  const bySku = new Map(orderLines.map((line) => [line.sku, line]))
  const labelOf = (line: OrderLineView) =>
    [line.productName, line.variantName].filter(Boolean).join(' — ')
  const quantityOf = (raw: unknown) =>
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null

  return value.flatMap((entry, index) => {
    const key = `ligne-${index}`

    if (typeof entry === 'string') {
      const line = byId.get(entry) ?? bySku.get(entry)
      return line ? [{ key, label: labelOf(line), quantity: line.quantity }] : []
    }

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []

    const raw = entry as Record<string, unknown>
    const text = (field: string) =>
      typeof raw[field] === 'string' ? (raw[field] as string).trim() : ''

    const reference = text('lineId') || text('orderLineId') || text('id') || text('sku')
    const line = reference ? (byId.get(reference) ?? bySku.get(reference)) : undefined
    const quantity = quantityOf(raw.quantity) ?? line?.quantity ?? null

    if (line) return [{ key, label: labelOf(line), quantity }]

    const own =
      [text('productName'), text('variantName')].filter(Boolean).join(' — ') || text('sku')
    return own ? [{ key, label: own, quantity }] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Métadonnées                                                                */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticketId: string }>
}): Promise<Metadata> {
  const { ticketId } = await params
  // `getStaffUser` plutôt que `requireStaff` : une redirection depuis les
  // métadonnées n'aurait pas de sens, c'est la page qui s'en charge. Le droit
  // est quand même vérifié, pour qu'une requête sans titre d'accès ne déclenche
  // aucune lecture du dossier.
  const staff = await getStaffUser()
  const ticket = staff && can(staff.role, 'sav.view') ? await loadTicket(ticketId) : null
  return {
    title: ticket ? `Demande ${ticket.reference}` : 'Demande',
    robots: { index: false, follow: false },
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const h2Class = 'text-sm font-bold'
const dtClass = 'text-xs font-semibold text-muted-strong'
const ddClass = 'mt-0.5 text-sm'

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  await requireStaff('sav.view')

  const { ticketId } = await params
  const ticket = await loadTicket(ticketId)
  if (!ticket) notFound()

  const state = statusCopy[ticket.status]
  const customerName = ticket.user
    ? [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ').trim()
    : ''
  const concerned = ticket.order ? readConcernedLines(ticket.lines, ticket.order.lines) : []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Breadcrumb
          items={[
            { label: 'Back-office', href: '/admin' },
            { label: 'SAV', href: '/admin/sav' },
            { label: ticket.reference },
          ]}
        />

        <h1 className="mt-2 text-xl font-extrabold">Demande {ticket.reference}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="dark">{typeCopy[ticket.type]}</Badge>
          <Badge tone={state.tone}>{state.label}</Badge>
          {ticket.resolution ? (
            <Badge tone="neutral">Issue : {resolutionCopy[ticket.resolution]}</Badge>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted-strong">
          Ouverte le{' '}
          <time dateTime={ticket.createdAt.toISOString()}>
            {dateTimeFormatter.format(ticket.createdAt)}
          </time>
          {ticket.closedAt ? (
            <>
              {' '}
              · clôturée le{' '}
              <time dateTime={ticket.closedAt.toISOString()}>
                {dateTimeFormatter.format(ticket.closedAt)}
              </time>
            </>
          ) : null}
        </p>
      </div>

      <Alert tone="info">
        Le traitement des demandes depuis le back-office n&apos;est pas encore disponible : cet
        écran est en lecture seule.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {/* -----------------------------------------------------------------
              Motif et description
              ----------------------------------------------------------------- */}
          <section aria-labelledby="sav-motif">
            <h2 id="sav-motif" className={h2Class}>
              Motif
            </h2>
            <Card className="mt-2 px-4 py-3">
              <p className="text-sm font-semibold">{ticket.reason}</p>
              {ticket.description ? (
                <p className="mt-2 text-sm whitespace-pre-line text-muted-strong">
                  {ticket.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">Aucune description fournie.</p>
              )}
            </Card>
          </section>

          {/* -----------------------------------------------------------------
              Échanges
              ----------------------------------------------------------------- */}
          <section aria-labelledby="sav-echanges">
            <h2 id="sav-echanges" className={h2Class}>
              Échanges
            </h2>

            {ticket.messages.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun message sur cette demande.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {ticket.messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.internal
                        ? 'rounded-md border border-line bg-surface-muted px-4 py-3'
                        : 'rounded-md border border-line px-4 py-3'
                    }
                  >
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-strong">
                      <span className="font-semibold">
                        {authorCopy[message.authorKind] ?? message.authorKind}
                      </span>
                      <span aria-hidden>·</span>
                      <time dateTime={message.createdAt.toISOString()}>
                        {dateTimeFormatter.format(message.createdAt)}
                      </time>
                      {message.internal ? <Badge tone="warn">Interne</Badge> : null}
                    </p>
                    <p className="mt-1.5 text-sm whitespace-pre-line">{message.body}</p>
                    {message.mediaIds.length > 0 ? (
                      <p className="mt-1.5 text-xs text-muted">
                        {message.mediaIds.length} pièce{message.mediaIds.length > 1 ? 's' : ''}{' '}
                        jointe{message.mediaIds.length > 1 ? 's' : ''} — affichage non disponible.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* -----------------------------------------------------------------
              Demandeur
              ----------------------------------------------------------------- */}
          <section aria-labelledby="sav-demandeur">
            <h2 id="sav-demandeur" className={h2Class}>
              Demandeur
            </h2>
            <Card className="mt-2 px-4 py-3">
              <dl className="flex flex-col gap-2.5">
                <div>
                  <dt className={dtClass}>Adresse e-mail</dt>
                  <dd className={`${ddClass} break-words`}>{ticket.email}</dd>
                </div>
                {customerName ? (
                  <div>
                    <dt className={dtClass}>Nom</dt>
                    <dd className={ddClass}>{customerName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className={dtClass}>Compte</dt>
                  <dd className={ddClass}>
                    {ticket.user ? (
                      <Link
                        href={`/admin/clients/${ticket.user.id}`}
                        className="inline-flex min-h-9 items-center underline decoration-line-strong underline-offset-4 hover:text-brand"
                      >
                        Voir la fiche client
                      </Link>
                    ) : (
                      <span className="text-muted-strong">
                        Aucun compte rattaché — demande déposée sans compte.
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          </section>

          {/* -----------------------------------------------------------------
              Commande liée
              ----------------------------------------------------------------- */}
          <section aria-labelledby="sav-commande">
            <h2 id="sav-commande" className={h2Class}>
              Commande liée
            </h2>
            <Card className="mt-2 px-4 py-3">
              {ticket.order ? (
                <>
                  <p className="text-sm">
                    <Link
                      href={`/admin/commandes/${ticket.order.id}`}
                      className="inline-flex min-h-9 items-center font-semibold underline decoration-line-strong underline-offset-4 hover:text-brand"
                    >
                      {ticket.order.reference}
                    </Link>
                    <span className="ml-2 text-muted-strong">
                      {formatPrice(ticket.order.totalCents)}
                    </span>
                  </p>

                  <p className={`${dtClass} mt-2.5`}>Articles concernés</p>
                  {concerned.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1 text-sm">
                      {concerned.map((line) => (
                        <li key={line.key} className="flex items-baseline justify-between gap-3">
                          <span>{line.label}</span>
                          {line.quantity !== null ? (
                            <span className="shrink-0 text-muted-strong tabular-nums">
                              × {line.quantity}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted">Articles non précisés.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">Aucune commande rattachée à cette demande.</p>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
