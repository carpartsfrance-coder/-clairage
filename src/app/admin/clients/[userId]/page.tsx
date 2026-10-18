import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStaffUser, requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { getAdminCustomer } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'
import { IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Fiche client.
 *
 * Dossier complet en lecture : coordonnées, adresses, commandes, véhicules,
 * demandes SAV et notes internes. Les liens vers les autres écrans ne sont
 * rendus que si le rôle peut les ouvrir — un lien qui renverrait vers un refus
 * n'aide personne. Le contrôle réel reste côté page cible.
 */

type Params = Promise<{ userId: string }>

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

const paymentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'warn' },
  AUTHORIZED: { label: 'Autorisée', tone: 'warn' },
  PAID: { label: 'Payée', tone: 'ok' },
  PARTIALLY_REFUNDED: { label: 'Part. remboursée', tone: 'neutral' },
  REFUNDED: { label: 'Remboursée', tone: 'neutral' },
  FAILED: { label: 'Refusée', tone: 'danger' },
  EXPIRED: { label: 'Expirée', tone: 'danger' },
}

const fulfillmentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  UNFULFILLED: { label: 'À préparer', tone: 'neutral' },
  PARTIALLY_FULFILLED: { label: 'Part. expédiée', tone: 'warn' },
  FULFILLED: { label: 'Expédiée', tone: 'ok' },
  RETURNED: { label: 'Retournée', tone: 'neutral' },
}

const ticketTypeLabels: Record<string, string> = {
  RETURN: 'Retour',
  WARRANTY: 'Garantie',
  CANCELLATION: 'Annulation',
  QUESTION: 'Question',
}

const ticketStatusCopy: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Ouverte', tone: 'warn' },
  WAITING_CUSTOMER: { label: 'Attente client', tone: 'warn' },
  WAITING_RETURN: { label: 'Attente du retour', tone: 'warn' },
  RECEIVED: { label: 'Colis reçu', tone: 'neutral' },
  APPROVED: { label: 'Acceptée', tone: 'ok' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
  CLOSED: { label: 'Clôturée', tone: 'neutral' },
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  // `generateMetadata` s'exécute hors de la garde de la page : on revérifie le
  // droit avant de mettre une adresse e-mail dans un titre.
  const staff = await getStaffUser()
  const robots = { index: false, follow: false }
  if (!can(staff?.role, 'customers.view')) return { title: 'Client', robots }

  const { userId } = await params
  const customer = await getAdminCustomer(userId)
  return { title: customer?.email ?? 'Client', robots }
}

export default async function AdminClientPage({ params }: { params: Params }) {
  const staff = await requireStaff('customers.view')
  const { userId } = await params
  const customer = await getAdminCustomer(userId)
  if (!customer) notFound()

  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
  const canSeeOrders = can(staff.role, 'orders.view')
  const canSeeTickets = can(staff.role, 'sav.view')

  return (
    <div className="container-page py-6">
      <Breadcrumb
        items={[
          { label: 'Administration', href: '/admin' },
          { label: 'Clients', href: '/admin/clients' },
          { label: customer.email },
        ]}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">{fullName || customer.email}</h1>
        {customer.active ? null : <Badge tone="danger">Compte désactivé</Badge>}
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="coordonnees">
          <h2 id="coordonnees" className="text-lg font-bold">
            Coordonnées
          </h2>
          <Card className="mt-3 p-4 text-sm">
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">E-mail</dt>
                <dd className="font-medium">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Téléphone</dt>
                <dd className="font-medium">{customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Inscrit le</dt>
                <dd className="font-medium">{dateTimeFormatter.format(customer.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Dernière connexion</dt>
                <dd className="font-medium">
                  {customer.lastLoginAt
                    ? dateTimeFormatter.format(customer.lastLoginAt)
                    : 'Jamais connecté'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Compte</dt>
                <dd className="font-medium">{customer.active ? 'Actif' : 'Désactivé'}</dd>
              </div>
            </dl>
          </Card>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="adresses">
          <h2 id="adresses" className="text-lg font-bold">
            Adresses
          </h2>
          {customer.addresses.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">Aucune adresse enregistrée.</p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customer.addresses.map((address) => (
                <Card as="li" key={address.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {address.label ? (
                      <span className="font-semibold">{address.label}</span>
                    ) : null}
                    {address.isDefaultShipping ? <Badge tone="neutral">Par défaut</Badge> : null}
                  </div>
                  <p className="mt-1 font-medium">
                    {address.firstName} {address.lastName}
                  </p>
                  {address.company ? (
                    <p className="text-muted-strong">{address.company}</p>
                  ) : null}
                  <p className="text-muted-strong">{address.line1}</p>
                  {address.line2 ? <p className="text-muted-strong">{address.line2}</p> : null}
                  <p className="text-muted-strong">
                    {address.postalCode} {address.city} — {address.country}
                  </p>
                  {address.phone ? <p className="text-muted-strong">{address.phone}</p> : null}
                </Card>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="commandes">
          <h2 id="commandes" className="text-lg font-bold">
            Commandes
          </h2>
          {customer.orders.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">Aucune commande.</p>
          ) : (
            <>
              <Card className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Référence
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Date
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Total
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Paiement
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Préparation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.orders.map((order) => {
                      const payment = paymentCopy[order.paymentStatus]
                      const fulfillment = fulfillmentCopy[order.fulfillmentStatus]
                      return (
                        <tr key={order.id} className="border-b border-line last:border-b-0">
                          <td className="px-3 py-1.5">
                            {canSeeOrders ? (
                              <Link
                                href={`/admin/commandes/${order.id}`}
                                className="inline-flex min-h-9 items-center font-medium underline underline-offset-4 hover:text-brand"
                              >
                                {order.reference}
                              </Link>
                            ) : (
                              <span className="font-medium">{order.reference}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-strong">
                            {dateFormatter.format(order.placedAt ?? order.createdAt)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {formatPrice(order.totalCents, { alwaysDecimals: true })}
                          </td>
                          <td className="px-3 py-1.5">
                            {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            {fulfillment ? (
                              <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
              {customer.orders.length === 20 ? (
                <p className="mt-2 text-xs text-muted">
                  Les vingt commandes les plus récentes ; la liste complète est dans les commandes.
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="vehicules">
          <h2 id="vehicules" className="text-lg font-bold">
            Véhicules enregistrés
          </h2>
          {customer.savedVehicles.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">Aucun véhicule enregistré.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {customer.savedVehicles.map((saved) => {
                const generation = saved.configuration.generation
                const make = generation.model.make
                return (
                  <Card as="li" key={saved.id} className="flex items-start gap-2 p-3 text-sm">
                    {make.type === 'MOTORCYCLE' ? (
                      <IconMotorcycle className="mt-0.5 size-4 shrink-0 text-muted-strong" />
                    ) : (
                      <IconCar className="mt-0.5 size-4 shrink-0 text-muted-strong" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {make.name} {generation.model.name} — {generation.name}
                      </p>
                      <p className="text-muted-strong">
                        Équipement d&apos;origine : {saved.configuration.equipment.label}
                      </p>
                      {saved.nickname || saved.plate ? (
                        <p className="text-xs text-muted">
                          {[saved.nickname, saved.plate].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </Card>
                )
              })}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="sav">
          <h2 id="sav" className="text-lg font-bold">
            Demandes SAV
          </h2>
          {customer.tickets.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">Aucune demande SAV.</p>
          ) : (
            <>
              <Card className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Référence
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Type
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Statut
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.tickets.map((ticket) => {
                      const status = ticketStatusCopy[ticket.status]
                      return (
                        <tr key={ticket.id} className="border-b border-line last:border-b-0">
                          <td className="px-3 py-1.5">
                            {canSeeTickets ? (
                              <Link
                                href={`/admin/sav/${ticket.id}`}
                                className="inline-flex min-h-9 items-center font-medium underline underline-offset-4 hover:text-brand"
                              >
                                {ticket.reference}
                              </Link>
                            ) : (
                              <span className="font-medium">{ticket.reference}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-strong">
                            {ticketTypeLabels[ticket.type] ?? ticket.type}
                          </td>
                          <td className="px-3 py-1.5">
                            {status ? <Badge tone={status.tone}>{status.label}</Badge> : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-muted-strong">
                            {dateFormatter.format(ticket.createdAt)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
              {/* La requête en prend vingt : sans ce rappel, une liste tronquée
                  se lirait comme le dossier SAV complet du client. */}
              {customer.tickets.length === 20 ? (
                <p className="mt-2 text-xs text-muted">Les vingt demandes les plus récentes.</p>
              ) : null}
            </>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="notes">
          <h2 id="notes" className="text-lg font-bold">
            Notes internes
          </h2>
          <p className="mt-1 text-sm text-muted-strong">
            Notes internes : le client ne les voit jamais.
          </p>

          {customer.notes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">Aucune note.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {customer.notes.map((note) => (
                <Card as="li" key={note.id} className="p-3 text-sm">
                  <p className="text-xs text-muted">{dateTimeFormatter.format(note.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-line">{note.body}</p>
                </Card>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-muted">
            L&apos;ajout de notes depuis le back-office n&apos;est pas encore disponible.
          </p>
        </section>
      </div>
    </div>
  )
}
