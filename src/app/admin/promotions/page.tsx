import type { Metadata } from 'next'
import type { PromotionType } from '@prisma/client'
import { requireStaff } from '@/lib/admin/guard'
import { listPromotions } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'
import { can } from '@/lib/admin/permissions'
import { PromotionForm, type PromotionInitiale } from '@/components/admin/PromotionForm'
import { basculerPromotion } from '@/lib/actions/admin-promotions'
import type { Promotion } from '@prisma/client'

/**
 * Codes promotionnels.
 *
 * Création, modification et activation des codes. Le panier et la commande
 * les lisent (lib/promotions.ts) : un code actif marche tout de suite.
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

const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')
const enEuros = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))

function pourLaSaisie(p: Promotion): PromotionInitiale {
  return {
    id: p.id,
    code: p.code,
    label: p.label,
    type: p.type,
    value: p.type === 'PERCENT' ? String(p.value / 100).replace('.', ',') : p.type === 'FIXED' ? enEuros(p.value) : '',
    minOrder: enEuros(p.minOrderCents),
    maxRedemptions: p.maxRedemptions?.toString() ?? '',
    maxPerCustomer: p.maxPerCustomer?.toString() ?? '',
    startsAt: jour(p.startsAt),
    endsAt: jour(p.endsAt),
    freeShipping: p.freeShipping,
    active: p.active,
  }
}

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ modifier?: string }>
}) {
  const staff = await requireStaff('promotions.view')
  const peutModifier = can(staff.role, 'promotions.edit')
  const { modifier } = await searchParams

  const promotions = await listPromotions()
  const enCours = modifier ? promotions.find((p) => p.id === modifier) : undefined
  const plural = promotions.length > 1 ? 's' : ''

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold">Promotions</h1>

      {peutModifier ? (
        enCours ? (
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Modifier le code <span className="font-mono">{enCours.code}</span>{' '}
              <a href="/admin/promotions" className="ml-2 text-xs font-normal underline">
                Fermer
              </a>
            </h2>
            <PromotionForm key={enCours.id} initiale={pourLaSaisie(enCours)} />
          </Card>
        ) : (
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Créer un code promo</h2>
            <PromotionForm />
          </Card>
        )
      ) : null}

      <section aria-labelledby="promotions-resultats" className="flex flex-col gap-2">
        <h2 id="promotions-resultats" className="text-sm font-semibold">
          {promotions.length} code{plural} enregistré{plural}
        </h2>

        {promotions.length === 0 ? (
          <EmptyState title="Aucun code promotionnel." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
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
                      Active
                    </th>
                    {peutModifier ? (
                      <th scope="col" className={thClass}>
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
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
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {typeCopy[promotion.type]}
                      </td>
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
                      <td className={tdClass}>
                        {promotion.active ? (
                          <Badge tone="ok">Active</Badge>
                        ) : (
                          <Badge tone="neutral">Inactive</Badge>
                        )}
                      </td>
                      {peutModifier ? (
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <div className="flex items-center gap-3">
                            <a href={`/admin/promotions?modifier=${promotion.id}`} className="text-xs font-semibold underline">
                              Modifier
                            </a>
                            <form action={basculerPromotion}>
                              <input type="hidden" name="id" value={promotion.id} />
                              <button type="submit" className="text-xs underline">
                                {promotion.active ? 'Désactiver' : 'Activer'}
                              </button>
                            </form>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <p className="text-sm text-muted">
        Le client tape le code dans son panier. La remise est recalculée à la commande, et une
        utilisation n&apos;est comptée qu&apos;une fois le paiement reçu.
      </p>
    </div>
  )
}
