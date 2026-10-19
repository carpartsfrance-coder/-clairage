import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getCurrentUser, requireUser } from '@/lib/auth/session'
import { getMyOrder } from '@/lib/queries/account'
import { formatPrice } from '@/lib/identity'
import { AccountNav } from '@/components/account/AccountNav'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'

/**
 * Détail d'une commande du client connecté.
 *
 * Aucune requête Prisma n'est écrite dans ce fichier : `getMyOrder` pose
 * `userId` dans le `where`, et c'est précisément ce qui empêche de lire la
 * commande d'un autre en changeant l'identifiant dans l'URL. Une commande qui
 * n'appartient pas au client n'est jamais chargée, et la page répond 404.
 */

/*
  `cache` déduplique l'appel entre `generateMetadata` et la page : la même
  requête n'est pas jouée deux fois pour un seul rendu.
*/
const loadOrder = cache((userId: string, orderId: string) => getMyOrder(userId, orderId))

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

// Un code absent de ces tables n'affiche pas de badge : mieux vaut rien
// qu'un code technique présenté au client.
const paymentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente de paiement', tone: 'warn' },
  AUTHORIZED: { label: 'Autorisée', tone: 'warn' },
  PAID: { label: 'Payée', tone: 'ok' },
  FAILED: { label: 'Paiement refusé', tone: 'danger' },
  EXPIRED: { label: 'Paiement expiré', tone: 'danger' },
  REFUNDED: { label: 'Remboursée', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Partiellement remboursée', tone: 'neutral' },
}

const fulfillmentCopy: Record<string, { label: string; tone: BadgeTone }> = {
  UNFULFILLED: { label: 'À préparer', tone: 'neutral' },
  PARTIALLY_FULFILLED: { label: 'Partiellement expédiée', tone: 'warn' },
  FULFILLED: { label: 'Expédiée', tone: 'ok' },
  RETURNED: { label: 'Retournée', tone: 'neutral' },
}

/** Même règle que la liste : un encaissement reste un encaissement. */
const capturedPaymentStatuses = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])

/**
 * Statuts qui annoncent un encaissement à venir. Sur une commande annulée,
 * l'annonce est fausse : rien ne sera plus débité, rien ne sera préparé et
 * rien ne partira. Le `status` est la seule source de l'annulation.
 */
const pendingPaymentStatuses = new Set(['PENDING', 'AUTHORIZED'])

const documentCopy: Record<string, string> = {
  INVOICE: 'Facture',
  CREDIT_NOTE: 'Avoir',
  RETURN_SLIP: 'Bon de retour',
}

const eventCopy: Record<string, string> = {
  'order.created': 'Commande enregistrée',
  'payment.paid': 'Paiement confirmé',
  'payment.failed': 'Paiement refusé',
  'payment.expired': 'Paiement expiré',
  'order.expired': 'Commande expirée',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
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
}

/** Un bloc d'adresse à trous ne vaut rien : sans rue, on n'affiche pas d'adresse. */
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

/** Composition du kit figée à l'achat. Absente ou malformée : on n'affiche rien. */
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

/**
 * Lien de suivi : seul http(s) devient un lien cliquable. Le champ est saisi
 * côté boutique, et un schéma d'URL exotique n'a rien à faire dans un href.
 */
function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
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
  // `getCurrentUser` plutôt que `requireUser` : une redirection depuis les
  // métadonnées n'aurait pas de sens, c'est la page qui s'en charge.
  const user = await getCurrentUser()
  const order = user ? await loadOrder(user.id, orderId) : null
  return {
    title: order ? `Commande ${order.reference}` : 'Commande',
    robots: { index: false, follow: false },
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const rowClass = 'flex items-baseline justify-between gap-4'
const sectionTitleClass = 'text-lg font-bold'

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireUser()
  const { orderId } = await params
  const order = await loadOrder(user.id, orderId)
  if (!order) notFound()

  const cancelled = order.status === 'CANCELLED'
  const payment =
    cancelled && pendingPaymentStatuses.has(order.paymentStatus)
      ? undefined
      : paymentCopy[order.paymentStatus]
  const fulfillment =
    !cancelled && capturedPaymentStatuses.has(order.paymentStatus)
      ? fulfillmentCopy[order.fulfillmentStatus]
      : undefined
  const isTestPayment = order.payments.some(
    (entry) => entry.isTestMode || entry.provider === 'simulation',
  )

  // Les lignes filles sont les composants des kits : elles ne sont pas des
  // articles achetés séparément et n'apparaissent que sous leur kit.
  const parentLines = order.lines.filter((line) => line.parentLineId === null)
  const address = readAddress(order.shippingAddress)

  // Seuls les types connus sont affichés, et jamais `event.message` : ces
  // messages sont écrits pour le back-office. « payment.amount_mismatch »
  // porte par exemple un écart de montants en centimes, destiné à la
  // réconciliation — un repli sur le message publierait cette trace interne
  // dans l'historique du client.
  const events = order.events.flatMap((event) => {
    const label = eventCopy[event.type]
    return label ? [{ id: event.id, label, createdAt: event.createdAt }] : []
  })

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon compte', href: '/compte' },
          { label: 'Mes commandes', href: '/compte/commandes' },
          { label: order.reference },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Commande {order.reference}
      </h1>

      <p className="mt-2 text-sm text-muted-strong">
        {dateFormatter.format(order.placedAt ?? order.createdAt)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {cancelled ? <Badge tone="danger">Annulée</Badge> : null}
        {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : null}
        {fulfillment ? <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge> : null}
        {isTestPayment ? (
          <Badge tone="warn">Paiement de test — aucun montant encaissé</Badge>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="commandes" />

        <div className="min-w-0 flex-1 flex flex-col gap-10">
          {/* ---------------------------------------------------------------
              Articles
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-articles">
            <h2 id="commande-articles" className={sectionTitleClass}>
              Articles
            </h2>

            <ul className="mt-4 flex flex-col gap-3">
              {parentLines.map((line) => {
                const components = readComponents(line.snapshot)
                return (
                  <Card as="li" key={line.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0 font-semibold">{line.productName}</p>
                      <p className="font-semibold">{formatPrice(line.lineTotalCents)}</p>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-strong">
                      {line.variantName}
                      <span className="text-muted"> · Quantité {line.quantity}</span>
                    </p>
                    {components.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2 text-xs text-muted">
                        {components.map((component, index) => (
                          <li key={`${line.id}-${index}`}>
                            {component.quantity} × {component.label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Card>
                )
              })}
            </ul>
          </section>

          {/* ---------------------------------------------------------------
              Totaux
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-totaux">
            <h2 id="commande-totaux" className={sectionTitleClass}>
              Totaux
            </h2>

            <Card className="mt-4 p-5">
              <dl className="flex flex-col gap-3 text-sm">
                <div className={rowClass}>
                  <dt>Sous-total TTC</dt>
                  <dd className="font-semibold">{formatPrice(order.subtotalCents)}</dd>
                </div>

                {order.discountCents > 0 ? (
                  <div className={rowClass}>
                    <dt>Remise{order.promotionCode ? ` (${order.promotionCode})` : null}</dt>
                    <dd className="font-semibold">−{formatPrice(order.discountCents)}</dd>
                  </div>
                ) : null}

                <div className={rowClass}>
                  <dt>Livraison</dt>
                  <dd className="font-semibold">
                    {order.shippingCents === 0 ? 'Offerte' : formatPrice(order.shippingCents)}
                  </dd>
                </div>

                <div className={`${rowClass} text-muted`}>
                  <dt>dont TVA</dt>
                  <dd>{formatPrice(order.taxCents)}</dd>
                </div>

                <div className={`${rowClass} mt-1 border-t border-line pt-4`}>
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-xl font-bold">{formatPrice(order.totalCents)}</dd>
                </div>
              </dl>
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Livraison
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-livraison">
            <h2 id="commande-livraison" className={sectionTitleClass}>
              Livraison
            </h2>

            <Card className="mt-4 p-5">
              <dl className="flex flex-col gap-3 text-sm">
                {address ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-strong">Adresse de livraison</dt>
                    <dd>
                      <address className="font-medium not-italic">
                        {address.name ? (
                          <>
                            {address.name}
                            <br />
                          </>
                        ) : null}
                        {address.company ? (
                          <>
                            {address.company}
                            <br />
                          </>
                        ) : null}
                        {address.line1}
                        {address.line2 ? (
                          <>
                            <br />
                            {address.line2}
                          </>
                        ) : null}
                        <br />
                        {[address.postalCode, address.city].filter(Boolean).join(' ')}
                        {address.country ? (
                          <>
                            <br />
                            {countryLabel(address.country)}
                          </>
                        ) : null}
                      </address>
                    </dd>
                  </div>
                ) : null}

                {order.shippingMethodLabel ? (
                  <div
                    className={
                      address ? `${rowClass} border-t border-line pt-3` : rowClass
                    }
                  >
                    <dt className="text-muted-strong">Mode de livraison</dt>
                    <dd className="text-right font-semibold">{order.shippingMethodLabel}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          </section>

          {/* ---------------------------------------------------------------
              Expéditions
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-expeditions">
            <h2 id="commande-expeditions" className={sectionTitleClass}>
              Expéditions
            </h2>

            {order.shipments.length === 0 ? (
              <Card className="mt-4 p-5">
                {/* « Pas encore » promet un envoi : sur une commande annulée,
                    cette promesse n'existe plus. */}
                <p className="text-sm text-muted-strong">
                  {cancelled ? 'Aucune expédition : la commande a été annulée.' : 'Pas encore expédiée.'}
                </p>
              </Card>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {order.shipments.map((shipment) => {
                  const url = safeTrackingUrl(shipment.trackingUrl)
                  return (
                    <Card as="li" key={shipment.id} className="p-4">
                      <p className="font-semibold">{shipment.carrier ?? 'Expédition'}</p>

                      {shipment.trackingNumber ? (
                        <p className="mt-1 text-sm">
                          <span className="text-muted-strong">Numéro de suivi : </span>
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
                            /* Sans lien fourni, le numéro reste du texte : aucune
                               URL de transporteur n'est devinée ici. */
                            <span className="font-semibold">{shipment.trackingNumber}</span>
                          )}
                        </p>
                      ) : null}

                      {shipment.shippedAt ? (
                        <p className="mt-1 text-xs text-muted">
                          Expédiée le {dateFormatter.format(shipment.shippedAt)}
                        </p>
                      ) : null}
                      {shipment.deliveredAt ? (
                        <p className="mt-0.5 text-xs text-muted">
                          Livrée le {dateFormatter.format(shipment.deliveredAt)}
                        </p>
                      ) : null}
                    </Card>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------------------
              Documents
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-documents">
            <h2 id="commande-documents" className={sectionTitleClass}>
              Documents
            </h2>

            {order.documents.length === 0 ? (
              <Card className="mt-4 p-5">
                <p className="text-sm text-muted-strong">
                  Aucun document n&apos;est encore disponible pour cette commande.
                </p>
              </Card>
            ) : (
              /* Aucun bouton de téléchargement : la génération des documents
                 n'existe pas encore, et un bouton mort vaut moins que rien. */
              <Card className="mt-4 p-5">
                <ul className="flex flex-col gap-3 text-sm">
                  {order.documents.map((doc) => (
                    <li key={doc.id} className={rowClass}>
                      <span>
                        <span className="font-semibold">
                          {documentCopy[doc.type] ?? doc.number}
                        </span>
                        <span className="text-muted-strong"> · {doc.number}</span>
                      </span>
                      <span className="text-right text-muted">
                        {dateFormatter.format(doc.issuedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {/* ---------------------------------------------------------------
              Historique
              --------------------------------------------------------------- */}
          {events.length > 0 ? (
            <section aria-labelledby="commande-historique">
              <h2 id="commande-historique" className={sectionTitleClass}>
                Historique
              </h2>

              <Card className="mt-4 p-5">
                <ol className="flex flex-col gap-3 text-sm">
                  {events.map((event) => (
                    <li key={event.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <span className="text-muted sm:w-52 sm:shrink-0">
                        {dateTimeFormatter.format(event.createdAt)}
                      </span>
                      <span className="font-medium">{event.label}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          ) : null}

          {/* ---------------------------------------------------------------
              Aide
              --------------------------------------------------------------- */}
          <section aria-labelledby="commande-aide">
            <h2 id="commande-aide" className={sectionTitleClass}>
              Besoin d&apos;aide ?
            </h2>

            <Card className="mt-4 p-5">
              <p className="text-sm text-muted-strong">
                Le formulaire s&apos;ouvre avec la référence {order.reference} : votre demande sera
                rattachée à cette commande.
              </p>
              <p className="mt-2 text-sm">
                <Link
                  href={`/contact?sujet=commande&commande=${encodeURIComponent(order.reference)}`}
                  className="font-semibold underline underline-offset-4 hover:text-brand"
                >
                  Nous contacter
                </Link>
              </p>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
