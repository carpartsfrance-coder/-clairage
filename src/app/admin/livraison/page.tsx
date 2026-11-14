import type { Metadata } from 'next'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { prisma } from '@/lib/db'
import { formatPrice } from '@/lib/identity'
import { nomDuPays, trierLesPays } from '@/lib/livraison-pays'
import { MethodForm, ZoneForm } from '@/components/admin/ShippingForms'
import { Badge } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'

/*
  Pré-rendu partiel : cette page n'est pas encore reprise. `instant = false`
  la dispense de la vérification ; elle se comporte exactement comme avant.
  Retirer cette ligne, c'est la faire entrer dans le nouveau modèle — voir le
  commentaire de `cacheComponents` dans next.config.ts.
*/
export const instant = false

export const metadata: Metadata = {
  title: 'Livraison',
  robots: { index: false, follow: false },
}

/**
 * Livraison : zones (les pays livrés) et modes (prix, délai, transporteur).
 *
 * Ce que cette page règle, le site l'applique partout : choix et prix au
 * moment de commander, accroche des fiches, page « Livraison et retours »,
 * bandeau « livraison offerte ». Les actions sont dans
 * `lib/actions/admin-livraison.ts`.
 */

const h2Class = 'text-sm font-bold'
const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'
const detailsClass = 'rounded-md border border-line p-3 [&_summary]:cursor-pointer'

export default async function AdminLivraisonPage() {
  const staff = await requireStaff('settings.view')
  const peutModifier = can(staff.role, 'settings.edit')

  const zones = await prisma.shippingZone.findMany({
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
    include: { methods: { orderBy: [{ position: 'asc' }, { priceCents: 'asc' }] } },
  })

  const zoneDuPays: Record<string, string> = {}
  for (const zone of zones) for (const code of zone.countries) zoneDuPays[code] = zone.label
  const prisAilleurs = (zoneId: string | null) =>
    Object.fromEntries(
      zones
        .filter((zone) => zone.id !== zoneId)
        .flatMap((zone) => zone.countries.map((code) => [code, zone.label])),
    )

  const paysOuverts = trierLesPays(
    zones.filter((zone) => zone.methods.some((m) => m.active)).flatMap((zone) => zone.countries),
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-extrabold">Livraison</h1>

      <Alert tone="info" title="Comment ça marche">
        Une <strong>zone</strong> regroupe des pays ; chaque zone a ses <strong>modes</strong> de
        livraison, avec leur prix. À la commande, le client choisit son pays puis un mode actif de
        la zone de ce pays. Un pays sans mode actif n&apos;est pas proposé. Le prix facturé est
        toujours relu ici au moment de la commande.
      </Alert>

      <p className="text-[13px]">
        <strong>Pays proposés à la commande aujourd&apos;hui :</strong>{' '}
        {paysOuverts.length > 0 ? paysOuverts.map((p) => p.nom).join(', ') : 'aucun'}.
      </p>

      {!peutModifier ? (
        <Alert tone="warn">Votre rôle permet de consulter cette page, pas de la modifier.</Alert>
      ) : null}

      {zones.length === 0 ? (
        <EmptyState title="Aucune zone de livraison." description="Créez-en une ci-dessous." />
      ) : null}

      {zones.map((zone) => (
        <section key={zone.id} aria-labelledby={`zone-${zone.id}`}>
          <Card className="flex flex-col gap-4 p-4">
            <div>
              <h2 id={`zone-${zone.id}`} className="text-base font-extrabold">
                {zone.label}
              </h2>
              <p className="mt-1 text-[12px] text-muted-strong">
                {zone.countries.length} pays : {zone.countries.map(nomDuPays).join(', ')}
              </p>
            </div>

            {zone.methods.length === 0 ? (
              <Alert tone="warn">
                Aucun mode de livraison : les pays de cette zone ne sont pas proposés à la
                commande.
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">Modes de livraison de la zone {zone.label}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-soft">
                      <th scope="col" className={thClass}>Mode</th>
                      <th scope="col" className={thClass}>Prix</th>
                      <th scope="col" className={thClass}>Offerte dès</th>
                      <th scope="col" className={thClass}>Délai</th>
                      <th scope="col" className={thClass}>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.methods.map((m) => (
                      <tr key={m.id} className="border-b border-line">
                        <td className={tdClass}>
                          <span className="font-semibold">{m.label}</span>
                          {m.carrier ? (
                            <span className="block text-xs text-muted-strong">{m.carrier}</span>
                          ) : null}
                        </td>
                        <td className={tdClass}>
                          {m.priceCents === 0 ? 'Gratuit' : formatPrice(m.priceCents)}
                        </td>
                        <td className={tdClass}>
                          {m.freeFromCents !== null ? formatPrice(m.freeFromCents) : '—'}
                        </td>
                        <td className={tdClass}>
                          {m.minDays !== null && m.maxDays !== null
                            ? `${m.minDays} à ${m.maxDays} j`
                            : '—'}
                        </td>
                        <td className={tdClass}>
                          {m.active ? (
                            <Badge tone="ok">Proposé</Badge>
                          ) : (
                            <Badge tone="neutral">Désactivé</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {peutModifier ? (
              <div className="flex flex-col gap-2">
                {zone.methods.map((m) => (
                  <details key={m.id} className={detailsClass}>
                    <summary className="text-[12px] font-bold">Modifier « {m.label} »</summary>
                    <div className="mt-3">
                      <MethodForm
                        zoneId={zone.id}
                        mode={{
                          id: m.id,
                          label: m.label,
                          carrier: m.carrier,
                          priceCents: m.priceCents,
                          freeFromCents: m.freeFromCents,
                          minDays: m.minDays,
                          maxDays: m.maxDays,
                          position: m.position,
                          active: m.active,
                        }}
                      />
                    </div>
                  </details>
                ))}
                <details className={detailsClass}>
                  <summary className="text-[12px] font-bold">+ Ajouter un mode à « {zone.label} »</summary>
                  <div className="mt-3">
                    <MethodForm zoneId={zone.id} />
                  </div>
                </details>
                <details className={detailsClass}>
                  <summary className="text-[12px] font-bold">Modifier la zone et ses pays</summary>
                  <div className="mt-3">
                    <ZoneForm
                      zone={{ id: zone.id, label: zone.label, countries: zone.countries }}
                      paysPrisAilleurs={prisAilleurs(zone.id)}
                    />
                  </div>
                </details>
              </div>
            ) : null}
          </Card>
        </section>
      ))}

      {peutModifier ? (
        <section aria-labelledby="nouvelle-zone">
          <Card className="flex flex-col gap-3 p-4">
            <h2 id="nouvelle-zone" className={h2Class}>
              Nouvelle zone
            </h2>
            <p className="text-[12px] text-muted-strong">
              Par exemple « Europe » avec les pays de l&apos;Union européenne, puis un mode
              « Livraison à domicile » avec son prix. Les pays déjà dans une autre zone sont grisés.
            </p>
            <ZoneForm paysPrisAilleurs={zoneDuPays} />
          </Card>
        </section>
      ) : null}

      <Alert tone="warn" title="À savoir avant d'ouvrir d'autres pays">
        <ul className="list-disc pl-5">
          <li>
            Les envois <strong>hors Union européenne</strong> (Suisse, Royaume-Uni, Norvège…) passent
            en douane : le client peut avoir des droits et une TVA à payer à la réception.
          </li>
          <li>
            Ventes à des particuliers dans d&apos;autres pays de l&apos;UE : au-delà de 10 000 € par
            an au total, la TVA du pays du client s&apos;applique (guichet unique OSS). À voir avec
            votre comptable.
          </li>
          <li>
            Un mode « point relais » n&apos;est utilisable que si le client peut choisir son point
            au moment de commander, ce que le site ne propose pas encore.
          </li>
        </ul>
      </Alert>
    </div>
  )
}
