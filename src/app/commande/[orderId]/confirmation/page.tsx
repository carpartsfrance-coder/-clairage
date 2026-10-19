import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { accessTokenFrom, canViewOrder } from '@/lib/order-access'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Surface'
import { IconTruck } from '@/components/ui/icons'
import { emailIsSimulated } from '@/lib/email'
import { formatPrice } from '@/lib/identity'

/**
 * Confirmation de commande.
 *
 * Le client revient du prestataire de paiement par une redirection ; le webhook
 * qui confirme l'encaissement, lui, arrive par un autre canal et peut arriver
 * après. Cette page ne doit donc JAMAIS déduire un encaissement de la seule
 * présence du client : elle lit `order.paymentStatus` et dit exactement ce que
 * la base sait, y compris « on ne sait pas encore ».
 *
 * Aucune donnée de carte n'est lue, affichée ni manipulée ici : le paiement a
 * lieu chez le prestataire, cette page n'en voit que l'issue.
 */

// L'état lu change sous la page (le webhook peut arriver une seconde après le
// client) : aucune mise en cache, sinon on servirait une page « en attente »
// alors que le paiement est confirmé depuis longtemps.
export const revalidate = 0

/* --------------------------------------------------------------------------
   Lecture
   -------------------------------------------------------------------------- */

function findOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lines: { orderBy: { id: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
}

type OrderWithDetails = NonNullable<Awaited<ReturnType<typeof findOrder>>>

/**
 * `'unavailable'` n'est pas `null` : une base injoignable ne veut pas dire que
 * la commande n'existe pas. Répondre 404 à quelqu'un qui vient peut-être de
 * payer serait le pire message possible.
 */
async function loadOrder(orderId: string): Promise<OrderWithDetails | null | 'unavailable'> {
  try {
    return await findOrder(orderId)
  } catch (error) {
    console.error('[commande/confirmation]', error)
    return 'unavailable'
  }
}

/** `null` = on ne sait pas, et alors on n'écrit rien sur l'e-mail. */
type EmailMention = { kind: 'sent' | 'prepared' | 'none' } | null

async function readConfirmationEmail(email: string, reference: string): Promise<EmailMention> {
  try {
    const log = await prisma.emailLog.findFirst({
      // Filtré sur la référence portée par l'e-mail, pas seulement sur
      // l'adresse : sinon la confirmation d'une commande précédente du même
      // client passerait pour celle-ci, et la page annoncerait un envoi qui
      // n'a jamais eu lieu pour CETTE commande.
      where: {
        toEmail: email,
        template: 'commande.confirmation',
        payload: { path: ['reference'], equals: reference },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!log) return { kind: 'none' }
    // `simulated` veut dire qu'aucun envoi réel n'a eu lieu : on ne peut pas
    // écrire « un e-mail vous a été envoyé » dans ce cas.
    return { kind: log.simulated ? 'prepared' : 'sent' }
  } catch (error) {
    console.error('[commande/confirmation]', error)
    return null
  }
}

/* --------------------------------------------------------------------------
   Lecture prudente des champs Json
   -------------------------------------------------------------------------- */

type AddressView = {
  firstName: string
  lastName: string
  line1: string
  line2: string | null
  postalCode: string
  city: string
  country: string
}

function readAddress(value: unknown): AddressView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '')
  const line1 = text('line1')
  // Sans rue, il n'y a pas d'adresse à montrer : mieux vaut ne rien afficher
  // qu'un bloc à trous.
  if (!line1) return null
  return {
    firstName: text('firstName'),
    lastName: text('lastName'),
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

/* --------------------------------------------------------------------------
   Métadonnées
   -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderId: string }>
}): Promise<Metadata> {
  const { orderId } = await params
  let reference: string | null = null
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { reference: true },
    })
    reference = order?.reference ?? null
  } catch (error) {
    console.error('[commande/confirmation]', error)
  }
  return {
    title: reference ? `Commande ${reference}` : 'Commande',
    robots: { index: false, follow: false },
  }
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

/* Même registre que le panier et le tunnel : titre de page à 25/29 px. */
const h1Class =
  'text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]'
const rowClass = 'flex items-baseline justify-between gap-4'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orderId } = await params
  const sp = await searchParams
  const loaded = await loadOrder(orderId)

  // Même contrôle que sur la page de paiement : l'identifiant seul ne donne
  // pas accès aux données personnelles de la commande.
  if (loaded !== 'unavailable' && loaded && !canViewOrder(loaded, accessTokenFrom(sp), (await getCurrentUser())?.id ?? null)) {
    notFound()
  }

  if (loaded === 'unavailable') {
    return (
      <div className="container-page pb-10 fiche:pb-14">
        <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Commande' }]} />
        <h1 className={`mt-4 ${h1Class}`}>Votre commande n&apos;a pas pu être affichée.</h1>
        <Alert
          tone="danger"
          title="Lecture impossible pour le moment."
          className="mt-6"
          live="assertive"
        >
          <p>
            Cette page n&apos;a pas pu lire votre commande. Rien n&apos;a changé de son côté :
            rechargez cette page dans quelques instants, ou{' '}
            <Link href="/contact" className="font-semibold underline underline-offset-4">
              contactez-nous
            </Link>{' '}
            si l&apos;affichage ne revient pas.
          </p>
        </Alert>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          Retour à l&apos;accueil
        </ButtonLink>
      </div>
    )
  }

  if (!loaded) notFound()
  const order = loaded

  const lastPayment = order.payments[0] ?? null
  const isTestPayment = lastPayment
    ? lastPayment.isTestMode || lastPayment.provider === 'simulation'
    : false

  // L'encaissement est lu EN PREMIER, et il ne se déduit pas du statut de la
  // commande : un remboursement total ou partiel suppose qu'un montant a été
  // pris, et une commande payée puis annulée reste une commande payée. Sans
  // cette priorité, un paiement encaissé s'afficherait comme « aucun montant
  // débité » dès que la commande passe en CANCELLED.
  const captured =
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'PARTIALLY_REFUNDED' ||
    order.paymentStatus === 'REFUNDED'
  const refunded = order.paymentStatus === 'REFUNDED'
  const partiallyRefunded = order.paymentStatus === 'PARTIALLY_REFUNDED'
  // « Commande non aboutie » veut dire une seule chose : rien n'a été encaissé.
  const failed =
    !captured &&
    (order.paymentStatus === 'FAILED' ||
      order.paymentStatus === 'EXPIRED' ||
      order.status === 'CANCELLED')
  // Tout le reste (PENDING, AUTHORIZED) : la banque n'a pas encore confirmé.
  const awaitingPayment = !failed && !captured
  // Encaissé puis annulé : on le dit, et on ne remercie pas pour une commande
  // annulée.
  const cancelledAfterPayment = captured && order.status === 'CANCELLED'

  const testBadge = isTestPayment ? (
    <Badge tone="warn">Paiement de test — aucun montant encaissé</Badge>
  ) : null

  /* --- c) Commande non aboutie -------------------------------------------- */
  if (failed) {
    return (
      <div className="container-page pb-10 fiche:pb-14">
        <Breadcrumb
          items={[{ label: 'Accueil', href: '/' }, { label: `Commande ${order.reference}` }]}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className={h1Class}>Cette commande n&apos;a pas abouti.</h1>
          {testBadge}
        </div>

        <Alert tone="danger" title="Aucun paiement n&apos;a été pris." className="mt-6">
          <p>
            La référence {order.reference} a été annulée : aucun montant n&apos;a été débité et les
            articles réservés ont été remis à disposition.
          </p>
          <p className="mt-2">
            Votre panier vous attend : vous pouvez reprendre la commande depuis le début.
          </p>
        </Alert>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ButtonLink href="/panier">Revenir à mon panier</ButtonLink>
          <Link href="/" className="text-sm font-semibold underline underline-offset-4">
            Retour à l&apos;accueil
          </Link>
          <Link href="/contact" className="text-sm font-semibold underline underline-offset-4">
            Nous contacter
          </Link>
        </div>
      </div>
    )
  }

  /* --- a) et b) ----------------------------------------------------------- */
  const emailMention = captured
    ? await readConfirmationEmail(order.email, order.reference)
    : null
  const address = readAddress(order.shippingAddress)
  const placedLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
    order.placedAt ?? order.createdAt,
  )
  // Les lignes filles sont les composants des kits : elles valent 0 € et ne
  // doivent pas apparaître comme des articles achetés séparément.
  const parentLines = order.lines.filter((line) => line.parentLineId === null)

  return (
    <div className="container-page pb-10 fiche:pb-14">
      {awaitingPayment ? (
        /*
          Rafraîchissement sans JavaScript : le statut est écrit par le webhook
          du prestataire, pas par cette page. Un rechargement toutes les dix
          secondes suffit à faire apparaître la confirmation dès qu'elle existe,
          et fonctionne même sans script actif.
        */
        <meta httpEquiv="refresh" content="10" />
      ) : null}

      <Breadcrumb
        items={[{ label: 'Accueil', href: '/' }, { label: `Commande ${order.reference}` }]}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className={h1Class}>
          {cancelledAfterPayment
            ? 'Cette commande a été annulée.'
            : captured
              ? 'Merci, votre commande est confirmée.'
              : 'Votre commande est enregistrée.'}
        </h1>
        {testBadge}
      </div>

      {captured ? (
        <Alert
          tone={cancelledAfterPayment || refunded ? 'warn' : 'ok'}
          title={
            cancelledAfterPayment
              ? `Commande ${order.reference} annulée après encaissement.`
              : `Commande ${order.reference} confirmée.`
          }
          className="mt-6"
        >
          <p>
            {refunded
              ? `Le paiement de ${formatPrice(order.totalCents)} a été encaissé, puis remboursé en totalité.`
              : partiallyRefunded
                ? `Le paiement de ${formatPrice(order.totalCents)} a été encaissé, et un remboursement partiel est enregistré sur cette commande.`
                : `Le paiement a été confirmé pour un total de ${formatPrice(order.totalCents)}.`}
            {emailMention?.kind === 'sent'
              ? ` Un e-mail de confirmation a été envoyé à ${order.email}.`
              : null}
            {emailMention?.kind === 'prepared'
              ? ` Un e-mail de confirmation a été préparé pour ${order.email} ; l'envoi réel n'est pas encore activé.`
              : null}
            {emailMention?.kind === 'none'
              ? ` Aucun e-mail de confirmation n'est encore enregistré pour ${order.email}.`
              : null}
          </p>
          {cancelledAfterPayment && !refunded && !partiallyRefunded ? (
            <p className="mt-2">
              Cette commande a été annulée alors que le montant avait été encaissé, et aucun
              remboursement n&apos;est encore enregistré ici. Si vous n&apos;avez rien reçu,{' '}
              <Link href="/contact" className="font-semibold underline underline-offset-4">
                écrivez-nous
              </Link>{' '}
              en indiquant la référence {order.reference}.
            </p>
          ) : null}
        </Alert>
      ) : (
        <Alert
          tone="info"
          title="Paiement en cours de confirmation."
          className="mt-6"
          live="polite"
        >
          <p>
            Votre commande {order.reference} est enregistrée et vos articles sont réservés. La
            banque n&apos;a pas encore confirmé le paiement : cette page se met à jour d&apos;
            elle-même, vous n&apos;avez rien à faire.
          </p>
          <p className="mt-2">
            Si rien ne change au bout de quelques minutes,{' '}
            <Link href="/contact" className="font-semibold underline underline-offset-4">
              écrivez-nous
            </Link>{' '}
            en indiquant la référence {order.reference}.
          </p>
        </Alert>
      )}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* -----------------------------------------------------------------
            Votre commande + articles
            ----------------------------------------------------------------- */}
        <div className="min-w-0 flex-1 flex flex-col gap-8">
          <section aria-labelledby="confirmation-commande">
            <h2 id="confirmation-commande" className="text-[14px] font-bold">
              Votre commande
            </h2>

            <Card className="mt-4 p-5">
              <dl className="flex flex-col gap-2.5 text-[12px]">
                <div className={rowClass}>
                  <dt className="text-muted-strong">Référence</dt>
                  <dd className="font-semibold">{order.reference}</dd>
                </div>
                <div className={rowClass}>
                  <dt className="text-muted-strong">Date</dt>
                  <dd className="font-semibold">{placedLabel}</dd>
                </div>
                <div className={rowClass}>
                  <dt className="text-muted-strong">E-mail</dt>
                  <dd className="min-w-0 font-semibold break-words">{order.email}</dd>
                </div>
                {order.shippingMethodLabel ? (
                  <div className={rowClass}>
                    <dt className="text-muted-strong">Livraison</dt>
                    <dd className="text-right font-semibold">{order.shippingMethodLabel}</dd>
                  </div>
                ) : null}
                {address ? (
                  <div className="flex flex-col gap-1 border-t border-line pt-3">
                    <dt className="text-muted-strong">Adresse de livraison</dt>
                    <dd className="font-medium not-italic">
                      <address className="not-italic">
                        {[address.firstName, address.lastName].filter(Boolean).join(' ')}
                        <br />
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
              </dl>
            </Card>
          </section>

          <section aria-labelledby="confirmation-articles">
            <h2 id="confirmation-articles" className="text-[14px] font-bold">
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

          {cancelledAfterPayment ? null : (
            <section aria-labelledby="confirmation-suite">
              <h2 id="confirmation-suite" className="text-[14px] font-bold">
                Et ensuite ?
              </h2>

              <Card className="mt-4 p-5">
                <ul className="flex flex-col gap-3 text-sm text-muted-strong">
                  <li className="flex items-start gap-3">
                    <IconTruck className="mt-0.5 size-5 shrink-0 text-muted" />
                    <span>
                      {captured
                        ? 'Votre commande est préparée, puis remise au transporteur'
                        : 'Dès le paiement confirmé, votre commande est préparée, puis remise au transporteur'}
                      {order.shippingMethodLabel ? ` (${order.shippingMethodLabel})` : null}.
                    </span>
                  </li>
                  {/*
                    L'avis d'expédition EST envoyé à la mise en expédition
                    (admin-orders.ts). Reste à dire s'il partira réellement :
                    avec le pilote « log », il est seulement journalisé, et
                    promettre un message que personne ne recevra serait faux.
                  */}
                  <li className="pl-8">
                    {emailIsSimulated()
                      ? `L’avis d’expédition est préparé au départ du colis, mais l’envoi réel d’e-mails n’est pas activé sur cet environnement : conservez la référence ${order.reference}, elle suffit à nous interroger sur l’avancement de cette commande.`
                      : `Vous recevrez un avis d’expédition par e-mail au départ du colis, avec le numéro de suivi s’il en existe un. Conservez la référence ${order.reference}.`}
                  </li>
                </ul>
              </Card>
            </section>
          )}
        </div>

        {/* -----------------------------------------------------------------
            Totaux
            ----------------------------------------------------------------- */}
        <section
          aria-labelledby="confirmation-totaux"
          className="lg:sticky lg:top-6 lg:w-96 lg:shrink-0"
        >
          <Card className="p-5">
            <h2 id="confirmation-totaux" className="text-[14px] font-bold">
              Totaux
            </h2>

            <dl className="mt-4 flex flex-col gap-2.5 text-[12px]">
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

            {isTestPayment ? (
              <p className="mt-4 text-xs text-muted-strong">
                Ce paiement a été traité en mode test : aucun montant réel n&apos;a été encaissé.
              </p>
            ) : null}

            {order.userId === null ? (
              <div className="mt-5 border-t border-line pt-4 text-sm text-muted-strong">
                <p>
                  Cette commande a été passée sans compte : conservez la référence{' '}
                  <span className="font-semibold text-slate-ink">{order.reference}</span> pour la
                  retrouver.
                </p>
                <p className="mt-2">
                  <Link href="/suivi" className="font-semibold underline underline-offset-4">
                    Suivre ma commande
                  </Link>
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              <ButtonLink href="/" variant="secondary" block>
                Retour à l&apos;accueil
              </ButtonLink>
              <p className="text-xs text-muted">
                Une question sur cette commande ?{' '}
                <Link href="/contact" className="font-semibold underline underline-offset-4">
                  Nous contacter
                </Link>
                .
              </p>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
