import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getStaffUser, requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { getAdminOrder } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'
import { CancelForm, NoteForm, RefundForm, ShipForm } from '@/components/admin/OrderActions'

/**
 * Dossier complet d'une commande.
 *
 * C'est la vue de travail : elle montre tout, y compris les notes internes et
 * les événements techniques que l'espace client ne rend pas. Deux réserves
 * malgré cela :
 *
 *   - la référence du paiement chez le prestataire n'est jamais affichée en
 *     entier : elle identifie la transaction, et la lire n'est pas nécessaire
 *     pour travailler ;
 *   - un formulaire d'action n'est monté que si le rôle a le droit
 *     correspondant — y compris la note interne, qui relève de
 *     'customers.note' et non de 'orders.view'. Les actions revérifient de
 *     leur côté : ce masquage n'est pas la protection, c'est l'honnêteté de
 *     l'interface. Attention, `addOrderNote` n'exige aujourd'hui que
 *     'orders.view' ; c'est à resserrer dans lib/actions/admin-orders.
 */

/* `cache` évite de jouer la requête deux fois (métadonnées puis page). */
const loadOrder = cache((orderId: string) => getAdminOrder(orderId))

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

const statusCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'warn' },
  CONFIRMED: { label: 'Confirmée', tone: 'neutral' },
  PROCESSING: { label: 'En préparation', tone: 'neutral' },
  SHIPPED: { label: 'Expédiée', tone: 'ok' },
  DELIVERED: { label: 'Livrée', tone: 'ok' },
  CANCELLED: { label: 'Annulée', tone: 'danger' },
}

const paymentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Paiement en attente', tone: 'warn' },
  AUTHORIZED: { label: 'Paiement autorisé', tone: 'warn' },
  PAID: { label: 'Payée', tone: 'ok' },
  PARTIALLY_REFUNDED: { label: 'Partiellement remboursée', tone: 'neutral' },
  REFUNDED: { label: 'Remboursée', tone: 'neutral' },
  FAILED: { label: 'Paiement échoué', tone: 'danger' },
  EXPIRED: { label: 'Paiement expiré', tone: 'danger' },
}

const fulfillmentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  UNFULFILLED: { label: 'À préparer', tone: 'neutral' },
  PARTIALLY_FULFILLED: { label: 'Partiellement expédiée', tone: 'warn' },
  FULFILLED: { label: 'Expédiée', tone: 'ok' },
  RETURNED: { label: 'Retournée', tone: 'neutral' },
}

/** Statut d'une ligne de paiement, en version courte. */
const paymentLineCopy: Record<string, string> = {
  PENDING: 'En attente',
  AUTHORIZED: 'Autorisé',
  PAID: 'Payé',
  PARTIALLY_REFUNDED: 'Partiellement remboursé',
  REFUNDED: 'Remboursé',
  FAILED: 'Échoué',
  EXPIRED: 'Expiré',
}

/*
  Types d'événements connus. Un type absent de cette table est affiché tel
  quel : c'est un back-office, un code technique y est une information, pas
  une fuite.
*/
const eventCopy: Record<string, string> = {
  'order.created': 'Commande enregistrée',
  'order.shipped': 'Commande expédiée',
  'order.cancelled': 'Commande annulée',
  'order.expired': 'Commande expirée',
  'payment.paid': 'Paiement confirmé',
  'payment.failed': 'Paiement refusé',
  'payment.expired': 'Paiement expiré',
  'payment.refunded': 'Remboursement enregistré',
  'note.internal': 'Note interne',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/* -------------------------------------------------------------------------- */
/* Lecture prudente des champs Json                                           */
/* -------------------------------------------------------------------------- */

type AddressView = {
  name: string
  company: string | null
  line1: string
  line2: string | null
  postalCode: string
  city: string
  country: string
  phone: string | null
}

/** Sans rue, le bloc ne vaut rien : on préfère ne rien afficher. */
function readAddress(value: unknown): AddressView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '')
  const line1 = text('line1')
  if (!line1) return null
  return {
    name: [text('firstName'), text('lastName')].filter(Boolean).join(' '),
    company: text('company') || null,
    line1,
    line2: text('line2') || null,
    postalCode: text('postalCode'),
    city: text('city'),
    country: text('country'),
    phone: text('phone') || null,
  }
}

function countryLabel(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return code
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

type KitComponent = { label: string; quantity: number }

/** Composition du kit figée à l'achat. Absente ou malformée : rien. */
function readComponents(snapshot: unknown): KitComponent[] {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) return []
  const list = (snapshot as Record<string, unknown>).components
  if (!Array.isArray(list)) return []
  return list.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const raw = entry as Record<string, unknown>
    const productName = typeof raw.productName === 'string' ? raw.productName.trim() : ''
    const variantName = typeof raw.variantName === 'string' ? raw.variantName.trim() : ''
    const quantity =
      typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) && raw.quantity > 0
        ? raw.quantity
        : 1
    const label = [productName, variantName].filter(Boolean).join(' — ')
    return label ? [{ label, quantity }] : []
  })
}

/** Seul http(s) devient un lien : le champ est saisi à la main. */
function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Référence du prestataire : début seulement, jamais la valeur entière. */
function shortRef(value: string | null): string | null {
  if (!value) return null
  return value.length > 12 ? `${value.slice(0, 12)}…` : value
}

/* -------------------------------------------------------------------------- */
/* Métadonnées                                                                */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>
}): Promise<Metadata> {
  const { orderId } = await params
  // `getStaffUser` et non `requireStaff` : rediriger depuis les métadonnées
  // n'aurait pas de sens, c'est la page qui garde la porte.
  const staff = await getStaffUser()
  const order = staff ? await loadOrder(orderId) : null
  return {
    title: order ? `Commande ${order.reference}` : 'Commande',
    robots: { index: false, follow: false },
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const h2Class = 'text-sm font-bold'
const rowClass = 'flex items-baseline justify-between gap-4'
const dtClass = 'text-muted-strong'
const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const staff = await requireStaff('orders.view')
  const { orderId } = await params
  const order = await loadOrder(orderId)
  if (!order) notFound()

  const status = statusCopy[order.status]
  const payment = paymentCopy[order.paymentStatus]
  const fulfillment = fulfillmentCopy[order.fulfillmentStatus]
  const isTestPayment = order.payments.some(
    (entry) => entry.isTestMode || entry.provider === 'simulation',
  )

  // Les lignes filles sont les composants d'un kit : elles n'apparaissent que
  // sous leur kit, jamais comme un article acheté séparément.
  const parentLines = order.lines.filter((line) => line.parentLineId === null)

  const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const refundable = Math.max(0, order.totalCents - refunded)

  const shippingAddress = readAddress(order.shippingAddress)
  const billingAddress = readAddress(order.billingAddress)

  const vehicle = order.configuration
    ? {
        make: order.configuration.generation.model.make.name,
        model: order.configuration.generation.model.name,
        generation: order.configuration.generation.name,
        equipment: order.configuration.equipment.label,
        headlampRef: order.configuration.headlampRef,
      }
    : null

  // Conditions d'affichage des actions : le droit, et l'état de la commande.
  // Un bouton qui échouerait à coup sûr n'est pas affiché.
  const cancelled = order.status === 'CANCELLED'
  const showShip =
    can(staff.role, 'orders.fulfil') &&
    !cancelled &&
    order.paymentStatus === 'PAID' &&
    order.fulfillmentStatus !== 'FULFILLED'
  const showCancel = can(staff.role, 'orders.cancel') && !cancelled
  const showRefund =
    can(staff.role, 'orders.refund') &&
    refundable > 0 &&
    (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED')
  // Écrire une note interne est un droit à part : 'orders.view' ouvre la
  // lecture du dossier, pas l'écriture dedans. Sans cela, un rôle de
  // consultation se verrait offrir un formulaire d'écriture.
  const showNote = can(staff.role, 'orders.note')

  // La fiche client est derrière 'customers.view', que tous les rôles ayant
  // 'orders.view' n'ont pas : sans ce test, le lien renverrait vers un refus.
  const canViewCustomer = can(staff.role, 'customers.view')
  const customerName = order.user
    ? [order.user.firstName, order.user.lastName].filter(Boolean).join(' ')
    : ''

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: 'Administration', href: '/admin' },
          { label: 'Commandes', href: '/admin/commandes' },
          { label: order.reference },
        ]}
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-extrabold">Commande {order.reference}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : null}
          {fulfillment ? <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge> : null}
          {isTestPayment ? (
            <Badge tone="warn">Paiement de test — aucun montant encaissé</Badge>
          ) : null}
          <span className="text-xs text-muted">
            {dateFormatter.format(order.placedAt ?? order.createdAt)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* ================================================================
            Colonne gauche : le dossier
            ================================================================ */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* ---------------------------------------------------------------
              Articles
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-articles">
            <h2 id="dossier-articles" className={h2Class}>
              Articles
            </h2>
            <Card className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b border-line bg-surface-soft">
                  <tr>
                    <th scope="col" className={thClass}>
                      Article
                    </th>
                    <th scope="col" className={thClass}>
                      Référence
                    </th>
                    <th scope="col" className={`${thClass} text-right`}>
                      Qté
                    </th>
                    <th scope="col" className={`${thClass} text-right`}>
                      Prix unitaire
                    </th>
                    <th scope="col" className={`${thClass} text-right`}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parentLines.map((line) => {
                    const components = readComponents(line.snapshot)
                    return (
                      <tr key={line.id} className="border-b border-line last:border-0">
                        <td className={tdClass}>
                          <span className="font-semibold">{line.productName}</span>
                          <span className="block text-xs text-muted-strong">{line.variantName}</span>
                          {components.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                              {components.map((component, index) => (
                                <li key={`${line.id}-${index}`}>
                                  {component.quantity} × {component.label}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className={`${tdClass} font-mono text-xs text-muted-strong`}>
                          {line.sku}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums`}>{line.quantity}</td>
                        <td className={`${tdClass} text-right tabular-nums whitespace-nowrap`}>
                          {formatPrice(line.unitPriceCents)}
                        </td>
                        <td
                          className={`${tdClass} text-right font-semibold tabular-nums whitespace-nowrap`}
                        >
                          {formatPrice(line.lineTotalCents)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Totaux
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-totaux">
            <h2 id="dossier-totaux" className={h2Class}>
              Totaux
            </h2>
            <Card className="mt-2 p-4">
              <dl className="flex flex-col gap-2 text-sm">
                <div className={rowClass}>
                  <dt className={dtClass}>Sous-total TTC</dt>
                  <dd className="font-semibold tabular-nums">{formatPrice(order.subtotalCents)}</dd>
                </div>

                {order.discountCents > 0 ? (
                  <div className={rowClass}>
                    <dt className={dtClass}>
                      Remise{order.promotionCode ? ` (${order.promotionCode})` : ''}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      −{formatPrice(order.discountCents)}
                    </dd>
                  </div>
                ) : null}

                <div className={rowClass}>
                  <dt className={dtClass}>Livraison</dt>
                  <dd className="font-semibold tabular-nums">
                    {order.shippingCents === 0 ? 'Offerte' : formatPrice(order.shippingCents)}
                  </dd>
                </div>

                <div className={`${rowClass} text-muted`}>
                  <dt>dont TVA</dt>
                  <dd className="tabular-nums">{formatPrice(order.taxCents)}</dd>
                </div>

                <div className={`${rowClass} border-t border-line pt-2`}>
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-base font-bold tabular-nums">
                    {formatPrice(order.totalCents)}
                  </dd>
                </div>

                <div className={`${rowClass} border-t border-line pt-2`}>
                  <dt className={dtClass}>Déjà remboursé</dt>
                  <dd className="font-semibold tabular-nums">{formatPrice(refunded)}</dd>
                </div>
                <div className={rowClass}>
                  <dt className={dtClass}>Reste remboursable</dt>
                  <dd className="font-semibold tabular-nums">{formatPrice(refundable)}</dd>
                </div>
              </dl>

              {order.refunds.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-xs text-muted-strong">
                  {order.refunds.map((refund) => (
                    <li key={refund.id} className={rowClass}>
                      <span>
                        {dateTimeFormatter.format(refund.createdAt)}
                        {refund.reason ? ` · ${refund.reason}` : ''}
                        <span className="text-muted">
                          {refund.restock ? ' · articles remis en stock' : ' · stock inchangé'}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums whitespace-nowrap">
                        {formatPrice(refund.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Paiements
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-paiements">
            <h2 id="dossier-paiements" className={h2Class}>
              Paiements
            </h2>
            {order.payments.length === 0 ? (
              <Card className="mt-2 p-4">
                <p className="text-sm text-muted-strong">Aucun paiement enregistré.</p>
              </Card>
            ) : (
              <Card className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="border-b border-line bg-surface-soft">
                    <tr>
                      <th scope="col" className={thClass}>
                        Prestataire
                      </th>
                      <th scope="col" className={thClass}>
                        Référence
                      </th>
                      <th scope="col" className={thClass}>
                        Statut
                      </th>
                      <th scope="col" className={`${thClass} text-right`}>
                        Montant
                      </th>
                      <th scope="col" className={thClass}>
                        Mode
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((entry) => (
                      <tr key={entry.id} className="border-b border-line last:border-0">
                        <td className={tdClass}>{entry.provider}</td>
                        {/* Début de la référence seulement : elle identifie la
                            transaction chez le prestataire. */}
                        <td className={`${tdClass} font-mono text-xs text-muted-strong`}>
                          {shortRef(entry.providerRef)}
                        </td>
                        <td className={tdClass}>
                          {paymentLineCopy[entry.status] ?? entry.status}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums whitespace-nowrap`}>
                          {formatPrice(entry.amountCents)}
                        </td>
                        <td className={tdClass}>
                          {entry.isTestMode ? (
                            <Badge tone="warn">Test</Badge>
                          ) : (
                            <span className="text-muted">Réel</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {/* ---------------------------------------------------------------
              Expéditions
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-expeditions">
            <h2 id="dossier-expeditions" className={h2Class}>
              Expéditions
            </h2>
            {order.shipments.length === 0 ? (
              <Card className="mt-2 p-4">
                <p className="text-sm text-muted-strong">
                  {cancelled
                    ? 'Aucune expédition : la commande a été annulée.'
                    : 'Aucune expédition enregistrée.'}
                </p>
              </Card>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {order.shipments.map((shipment) => {
                  const url = safeTrackingUrl(shipment.trackingUrl)
                  return (
                    <Card as="li" key={shipment.id} className="p-3 text-sm">
                      <p className="font-semibold">{shipment.carrier ?? 'Transporteur non précisé'}</p>
                      {shipment.trackingNumber ? (
                        <p className="mt-0.5">
                          <span className={dtClass}>Suivi : </span>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold underline underline-offset-4 hover:text-brand"
                            >
                              {shipment.trackingNumber}
                            </a>
                          ) : (
                            <span className="font-semibold">{shipment.trackingNumber}</span>
                          )}
                        </p>
                      ) : null}
                      {shipment.shippedAt ? (
                        <p className="mt-0.5 text-xs text-muted">
                          Expédiée le {dateTimeFormatter.format(shipment.shippedAt)}
                        </p>
                      ) : null}
                      {shipment.deliveredAt ? (
                        <p className="text-xs text-muted">
                          Livrée le {dateTimeFormatter.format(shipment.deliveredAt)}
                        </p>
                      ) : null}
                    </Card>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------------------
              Historique — tout, dans l'ordre, notes internes comprises.
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-historique">
            <h2 id="dossier-historique" className={h2Class}>
              Historique
            </h2>
            {order.events.length === 0 ? (
              <Card className="mt-2 p-4">
                <p className="text-sm text-muted-strong">Aucun événement enregistré.</p>
              </Card>
            ) : (
              <Card className="mt-2 p-3">
                <ol className="flex flex-col gap-1.5 text-sm">
                  {order.events.map((event) => {
                    const internal = event.type === 'note.internal' || event.actorKind === 'staff'
                    return (
                      <li
                        key={event.id}
                        className={
                          internal
                            ? 'rounded-sm bg-surface-muted px-2.5 py-2'
                            : 'px-2.5 py-2'
                        }
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-xs text-muted tabular-nums">
                            {dateTimeFormatter.format(event.createdAt)}
                          </span>
                          <span className="font-medium">{eventCopy[event.type] ?? event.type}</span>
                          {internal ? (
                            <span className="text-xs font-semibold text-muted-strong">interne</span>
                          ) : null}
                        </div>
                        {event.message ? (
                          <p className="mt-0.5 text-xs text-muted-strong">{event.message}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </Card>
            )}
          </section>
        </div>

        {/* ================================================================
            Colonne droite : qui, où, et ce qu'on peut faire
            ================================================================ */}
        <div className="flex w-full shrink-0 flex-col gap-4 xl:w-96">
          {/* ---------------------------------------------------------------
              Client
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-client">
            <h2 id="dossier-client" className={h2Class}>
              Client
            </h2>
            <Card className="mt-2 p-4 text-sm">
              <p className="font-semibold break-words">{order.email}</p>
              {order.phone ? <p className="mt-0.5 text-muted-strong">{order.phone}</p> : null}
              {order.user ? (
                canViewCustomer ? (
                  <Link
                    href={`/admin/clients/${order.user.id}`}
                    className="mt-2 inline-flex min-h-9 items-center font-semibold underline decoration-line-strong underline-offset-4 hover:text-brand"
                  >
                    {customerName || 'Voir la fiche client'}
                  </Link>
                ) : (
                  <p className="mt-1 font-semibold">{customerName || 'Client enregistré'}</p>
                )
              ) : (
                <p className="mt-1 text-xs text-muted">sans compte</p>
              )}
              {order.customerNote ? (
                <p className="mt-2 border-t border-line pt-2 text-xs text-muted-strong">
                  <span className="font-semibold">Note du client : </span>
                  {order.customerNote}
                </p>
              ) : null}
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Véhicule de la commande
              --------------------------------------------------------------- */}
          {vehicle ? (
            <section aria-labelledby="dossier-vehicule">
              <h2 id="dossier-vehicule" className={h2Class}>
                Véhicule
              </h2>
              <Card className="mt-2 p-4">
                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className={rowClass}>
                    <dt className={dtClass}>Marque</dt>
                    <dd className="text-right font-semibold">{vehicle.make}</dd>
                  </div>
                  <div className={rowClass}>
                    <dt className={dtClass}>Génération</dt>
                    <dd className="text-right font-semibold">
                      {vehicle.model} {vehicle.generation}
                    </dd>
                  </div>
                  <div className={rowClass}>
                    <dt className={dtClass}>Équipement</dt>
                    <dd className="text-right font-semibold">{vehicle.equipment}</dd>
                  </div>
                  {vehicle.headlampRef ? (
                    <div className={rowClass}>
                      <dt className={dtClass}>Bloc optique</dt>
                      <dd className="text-right font-semibold">{vehicle.headlampRef}</dd>
                    </div>
                  ) : null}
                </dl>
              </Card>
            </section>
          ) : null}

          {/* ---------------------------------------------------------------
              Adresses
              --------------------------------------------------------------- */}
          <section aria-labelledby="dossier-adresses">
            <h2 id="dossier-adresses" className={h2Class}>
              Adresses
            </h2>
            <Card className="mt-2 p-4 text-sm">
              <p className={`text-xs font-semibold ${dtClass}`}>Livraison</p>
              {shippingAddress ? (
                <address className="mt-1 not-italic">
                  {shippingAddress.name ? (
                    <>
                      {shippingAddress.name}
                      <br />
                    </>
                  ) : null}
                  {shippingAddress.company ? (
                    <>
                      {shippingAddress.company}
                      <br />
                    </>
                  ) : null}
                  {shippingAddress.line1}
                  {shippingAddress.line2 ? (
                    <>
                      <br />
                      {shippingAddress.line2}
                    </>
                  ) : null}
                  <br />
                  {[shippingAddress.postalCode, shippingAddress.city].filter(Boolean).join(' ')}
                  {shippingAddress.country ? (
                    <>
                      <br />
                      {countryLabel(shippingAddress.country)}
                    </>
                  ) : null}
                  {shippingAddress.phone ? (
                    <>
                      <br />
                      {shippingAddress.phone}
                    </>
                  ) : null}
                </address>
              ) : (
                <p className="mt-1 text-muted-strong">Adresse de livraison incomplète.</p>
              )}

              {order.shippingMethodLabel ? (
                <p className="mt-2 text-xs text-muted-strong">
                  Mode de livraison : {order.shippingMethodLabel}
                </p>
              ) : null}

              <p className={`mt-3 border-t border-line pt-3 text-xs font-semibold ${dtClass}`}>
                Facturation
              </p>
              {billingAddress ? (
                <address className="mt-1 not-italic">
                  {billingAddress.name ? (
                    <>
                      {billingAddress.name}
                      <br />
                    </>
                  ) : null}
                  {billingAddress.company ? (
                    <>
                      {billingAddress.company}
                      <br />
                    </>
                  ) : null}
                  {billingAddress.line1}
                  {billingAddress.line2 ? (
                    <>
                      <br />
                      {billingAddress.line2}
                    </>
                  ) : null}
                  <br />
                  {[billingAddress.postalCode, billingAddress.city].filter(Boolean).join(' ')}
                  {billingAddress.country ? (
                    <>
                      <br />
                      {countryLabel(billingAddress.country)}
                    </>
                  ) : null}
                </address>
              ) : (
                <p className="mt-1 text-muted-strong">Adresse de facturation incomplète.</p>
              )}
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Actions — montées seulement si le rôle a le droit.
              --------------------------------------------------------------- */}
          {showShip ? (
            <section aria-labelledby="action-expedition">
              <Card className="p-4">
                <h2 id="action-expedition" className={`${h2Class} mb-3`}>
                  Expédier
                </h2>
                <ShipForm orderId={order.id} />
              </Card>
            </section>
          ) : null}

          {showRefund ? (
            <section aria-labelledby="action-remboursement">
              <Card className="p-4">
                <h2 id="action-remboursement" className={`${h2Class} mb-3`}>
                  Rembourser
                </h2>
                <RefundForm orderId={order.id} maxRefundableCents={refundable} />
              </Card>
            </section>
          ) : null}

          {showCancel ? (
            <section aria-labelledby="action-annulation">
              <Card className="p-4">
                <h2 id="action-annulation" className={`${h2Class} mb-3`}>
                  Annuler
                </h2>
                <CancelForm orderId={order.id} />
              </Card>
            </section>
          ) : null}

          {showNote ? (
            <section aria-labelledby="action-note">
              <Card className="p-4">
                <h2 id="action-note" className={`${h2Class} mb-3`}>
                  Note interne
                </h2>
                <NoteForm orderId={order.id} />
              </Card>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
