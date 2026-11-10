import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { lireStatistiques, periode } from '@/lib/queries/mesure'
import { Card, EmptyState } from '@/components/ui/Surface'

/**
 * Statistiques de visite : où vont les visiteurs, ce qu'ils cliquent, où ils
 * s'arrêtent. Lu dans la mesure d'audience anonyme du site (Mesure.tsx).
 */

export const metadata: Metadata = { title: 'Statistiques', robots: { index: false, follow: false } }

const nb = (n: number) => n.toLocaleString('fr-FR')
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—')

const NOMS_PAGES: Array<[RegExp, string]> = [
  [/^\/$/, 'Accueil'],
  [/^\/panier$/, 'Panier'],
  [/^\/commande$/, 'Commande (adresse, livraison)'],
  [/^\/commande\/[^/]+\/paiement$/, 'Paiement'],
  [/^\/commande\/[^/]+\/confirmation$/, 'Commande confirmée'],
  [/^\/vehicule\/resultats/, 'Résultats pour le véhicule'],
  [/^\/recherche$/, 'Recherche'],
  [/^\/c$/, 'Toutes les catégories'],
]
function nomPage(path: string) {
  for (const [re, nom] of NOMS_PAGES) if (re.test(path)) return nom
  return null
}

const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const td = 'px-3 py-2 align-top'

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string; page?: string }>
}) {
  await requireStaff('dashboard.view')
  const params = await searchParams
  const p = periode(Number(params.jours ?? 7))
  const page = params.page?.startsWith('/') ? params.page : null
  const s = await lireStatistiques(p, page)
  // Le choix du véhicule n'est pas une étape obligée : il est montré à part.
  const vehicule = s.etapes.find((e) => e.cle === 'vehicule')?.visites ?? 0
  const etapes = s.etapes.filter((e) => e.cle !== 'vehicule')
  const base = etapes[0]?.visites ?? 0
  const lien = (q: Record<string, string | number | null>) => {
    const u = new URLSearchParams()
    const tout = { jours: p.jours, page, ...q }
    for (const [k, v] of Object.entries(tout)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v))
    return `/admin/statistiques?${u}`
  }
  const maxJour = Math.max(1, ...s.jours.map((j) => j.visites))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Statistiques de visite</h1>
          <p className="mt-1 text-sm text-muted-strong">
            Mesure anonyme, sans cookie. L’équipe n’est pas comptée.
          </p>
        </div>
        <nav aria-label="Période" className="flex gap-1 rounded-lg bg-surface-muted p-1 text-sm">
          {[1, 7, 30, 90].map((j) => (
            <Link
              key={j}
              href={lien({ jours: j })}
              aria-current={p.jours === j ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-semibold ${p.jours === j ? 'bg-white shadow-soft' : 'text-muted-strong'}`}
            >
              {j === 1 ? '24 h' : `${j} jours`}
            </Link>
          ))}
        </nav>
      </div>

      {s.resume.visites === 0 ? (
        <EmptyState
          title="Aucune visite mesurée sur cette période."
          description="Les chiffres apparaissent dès les premières visites. Vos propres visites ne comptent pas (le back-office vous exclut de la mesure)."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Visites', nb(s.resume.visites)],
              ['Pages vues', nb(s.resume.pages)],
              ['Pages par visite', (s.resume.pages / Math.max(1, s.resume.visites)).toFixed(1).replace('.', ',')],
              ['Clics', nb(s.resume.clics)],
            ].map(([l, v]) => (
              <Card key={l} className="p-4">
                <p className="text-xs font-semibold text-muted-strong">{l}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{v}</p>
              </Card>
            ))}
          </div>

          {s.jours.length > 1 ? (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold">Visites par jour</h2>
              <div className="flex h-28 items-end gap-1">
                {s.jours.map((j) => (
                  <div key={String(j.jour)} className="group relative flex-1" title={`${new Date(j.jour).toLocaleDateString('fr-FR')} : ${j.visites} visite(s)`}>
                    <div className="rounded-t bg-ink/80" style={{ height: `${Math.max(3, (j.visites / maxJour) * 100)}%` }} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <section aria-labelledby="t-entonnoir">
            <h2 id="t-entonnoir" className="mb-2 text-base font-bold">Le parcours d’achat : où ça bloque</h2>
            <Card className="p-4">
              <ol className="flex flex-col gap-3">
                {etapes.map((e, i) => {
                  const avant = i > 0 ? etapes[i - 1].visites : e.visites
                  const perte = i > 0 && avant > 0 ? Math.round(((avant - e.visites) / avant) * 100) : null
                  return (
                    <li key={e.cle} className="grid gap-1 sm:grid-cols-[16rem_minmax(0,1fr)_9rem] sm:items-center sm:gap-4">
                      <span className="text-sm font-semibold">{e.label}</span>
                      <div className="h-6 rounded bg-surface-muted">
                        <div className="h-6 rounded bg-brand" style={{ width: `${base ? Math.max(1, (e.visites / base) * 100) : 0}%` }} />
                      </div>
                      <span className="text-sm tabular-nums">
                        <strong>{nb(e.visites)}</strong> <span className="text-muted-strong">({pct(e.visites, base)})</span>
                        {perte !== null && perte > 0 ? <span className="block text-xs text-danger">−{perte} % à cette étape</span> : null}
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-4 text-sm">
                <strong>{nb(vehicule)}</strong> visite{vehicule > 1 ? 's' : ''} ({pct(vehicule, base)}) ont choisi un véhicule ou ouvert la page d’un véhicule.
              </p>
              <p className="mt-2 text-xs text-muted-strong">
                Chaque ligne compte les visites qui sont arrivées au moins une fois à cette étape. La plus forte perte en rouge montre où les visiteurs abandonnent.
              </p>
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="t-pages">
              <h2 id="t-pages" className="mb-2 text-base font-bold">Pages les plus visitées</h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-surface-soft"><th className={th}>Page</th><th className={`${th} text-right`}>Visites</th><th className={`${th} text-right`}>Vues</th><th className={th} /></tr></thead>
                  <tbody>
                    {s.pages.map((r) => (
                      <tr key={r.path} className="border-b border-line last:border-0">
                        <td className={td}>
                          {nomPage(r.path) ? <span className="block font-semibold">{nomPage(r.path)}</span> : null}
                          <a href={r.path} target="_blank" rel="noreferrer" className="block max-w-[22rem] truncate font-mono text-xs text-muted-strong hover:underline">{r.path}</a>
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{nb(r.visites)}</td>
                        <td className={`${td} text-right tabular-nums text-muted-strong`}>{nb(r.vues)}</td>
                        <td className={td}><Link href={lien({ page: r.path })} className="text-xs font-semibold underline">Clics</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            <section aria-labelledby="t-sorties">
              <h2 id="t-sorties" className="mb-2 text-base font-bold">Où les visiteurs s’arrêtent</h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-surface-soft"><th className={th}>Dernière page vue</th><th className={`${th} text-right`}>Visites terminées ici</th></tr></thead>
                  <tbody>
                    {s.sorties.map((r) => (
                      <tr key={r.path} className="border-b border-line last:border-0">
                        <td className={td}>
                          {nomPage(r.path) ? <span className="block font-semibold">{nomPage(r.path)}</span> : null}
                          <span className="block max-w-[24rem] truncate font-mono text-xs text-muted-strong">{r.path}</span>
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{nb(r.sorties)} <span className="text-muted-strong">({pct(r.sorties, s.resume.visites)})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          </div>

          <section aria-labelledby="t-clics">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="t-clics" className="text-base font-bold">
                Ce qui est cliqué {page ? <>sur <span className="font-mono text-sm">{page}</span></> : 'sur tout le site'}
              </h2>
              {page ? <Link href={lien({ page: null })} className="text-sm underline">Voir tout le site</Link> : null}
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead><tr className="border-b border-line bg-surface-soft"><th className={th}>Lien ou bouton</th><th className={th}>Où sur la page</th><th className={th}>Mène à</th><th className={`${th} text-right`}>Clics</th><th className={`${th} text-right`}>Visites</th></tr></thead>
                <tbody>
                  {s.clics.length === 0 ? (
                    <tr><td className={td} colSpan={5}>Aucun clic sur cette période.</td></tr>
                  ) : s.clics.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className={`${td} font-semibold`}><span className="block max-w-[20rem] truncate">{r.label ?? '—'}</span></td>
                      <td className={`${td} text-muted-strong`}><span className="block max-w-[14rem] truncate">{r.zone ?? '—'}</span></td>
                      <td className={td}><span className="block max-w-[16rem] truncate font-mono text-xs text-muted-strong">{r.target ?? '—'}</span></td>
                      <td className={`${td} text-right tabular-nums`}>{nb(r.clics)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{nb(r.visites)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="t-recherches">
              <h2 id="t-recherches" className="mb-2 text-base font-bold">Ce qu’ils cherchent</h2>
              <Card className="p-3 text-sm">
                {s.recherches.length === 0 ? <p className="text-muted-strong">Aucune recherche.</p> : (
                  <ul className="flex flex-col gap-1.5">
                    {s.recherches.map((r) => (
                      <li key={r.query} className="flex justify-between gap-3">
                        <a href={`/recherche?q=${encodeURIComponent(r.query)}`} target="_blank" rel="noreferrer" className="truncate hover:underline">« {r.query} »</a>
                        <span className="tabular-nums text-muted-strong">{nb(r.fois)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
            <section aria-labelledby="t-sources">
              <h2 id="t-sources" className="mb-2 text-base font-bold">D’où ils viennent</h2>
              <Card className="p-3 text-sm">
                <ul className="flex flex-col gap-1.5">
                  {s.sources.map((r) => (
                    <li key={r.source} className="flex justify-between gap-3"><span className="truncate">{r.source === 'direct' ? 'Accès direct ou inconnu' : r.source}</span><span className="tabular-nums text-muted-strong">{nb(r.visites)}</span></li>
                  ))}
                </ul>
              </Card>
            </section>
            <section aria-labelledby="t-ecrans">
              <h2 id="t-ecrans" className="mb-2 text-base font-bold">Sur quel écran</h2>
              <Card className="p-3 text-sm">
                <ul className="flex flex-col gap-1.5">
                  {s.appareils.map((r) => (
                    <li key={r.device} className="flex justify-between gap-3"><span className="capitalize">{r.device}</span><span className="tabular-nums text-muted-strong">{nb(r.visites)} ({pct(r.visites, s.resume.visites)})</span></li>
                  ))}
                </ul>
              </Card>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
