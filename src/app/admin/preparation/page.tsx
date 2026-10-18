import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'
import { requireStaff } from '@/lib/admin/guard'
import { listToPrepare } from '@/lib/queries/admin'

export const metadata: Metadata = {
  title: 'Préparation',
  robots: { index: false, follow: false },
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Au-delà de ce nombre de jours, la commande est signalée en rouge. */
const AGE_ALERTE_JOURS = 3

/**
 * Une ligne de la liste de prélèvement : une référence physique, la quantité
 * totale à sortir du stock, et les commandes qui l’attendent.
 */
type LigneDePrelevement = {
  sku: string
  designation: string
  quantite: number
  commandes: Set<string>
}

function joursDepuis(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

export default async function PreparationPage() {
  // Préparer une commande est un droit distinct de la simple lecture.
  await requireStaff('orders.fulfil')

  const orders = await listToPrepare()

  /*
    Agrégation des articles à prélever.

    Un kit n’existe pas en rayon : ce qu’on va chercher, ce sont ses
    composants. On décompose donc chaque ligne de kit (quantité du composant ×
    quantité commandée) et on regroupe le tout par SKU, pour ne faire qu’un
    seul tour du stock.
  */
  const parSku = new Map<string, LigneDePrelevement>()

  function ajouter(sku: string, designation: string, quantite: number, orderId: string) {
    const ligne = parSku.get(sku)
    if (ligne) {
      ligne.quantite += quantite
      ligne.commandes.add(orderId)
      return
    }
    parSku.set(sku, { sku, designation, quantite, commandes: new Set([orderId]) })
  }

  for (const order of orders) {
    for (const line of order.lines) {
      const composants = line.variant?.components ?? []
      if (composants.length > 0) {
        for (const composant of composants) {
          ajouter(
            composant.component.sku,
            `${composant.component.product.name} — ${composant.component.name}`,
            composant.quantity * line.quantity,
            order.id,
          )
        }
      } else {
        // Pas de kit : on prélève la variante vendue, telle qu’elle a été
        // facturée (nom figé dans la ligne de commande).
        ajouter(line.sku, `${line.productName} — ${line.variantName}`, line.quantity, order.id)
      }
    }
  }

  const prelevement = [...parSku.values()].sort((a, b) => a.sku.localeCompare(b.sku, 'fr'))
  const totalUnites = prelevement.reduce((somme, ligne) => somme + ligne.quantite, 0)

  /*
    Une commande déjà partiellement expédiée reste dans la file, et ses lignes y
    sont comptées en entier : le détail de ce qui est parti vit dans `Shipment`,
    que `listToPrepare` ne lit pas. On le dit à l’écran plutôt que de présenter
    les quantités comme exactes.
  */
  const partiellementExpediees = orders.filter(
    (order) => order.fulfillmentStatus === 'PARTIALLY_FULFILLED',
  ).length

  return (
    <div className="container-page py-6">
      <h1 className="text-2xl leading-tight font-extrabold">Préparation</h1>
      <p className="mt-1.5 text-sm text-muted-strong">
        Commandes payées, non expédiées ou partiellement expédiées, la plus ancienne
        d&apos;abord.
      </p>

      {orders.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Rien à préparer."
            description="Toutes les commandes payées ont été expédiées."
          />
        </div>
      ) : (
        <>
          {/* ---------------- Liste de prélèvement, agrégée ---------------- */}
          <section aria-labelledby="preparation-prelevement" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="preparation-prelevement" className="text-lg font-bold">
                Articles à prélever
              </h2>
              <p className="text-xs text-muted">
                {prelevement.length} référence{prelevement.length > 1 ? 's' : ''} ·{' '}
                {totalUnites} unité{totalUnites > 1 ? 's' : ''} · {orders.length} commande
                {orders.length > 1 ? 's' : ''}
              </p>
            </div>

            <p className="mt-1.5 max-w-prose text-sm text-muted-strong">
              Les kits sont décomposés en composants, parce que c&apos;est ce qu&apos;on prélève
              réellement en rayon.
            </p>

            {partiellementExpediees > 0 ? (
              <p className="mt-1.5 max-w-prose text-sm text-warn">
                Expédition partielle en cours sur {partiellementExpediees} commande
                {partiellementExpediees > 1 ? 's' : ''} : leurs lignes sont comptées en entier, cet
                écran ne sait pas encore quelles unités sont déjà parties.
              </p>
            ) : null}

            <Card className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <caption className="sr-only">
                  Quantités à prélever, regroupées par référence, pour toutes les commandes en
                  attente d&apos;expédition.
                </caption>
                <thead>
                  <tr className="border-b border-line bg-surface-soft text-left">
                    <th scope="col" className="px-3 py-2 font-semibold">
                      SKU
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Désignation
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Quantité totale
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Commandes concernées
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {prelevement.map((ligne) => (
                    <tr key={ligne.sku} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-ink">
                        {ligne.sku}
                      </td>
                      <td className="px-3 py-2 text-muted-strong">{ligne.designation}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {ligne.quantite}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-strong">
                        {ligne.commandes.size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <p className="mt-2 text-xs text-muted">
              L&apos;impression et l&apos;export de la liste ne sont pas encore disponibles.
            </p>
          </section>

          {/* ---------------- Détail commande par commande ---------------- */}
          <section aria-labelledby="preparation-commandes" className="mt-10">
            <h2 id="preparation-commandes" className="text-lg font-bold">
              Par commande
            </h2>
            <p className="mt-1.5 text-sm text-muted-strong">
              Le détail de chaque colis à constituer, kits dépliés.
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {orders.map((order) => {
                const age = order.placedAt ? joursDepuis(order.placedAt) : null
                const enRetard = age !== null && age > AGE_ALERTE_JOURS

                return (
                  <Card as="li" key={order.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/admin/commandes/${order.id}`}
                        className="inline-flex min-h-9 items-center text-sm font-bold text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand"
                      >
                        {order.reference}
                      </Link>

                      {order.placedAt ? (
                        <span className="text-xs text-muted-strong">
                          payée le{' '}
                          <time dateTime={order.placedAt.toISOString()}>
                            {dateFormatter.format(order.placedAt)}
                          </time>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">date de paiement non enregistrée</span>
                      )}

                      {age !== null ? (
                        <span
                          className={
                            enRetard
                              ? 'text-xs font-semibold text-danger'
                              : 'text-xs text-muted-strong'
                          }
                        >
                          {age === 0 ? 'aujourd’hui' : `${age} jour${age > 1 ? 's' : ''}`}
                        </span>
                      ) : null}

                      {order.fulfillmentStatus === 'PARTIALLY_FULFILLED' ? (
                        <Badge tone="warn">Partiellement expédiée</Badge>
                      ) : null}

                      <span className="ml-auto min-w-0 max-w-full truncate text-xs text-muted-strong">
                        {order.email}
                      </span>
                    </div>

                    <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
                      {order.lines.map((line) => {
                        const composants = line.variant?.components ?? []
                        return (
                          <li key={line.id} className="text-sm">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-semibold tabular-nums">{line.quantity} ×</span>
                              <span className="font-mono text-xs font-semibold text-muted-strong">
                                {line.sku}
                              </span>
                              <span className="text-slate-ink">
                                {line.productName} — {line.variantName}
                              </span>
                            </div>

                            {composants.length > 0 ? (
                              <ul className="mt-0.5 flex flex-col gap-0.5 pl-6">
                                {composants.map((composant) => (
                                  <li key={composant.id} className="text-xs text-muted">
                                    {composant.quantity * line.quantity} ×{' '}
                                    <span className="font-mono">{composant.component.sku}</span>{' '}
                                    {composant.component.product.name} —{' '}
                                    {composant.component.name}
                                    {/* Même distinction que la fiche produit et le panier. */}
                                    {composant.required ? null : ' · complément'}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
