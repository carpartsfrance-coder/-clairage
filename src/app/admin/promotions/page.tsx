import type { Metadata } from 'next'
import type { PromotionType } from '@prisma/client'
import { requireStaff } from '@/lib/admin/guard'
import { listPromotions } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Badge } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'

/**
 * Codes promotionnels.
 *
 * Écran de lecture. Il n'y a pas de bouton de création : l'écriture n'est pas
 * implémentée, et surtout un code créé ici ne remiserait rien — le tunnel de
 * commande ne lit pas encore cette table. L'avertissement en tête de page le
 * dit, parce qu'une liste de codes laisse spontanément croire le contraire.
 */

export const metadata: Metadata = {
  title: 'Promotions',
  robots: { index: false, follow: false },
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

const typeCopy: Record<PromotionType, string> = {
  PERCENT: 'Pourcentage',
  FIXED: 'Montant fixe',
  FREE_SHIPPING: 'Livraison offerte',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

/**
 * `value` porte des points de base quand le type est PERCENT (schéma Prisma) :
 * 1 500 valent 15 %. Un affichage direct annoncerait « 1500 % ».
 */
function valueLabel(type: PromotionType, value: number): string {
  if (type === 'PERCENT') {
    return `${(value / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
  }
  if (type === 'FIXED') return formatPrice(value)
  return '—'
}

/** Une période ouverte d'un seul côté se dit, elle ne se devine pas. */
function periodLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt && !endsAt) return 'sans limite'
  if (startsAt && endsAt) {
    return `${dateFormatter.format(startsAt)} – ${dateFormatter.format(endsAt)}`
  }
  if (startsAt) return `à partir du ${dateFormatter.format(startsAt)}`
  return `jusqu'au ${dateFormatter.format(endsAt as Date)}`
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'

export default async function AdminPromotionsPage() {
  await requireStaff('promotions.view')

  const promotions = await listPromotions()
  const plural = promotions.length > 1 ? 's' : ''

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">Promotions</h1>
        <p className="mt-1 text-sm text-muted-strong">
          {promotions.length} code{plural} enregistré{plural}.
        </p>
      </div>

      <Alert tone="warn" title="Ces codes ne remisent rien pour l’instant.">
        Le modèle de données existe, mais ni le panier ni le tunnel de commande ne lisent cette
        table : la remise d&apos;une commande est aujourd&apos;hui toujours de zéro. Un code
        communiqué à un client ne fonctionnerait pas.
      </Alert>

      {promotions.length === 0 ? (
        <EmptyState title="Aucun code promotionnel." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <caption className="sr-only">Codes promotionnels enregistrés</caption>
              <thead>
                <tr className="border-b border-line bg-surface-soft">
                  <th scope="col" className={thClass}>
                    Code
                  </th>
                  <th scope="col" className={thClass}>
                    Libellé
                  </th>
                  <th scope="col" className={thClass}>
                    Type
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Valeur
                  </th>
                  <th scope="col" className={thClass}>
                    Période
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Minimum de commande
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Utilisations
                  </th>
                  <th scope="col" className={thClass}>
                    Cumulable
                  </th>
                  <th scope="col" className={thClass}>
                    Active
                  </th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => (
                  <tr key={promotion.id} className="border-b border-line last:border-b-0">
                    <th scope="row" className={`${tdClass} text-left font-mono font-semibold`}>
                      {promotion.code}
                    </th>
                    <td className={tdClass}>
                      <span className="block max-w-[22rem]">{promotion.label}</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{typeCopy[promotion.type]}</td>
                    <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
                      {valueLabel(promotion.type, promotion.value)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {periodLabel(promotion.startsAt, promotion.endsAt)}
                    </td>
                    <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
                      {promotion.minOrderCents !== null ? (
                        formatPrice(promotion.minOrderCents)
                      ) : (
                        <span className="text-muted">aucun</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
                      {promotion.redemptions} / {promotion.maxRedemptions ?? 'illimité'}
                    </td>
                    <td className={tdClass}>{promotion.stackable ? 'Oui' : 'Non'}</td>
                    <td className={tdClass}>
                      {promotion.active ? (
                        <Badge tone="ok">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-sm text-muted">
        La création et la modification des codes depuis le back-office ne sont pas disponibles :
        ils se saisissent en base.
      </p>
    </div>
  )
}
