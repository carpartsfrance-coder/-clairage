import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { getAccountOverview, getMyOrders } from '@/lib/queries/account'
import { AccountNav } from '@/components/account/AccountNav'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
import { IconCart, IconChevronRight } from '@/components/ui/icons'
import { formatPrice } from '@/lib/identity'

/**
 * Tableau de bord du compte.
 *
 * `requireUser()` est la première instruction : le contrôle d'accès est fait
 * côté serveur, avant toute lecture. Rien n'est masqué en CSS, et aucune
 * requête n'est lancée avant de savoir qui demande.
 *
 * Toutes les lectures passent par `queries/account.ts`, qui pose `userId` dans
 * le `where`. Aucune requête Prisma n'est écrite ici.
 */

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/**
 * Libellés d'état de commande. Le `status` dit où en est la commande ; il n'est
 * pas reformulé en promesse de délai, qui n'est pas une donnée dont on dispose.
 */
const orderStatus: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente de paiement', tone: 'warn' },
  CONFIRMED: { label: 'Confirmée', tone: 'ok' },
  PROCESSING: { label: 'En préparation', tone: 'info' },
  SHIPPED: { label: 'Expédiée', tone: 'info' },
  DELIVERED: { label: 'Livrée', tone: 'ok' },
  CANCELLED: { label: 'Annulée', tone: 'danger' },
}

type Counter = {
  key: string
  count: number
  /** Libellés au singulier et au pluriel, le compteur fait partie de la phrase. */
  singular: string
  plural: string
  href: string
  /** Affiché à la place du compteur quand il n'y a rien à compter. */
  emptyTitle: string
  emptyAction: { label: string; href: string }
}

export default async function ComptePage() {
  const user = await requireUser()

  const [overview, orders] = await Promise.all([
    getAccountOverview(user.id),
    getMyOrders(user.id),
  ])

  const recentOrders = orders.slice(0, 3)

  const counters: Counter[] = [
    {
      key: 'commandes',
      count: overview.orders,
      singular: 'commande',
      plural: 'commandes',
      href: '/compte/commandes',
      emptyTitle: 'Aucune commande',
      emptyAction: { label: 'Voir le catalogue', href: '/c' },
    },
    {
      key: 'adresses',
      count: overview.addresses,
      singular: 'adresse',
      plural: 'adresses',
      href: '/compte/adresses',
      emptyTitle: 'Aucune adresse enregistrée',
      emptyAction: { label: 'Ajouter une adresse', href: '/compte/adresses' },
    },
    {
      key: 'vehicules',
      count: overview.vehicles,
      singular: 'véhicule',
      plural: 'véhicules',
      href: '/compte/vehicules',
      emptyTitle: 'Aucun véhicule enregistré',
      emptyAction: { label: 'Choisir mon véhicule', href: '/vehicule' },
    },
  ]

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Mon compte' }]} />

      {/* Pas de nom inventé : sans prénom renseigné, le titre reste neutre. */}
      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        {user.firstName ? `Bonjour ${user.firstName}` : 'Mon compte'}
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="tableau" />

        <div className="min-w-0 flex-1">
          {overview.openTickets > 0 ? (
            <Alert
              tone="info"
              title={
                overview.openTickets > 1
                  ? `${overview.openTickets} demandes d'assistance en cours`
                  : "1 demande d'assistance en cours"
              }
              className="mb-6"
            >
              <Link href="/contact" className="underline underline-offset-4">
                Nous écrire à ce sujet
              </Link>
            </Alert>
          ) : null}

          {/* -----------------------------------------------------------------
              Compteurs
              ----------------------------------------------------------------- */}
          <section aria-labelledby="compte-synthese">
            <h2 id="compte-synthese" className="text-lg font-bold">
              Votre compte en un coup d&apos;œil
            </h2>

            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {counters.map((counter) =>
                counter.count > 0 ? (
                  <Card as="li" key={counter.key} interactive>
                    <Link
                      href={counter.href}
                      className="flex min-h-11 flex-col justify-center px-4 py-4"
                    >
                      <span className="text-2xl font-extrabold">{counter.count}</span>
                      <span className="mt-0.5 text-sm text-muted-strong">
                        {counter.count > 1 ? counter.plural : counter.singular}
                      </span>
                    </Link>
                  </Card>
                ) : (
                  <Card as="li" key={counter.key} className="bg-surface-soft">
                    <div className="flex min-h-11 flex-col justify-center gap-1 px-4 py-4">
                      <span className="text-sm font-semibold">{counter.emptyTitle}</span>
                      <Link
                        href={counter.emptyAction.href}
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4 sm:min-h-0"
                      >
                        {counter.emptyAction.label}
                      </Link>
                    </div>
                  </Card>
                ),
              )}
            </ul>
          </section>

          {/* -----------------------------------------------------------------
              Dernières commandes
              ----------------------------------------------------------------- */}
          <section aria-labelledby="compte-commandes" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="compte-commandes" className="text-lg font-bold">
                Dernières commandes
              </h2>
              {orders.length > 3 ? (
                <Link
                  href="/compte/commandes"
                  className="text-sm font-semibold underline underline-offset-4 hover:text-brand"
                >
                  Toutes mes commandes
                </Link>
              ) : null}
            </div>

            {recentOrders.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<IconCart className="size-8" />}
                title="Aucune commande pour le moment."
                action={{ label: 'Voir le catalogue', href: '/c' }}
              />
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {recentOrders.map((order) => {
                  const etat = orderStatus[order.status] ?? {
                    label: 'État inconnu',
                    tone: 'neutral' as const,
                  }
                  const date = order.placedAt ?? order.createdAt

                  return (
                    <Card as="li" key={order.id} interactive>
                      {/* Toute la ligne est cliquable : une seule cible, large. */}
                      <Link
                        href={`/compte/commandes/${order.id}`}
                        className="flex min-h-11 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold">{order.reference}</span>
                          <span className="mt-0.5 block text-sm text-muted">
                            <time dateTime={date.toISOString()}>{dateFormatter.format(date)}</time>
                            {' · '}
                            {order.itemCount} {order.itemCount > 1 ? 'articles' : 'article'}
                          </span>
                        </span>

                        <span className="flex flex-wrap items-center gap-3 sm:shrink-0">
                          <Badge tone={etat.tone}>{etat.label}</Badge>
                          <span className="font-bold">{formatPrice(order.totalCents)}</span>
                          <IconChevronRight className="size-5 text-muted-strong" />
                        </span>
                      </Link>
                    </Card>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
