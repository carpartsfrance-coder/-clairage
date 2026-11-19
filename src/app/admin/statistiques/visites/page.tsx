import { connection } from 'next/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import {
  ECRANS,
  FILTRES_VISITES,
  listerVisites,
  periode,
  type Ecran,
  type FiltreVisites,
} from '@/lib/queries/mesure'
import { Card, EmptyState } from '@/components/ui/Surface'
import { Onglets } from '@/components/admin/statistiques/Onglets'
import {
  duree,
  formatJourHeure,
  nb,
  nomPage,
  nomSource,
} from '@/components/admin/statistiques/format'

/**
 * Les visites, une par une.
 *
 * C'est l'écran qui répond à « que font-ils ? ». Les totaux disent qu'une
 * étape perd 98 % des visiteurs ; cette liste permet d'ouvrir les visites qui
 * ont buté dessus et de lire ce qui s'est passé, geste après geste. À
 * 165 visites par semaine, en lire vingt apprend plus qu'aucun tableau.
 */

export const metadata: Metadata = { title: 'Visites', robots: { index: false, follow: false } }

const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const td = 'px-3 py-2 align-top'

function Pastille({ children, ton }: { children: React.ReactNode; ton: 'ok' | 'brand' | 'danger' | 'neutre' }) {
  const cls = {
    ok: 'bg-ok-soft text-[#1f5a39]',
    brand: 'bg-brand/10 text-brand',
    danger: 'bg-danger/10 text-danger',
    neutre: 'bg-surface-muted text-muted-strong',
  }[ton]
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>
}

export default async function VisitesPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string; filtre?: string; ecran?: string; rang?: string }>
}) {
  await connection()
  await requireStaff('dashboard.view')
  const params = await searchParams
  const p = periode(Number(params.jours ?? 7))
  const filtre: FiltreVisites =
    params.filtre && params.filtre in FILTRES_VISITES ? (params.filtre as FiltreVisites) : 'toutes'
  const ecran: Ecran | null = ECRANS.includes(params.ecran as Ecran) ? (params.ecran as Ecran) : null
  const rang = Math.max(0, Number(params.rang ?? 0) || 0)
  const { visites, total, parPage } = await listerVisites(p, filtre, ecran, rang)

  const lien = (q: Record<string, string | number | null>) => {
    const u = new URLSearchParams()
    const tout: Record<string, string | number | null> = { jours: p.jours, filtre, ecran, rang: null, ...q }
    for (const [k, v] of Object.entries(tout)) {
      if (v !== null && v !== undefined && v !== '' && !(k === 'filtre' && v === 'toutes')) u.set(k, String(v))
    }
    return `/admin/statistiques/visites?${u}`
  }
  const pages = Math.ceil(total / parPage)

  return (
    <div className="flex flex-col gap-5">
      <Onglets actif="visites" jours={p.jours} conserver={{ filtre: filtre === 'toutes' ? null : filtre, ecran }} />

      <div className="flex flex-col gap-2">
        <nav aria-label="Filtrer les visites" className="flex flex-wrap gap-1.5 text-sm">
          {(Object.keys(FILTRES_VISITES) as FiltreVisites[]).map((f) => (
            <Link
              key={f}
              href={lien({ filtre: f })}
              aria-current={filtre === f ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 ${filtre === f ? 'border-ink bg-ink text-white' : 'border-line hover:border-line-strong'}`}
            >
              {FILTRES_VISITES[f]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filtrer par écran" className="flex flex-wrap gap-1.5 text-sm">
          {[null, ...ECRANS].map((e) => (
            <Link
              key={e ?? 'tous'}
              href={lien({ ecran: e })}
              aria-current={ecran === e ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 ${ecran === e ? 'border-ink bg-ink text-white' : 'border-line hover:border-line-strong'}`}
            >
              {e ? e[0].toUpperCase() + e.slice(1) : 'Tous les écrans'}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-sm text-muted-strong">
        <strong className="text-ink">{nb(total)}</strong> visite{total > 1 ? 's' : ''} sur la période. Ouvrez-en une pour la lire dans l’ordre, geste après geste.
      </p>

      {visites.length === 0 ? (
        <EmptyState
          title="Aucune visite ne correspond."
          description={
            filtre === 'detail'
              ? 'Allumez le mode détaillé depuis la vue d’ensemble, puis parcourez la boutique dans ce même navigateur : votre visite apparaîtra ici.'
              : 'Essayez une autre période ou un autre filtre.'
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-soft">
                <th className={th}>Début</th>
                <th className={th}>Provenance · écran</th>
                <th className={th}>Arrivée → départ</th>
                <th className={`${th} text-right`}>Pages</th>
                <th className={`${th} text-right`}>Durée</th>
                <th className={th}>Jusqu’où</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visites.map((v) => (
                <tr key={v.visit} className="border-b border-line last:border-0 hover:bg-surface-soft">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatJourHeure(v.debut)}</td>
                  <td className={td}>
                    <span className="block max-w-[12rem] truncate font-semibold">{nomSource(v.source)}</span>
                    <span className="text-xs text-muted-strong">
                      <span className="capitalize">{v.device ?? '—'}</span>
                      {v.largeur ? ` · ${v.largeur} px` : ''}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="block max-w-[22rem] truncate font-mono text-xs">{nomPage(v.entree) ?? v.entree}</span>
                    {v.sortie && v.sortie !== v.entree ? (
                      <span className="block max-w-[22rem] truncate font-mono text-xs text-muted-strong">→ {nomPage(v.sortie) ?? v.sortie}</span>
                    ) : null}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{nb(v.pages)}</td>
                  <td className={`${td} text-right tabular-nums`}>{duree(v.ms)}</td>
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {v.payee ? <Pastille ton="ok">Payée</Pastille> : v.commande ? <Pastille ton="brand">Commande</Pastille> : v.panier ? <Pastille ton="brand">Panier</Pastille> : v.ajout ? <Pastille ton="brand">Ajout panier</Pastille> : null}
                      {v.gene ? <Pastille ton="danger">Gêne</Pastille> : null}
                      {v.points > 0 ? <Pastille ton="neutre">Rejouable</Pastille> : null}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    <Link href={`/admin/statistiques/visites/${encodeURIComponent(v.visit)}?jours=${p.jours}`} className="font-semibold text-brand underline underline-offset-2">
                      Lire
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages de résultats" className="flex items-center justify-between text-sm">
          {rang > 0 ? <Link href={lien({ rang: rang - 1 })} className="font-semibold underline">← Plus récentes</Link> : <span />}
          <span className="text-muted-strong">Page {rang + 1} sur {pages}</span>
          {rang + 1 < pages ? <Link href={lien({ rang: rang + 1 })} className="font-semibold underline">Plus anciennes →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  )
}
