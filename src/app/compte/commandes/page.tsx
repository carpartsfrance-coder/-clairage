import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { getMyOrders } from '@/lib/queries/account'
import { formatPrice } from '@/lib/identity'
import { AccountNav } from '@/components/account/AccountNav'
import { AttachOrderForm } from '@/components/account/AttachOrderForm'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'
import { IconCart } from '@/components/ui/icons'

/**
 * Mes commandes.
 *
 * `requireUser()` est la première instruction : le contrôle d'accès est fait
 * côté serveur, rien n'est masqué en CSS. La liste vient de `getMyOrders`, qui
 * pose `userId` dans le `where` — aucune requête Prisma n'est écrite ici, pour
 * qu'il n'y ait qu'un seul endroit où ce filtre puisse être oublié.
 */

export const metadata: Metadata = {
  title: 'Mes commandes',
  robots: { index: false, follow: false },
}

/*
  Les statuts arrivent en `string`. Un code inconnu n'affiche pas de badge
  plutôt que son code brut, qui ne dirait rien au client.
*/
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

/**
 * Un montant encaissé reste encaissé : un remboursement, total ou partiel,
 * suppose qu'une somme a été prise. Ces trois statuts valent donc « payée »
 * pour décider d'afficher la préparation — annoncer « à préparer » sur une
 * commande dont rien n'a été débité serait trompeur.
 */
const capturedPaymentStatuses = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export default async function Page() {
  const user = await requireUser()
  const orders = await getMyOrders(user.id)

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon compte', href: '/compte' },
          { label: 'Mes commandes' },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Mes commandes
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="commandes" />

        <div className="min-w-0 flex-1">
          {orders.length === 0 ? (
            <EmptyState
              icon={<IconCart className="size-8" />}
              title="Aucune commande pour le moment."
              description="Vos commandes apparaîtront ici dès la première validée."
              action={{ label: 'Voir le catalogue', href: '/c' }}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((order) => {
                const payment = paymentCopy[order.paymentStatus]
                // Pas de badge de préparation tant qu'aucun montant n'a été pris.
                const fulfillment = capturedPaymentStatuses.has(order.paymentStatus)
                  ? fulfillmentCopy[order.fulfillmentStatus]
                  : undefined

                return (
                  <Card as="li" key={order.id} interactive>
                    {/* Toute la carte est le lien : la cible dépasse largement 44 px. */}
                    <Link
                      href={`/compte/commandes/${order.id}`}
                      className="flex flex-wrap items-center gap-4 p-4"
                    >
                      {order.image ? (
                        <Image
                          src={order.image.url}
                          alt={order.image.alt}
                          width={72}
                          height={72}
                          className="size-18 shrink-0 rounded-sm bg-surface-muted object-contain"
                        />
                      ) : (
                        // Pas de visuel : un aplat, sans texte de remplacement.
                        <div className="size-18 shrink-0 rounded-sm bg-surface-muted" aria-hidden />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{order.reference}</p>
                        <p className="mt-0.5 text-sm text-muted-strong">
                          {dateFormatter.format(order.placedAt ?? order.createdAt)}
                          <span className="text-muted">
                            {' · '}
                            {order.itemCount} article{order.itemCount > 1 ? 's' : ''}
                          </span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : null}
                          {fulfillment ? (
                            <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge>
                          ) : null}
                        </div>
                      </div>

                      <p className="font-bold">{formatPrice(order.totalCents)}</p>
                    </Link>
                  </Card>
                )
              })}
            </ul>
          )}

          {/* -----------------------------------------------------------------
              Rattachement d'une commande passée sans compte
              ----------------------------------------------------------------- */}
          <section aria-labelledby="commandes-rattachement" className="mt-10">
            <h2 id="commandes-rattachement" className="text-lg font-bold">
              Une commande passée sans compte ?
            </h2>
            <p className="mt-2 max-w-prose text-sm text-muted-strong">
              Indiquez sa référence et l&apos;adresse e-mail utilisée lors de la commande pour la
              retrouver ici.
            </p>
            <AttachOrderForm />
          </section>
        </div>
      </div>
    </div>
  )
}
