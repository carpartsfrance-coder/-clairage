import { connection } from 'next/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { ETAPES, lireStatistiques, periode, type CleEtape, type LigneEntonnoir } from '@/lib/queries/mesure'
import { EVENEMENTS, libelleEvenement, type NomEvenement } from '@/lib/mesure-evenements'
import { Card, EmptyState } from '@/components/ui/Surface'
import { ModeDetaille } from '@/components/mesure/ModeDetaille'
import { Onglets } from '@/components/admin/statistiques/Onglets'
import {
  duree,
  euros,
  nb,
  nomPage,
  nomSource,
  pct,
  pct1,
} from '@/components/admin/statistiques/format'

/**
 * Statistiques de visite : où vont les visiteurs, ce qu'ils font, combien de
 * temps, où ils s'arrêtent, et ce qui les gêne. Lu dans la mesure d'audience
 * anonyme du site (components/mesure/).
 *
 * Cette page donne les totaux. Les trois autres onglets donnent le détail :
 * chaque visite dans l'ordre où elle s'est passée, la carte des clics d'une
 * page, et les paniers.
 */

export const metadata: Metadata = { title: 'Statistiques', robots: { index: false, follow: false } }

const th = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const td = 'px-3 py-2 align-top'

/** Les gestes qui disent que quelque chose a coincé. */
const GENES: NomEvenement[] = [
  'clic-rage',
  'clic-mort',
  'erreur-formulaire',
  'champ-abandonne',
  'ajout-panier-refuse',
  'commande-refusee',
  'code-promo-refuse',
  'recherche-vide',
  'rupture-vue',
  'vehicule-absent',
  'paiement-abandonne',
]

const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string; page?: string }>
}) {
  // Cette page lit l'heure courante (date du jour, fenêtres glissantes). Un
  // pré-rendu la figerait à l'heure de la construction : on la rend à la
  // requête.
  await connection()

  await requireStaff('dashboard.view')
  const params = await searchParams
  const p = periode(Number(params.jours ?? 7))
  const page = params.page?.startsWith('/') ? params.page : null
  const s = await lireStatistiques(p, page)
  const lien = (q: Record<string, string | number | null>) => {
    const u = new URLSearchParams()
    const tout = { jours: p.jours, page, ...q }
    for (const [k, v] of Object.entries(tout)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v))
    return `/admin/statistiques?${u}`
  }
  const lienVisites = (filtre: string) => `/admin/statistiques/visites?jours=${p.jours}&filtre=${filtre}`
  const maxJour = Math.max(1, ...s.jours.map((j) => j.visites))
  const e = s.entonnoir
  const depuis = s.mesureApprofondieDepuis
  /** La période commence-t-elle avant que les nouveautés soient mesurées ? */
  const periodeIncomplete = !depuis || depuis > p.depuis
  const evenementsParNom = new Map(s.evenements.map((x) => [x.name, x]))

  return (
    <div className="flex flex-col gap-6">
      <Onglets actif="ensemble" jours={p.jours} conserver={{ page }} />
      <ModeDetaille />

      {s.resume.visites === 0 ? (
        <EmptyState
          title="Aucune visite mesurée sur cette période."
          description="Les chiffres apparaissent dès les premières visites. Vos propres visites ne comptent pas (le back-office vous exclut de la mesure), sauf si vous allumez le mode détaillé ci-dessus."
        />
      ) : (
        <>
          {periodeIncomplete ? (
            <p className="rounded-lg bg-surface-soft px-4 py-3 text-sm text-muted-strong">
              Le temps passé, le défilement, les ajouts au panier, la position des clics et les
              signaux de gêne sont mesurés{' '}
              {depuis ? <>depuis le <strong>{dateCourte.format(depuis)}</strong></> : 'à partir de la prochaine visite'}
              . Sur cette période, ces chiffres ne portent que sur les visites suivantes : les
              pages et les clics, eux, couvrent toute la période.
            </p>
          ) : null}

          {/* ------------------------------ Résumé ------------------------------ */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Visites', nb(s.resume.visites), null],
              ['Pages par visite', (s.resume.pages / Math.max(1, s.resume.visites)).toFixed(1).replace('.', ','), null],
              ['Durée médiane d’une visite', duree(s.duree.msMedian), s.duree.mesurees ? `sur ${nb(s.duree.mesurees)} visites mesurées` : null],
              ['Rebond', pct(s.duree.rebonds, s.duree.mesurees), 'une page, moins de 10 s'],
              ['Visites avec ajout au panier', e ? nb(e.ajout) : '—', e ? pct1(e.ajout, e.visites) : null],
              ['Commandes payées', e ? nb(e.payee) : '—', e ? pct1(e.payee, e.visites) : null],
            ].map(([l, v, d]) => (
              <Card key={l} className="p-4">
                <p className="text-xs font-semibold text-muted-strong">{l}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{v}</p>
                {d ? <p className="mt-0.5 text-xs text-muted-strong">{d}</p> : null}
              </Card>
            ))}
          </div>

          {s.jours.length > 1 ? (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold">Visites par jour</h2>
              <div className="flex h-28 items-end gap-1">
                {s.jours.map((j) => (
                  <div key={String(j.jour)} className="relative flex-1" title={`${new Date(j.jour).toLocaleDateString('fr-FR')} : ${j.visites} visite(s)`}>
                    <div className="rounded-t bg-ink/80" style={{ height: `${Math.max(3, (j.visites / maxJour) * 100)}%` }} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* ---------------------------- Entonnoir ----------------------------- */}
          {e ? (
            <section aria-labelledby="t-entonnoir">
              <h2 id="t-entonnoir" className="mb-2 text-base font-bold">Le parcours d’achat : où ça bloque</h2>
              <Card className="p-4">
                <Entonnoir ligne={e} />
                <p className="mt-4 text-sm">
                  <strong>{nb(e.vehicule)}</strong> visite{e.vehicule > 1 ? 's' : ''} ({pct(e.vehicule, e.visites)}) ont choisi un véhicule ou ouvert la page d’un véhicule.
                </p>
                <p className="mt-2 text-xs text-muted-strong">
                  Chaque ligne compte les visites qui sont arrivées au moins une fois à cette étape. « A ajouté au panier » compte les ajouts réussis, d’où qu’ils viennent (fiche, packs complémentaires) — un ajout refusé n’y est pas.
                </p>
              </Card>

              {s.entonnoirParEcran.length > 1 ? (
                <Card className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-sm">
                    <caption className="px-3 pt-3 text-left text-sm font-bold">Le même parcours, écran par écran</caption>
                    <thead>
                      <tr className="border-b border-line bg-surface-soft">
                        <th className={th}>Écran</th>
                        {ETAPES.map((et) => (
                          <th key={et.cle} className={`${th} text-right`}>{et.court}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.entonnoirParEcran.map((l) => (
                        <tr key={l.device} className="border-b border-line last:border-0">
                          <td className={`${td} font-semibold capitalize`}>{l.device}</td>
                          {ETAPES.map((et) => (
                            <td key={et.cle} className={`${td} text-right tabular-nums`}>
                              {nb(l[et.cle])}
                              {et.cle !== 'visites' ? <span className="block text-xs text-muted-strong">{pct1(l[et.cle], l.visites)}</span> : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : null}
            </section>
          ) : null}

          {/* ----------------------- Ventes par provenance ----------------------- */}
          <section aria-labelledby="t-ventes">
            <h2 id="t-ventes" className="mb-2 text-base font-bold">Ce que chaque provenance a rapporté</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    <th className={th}>Provenance</th>
                    <th className={`${th} text-right`}>Commandes payées</th>
                    <th className={`${th} text-right`}>Chiffre d’affaires TTC</th>
                    <th className={`${th} text-right`}>Panier moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ventes.length === 0 ? (
                    <tr><td className={td} colSpan={4}>Aucune commande payée sur cette période (paiements de test exclus).</td></tr>
                  ) : s.ventes.map((v) => (
                    <tr key={v.source} className="border-b border-line last:border-0">
                      <td className={`${td} font-semibold`}>{nomSource(v.source)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nb(v.commandes)}</td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>{euros(v.chiffreCents)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{euros(v.panierMoyenCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-strong">
              Lu dans les commandes elles-mêmes, pas dans la mesure ni chez Google : la provenance de la visite est recopiée dans la commande au moment où le client la valide. C’est le chiffre à croire quand il contredit Google Ads, qui ne voit que les visiteurs ayant accepté ses cookies.
            </p>
          </section>

          {/* ------------------------- Parcours par provenance ------------------------ */}
          <section aria-labelledby="t-provenances">
            <h2 id="t-provenances" className="mb-2 text-base font-bold">
              D’où viennent les visites, et jusqu’où elles vont
            </h2>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    <th className={th}>Provenance</th>
                    <th className={`${th} text-right`}>Visites</th>
                    <th className={`${th} text-right`}>Durée médiane</th>
                    <th className={`${th} text-right`}>Fiche produit</th>
                    <th className={`${th} text-right`}>Ajout au panier</th>
                    <th className={`${th} text-right`}>Panier</th>
                    <th className={`${th} text-right`}>Commande commencée</th>
                    <th className={`${th} text-right`}>Payées</th>
                    <th className={`${th} text-right`}>Taux d’achat</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sources.length === 0 ? (
                    <tr><td className={td} colSpan={9}>Aucune provenance notée sur cette période.</td></tr>
                  ) : s.sources.map((r) => (
                    <tr key={r.source} className="border-b border-line last:border-0">
                      <td className={`${td} font-semibold`}><span className="block max-w-[16rem] truncate">{nomSource(r.source)}</span></td>
                      <td className={`${td} text-right tabular-nums`}>{nb(r.visites)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{duree(r.msMedian)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{nb(r.fiche)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nb(r.ajout)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{nb(r.panier)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{nb(r.commande)}</td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>{nb(r.payees)}</td>
                      <td className={`${td} text-right tabular-nums`}>{pct1(r.payees, r.visites)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-strong">
              Un clic sur une publicité Google est reconnu de lui-même : il apparaît en « google (publicité) ». <Link href={lienVisites('pub')} className="font-semibold underline">Voir ces visites une par une</Link>.
            </p>
          </section>

          {/* ------------------------- Pages d'atterrissage ------------------------- */}
          <section aria-labelledby="t-atterrissage">
            <h2 id="t-atterrissage" className="mb-2 text-base font-bold">Où les visiteurs arrivent, et ce qu’ils en font</h2>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    <th className={th}>Page d’arrivée</th>
                    <th className={`${th} text-right`}>Visites</th>
                    <th className={`${th} text-right`}>dont pub</th>
                    <th className={`${th} text-right`}>Repartis après cette page</th>
                    <th className={`${th} text-right`}>Rebond</th>
                    <th className={`${th} text-right`}>Durée médiane</th>
                    <th className={`${th} text-right`}>Ajout au panier</th>
                    <th className={`${th} text-right`}>Payées</th>
                  </tr>
                </thead>
                <tbody>
                  {s.atterrissages.map((r) => (
                    <tr key={r.path} className="border-b border-line last:border-0">
                      <td className={td}><CheminPage path={r.path} /></td>
                      <td className={`${td} text-right tabular-nums`}>{nb(r.visites)}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{r.pub ? nb(r.pub) : '—'}</td>
                      <td className={`${td} text-right tabular-nums`}>{pct(r.unePage, r.visites)}</td>
                      <td className={`${td} text-right tabular-nums`}>{r.mesurees ? pct(r.rebonds, r.mesurees) : '—'}</td>
                      <td className={`${td} text-right tabular-nums text-muted-strong`}>{duree(r.msMedian)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nb(r.ajouts)} <span className="text-xs text-muted-strong">({pct(r.ajouts, r.visites)})</span></td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>{nb(r.payees)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-strong">
              Pour une campagne Shopping, chaque ligne est une fiche que la publicité a choisie à votre place. « Repartis après cette page » : visites qui n’en ont vu aucune autre. « Rebond » : en plus, moins de 10 secondes.
            </p>
          </section>

          {/* --------------------------- Gestes et gênes --------------------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="t-gestes" className="min-w-0">
              <h2 id="t-gestes" className="mb-2 text-base font-bold">Ce que les visiteurs font</h2>
              <Card className="p-3 text-sm">
                <ListeGestes
                  noms={(Object.keys(EVENEMENTS) as NomEvenement[]).filter((n) => !GENES.includes(n))}
                  parNom={evenementsParNom}
                  precisions={s.precisions}
                  vide="Aucun geste mesuré sur cette période."
                />
              </Card>
            </section>
            <section aria-labelledby="t-genes" className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 id="t-genes" className="text-base font-bold">Ce qui les gêne</h2>
                <Link href={lienVisites('gene')} className="text-sm underline">Voir ces visites</Link>
              </div>
              <Card className="p-3 text-sm">
                <ListeGestes
                  noms={GENES}
                  parNom={evenementsParNom}
                  precisions={s.precisions}
                  vide="Aucune gêne relevée sur cette période."
                />
              </Card>
            </section>
          </div>

          {/* --------------------------- Pages et sorties --------------------------- */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section aria-labelledby="t-pages" className="min-w-0">
              <h2 id="t-pages" className="mb-2 text-base font-bold">Pages les plus visitées : temps et lecture</h2>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-soft">
                      <th className={th}>Page</th>
                      <th className={`${th} text-right`}>Visites</th>
                      <th className={`${th} text-right`}>Temps médian</th>
                      <th className={`${th} text-right`}>Défilement médian</th>
                      <th className={`${th} text-right`}>Partis avant 5 s</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {s.pages.map((r) => (
                      <tr key={r.path} className="border-b border-line last:border-0">
                        <td className={td}><CheminPage path={r.path} /></td>
                        <td className={`${td} text-right tabular-nums`}>{nb(r.visites)}</td>
                        <td className={`${td} text-right tabular-nums`}>{duree(r.msMedian)}</td>
                        <td className={`${td} text-right tabular-nums text-muted-strong`}>{r.scrollMedian === null ? '—' : `${r.scrollMedian} %`}</td>
                        <td className={`${td} text-right tabular-nums text-muted-strong`}>{r.mesurees ? pct(r.moins5s ?? 0, r.mesurees) : '—'}</td>
                        <td className={`${td} whitespace-nowrap text-xs`}>
                          <Link href={lien({ page: r.path })} className="font-semibold underline">Clics</Link>
                          {' · '}
                          <Link href={`/admin/statistiques/carte?jours=${p.jours}&page=${encodeURIComponent(r.path)}`} className="font-semibold underline">Carte</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            <section aria-labelledby="t-sorties" className="min-w-0">
              <h2 id="t-sorties" className="mb-2 text-base font-bold">Où les visiteurs s’arrêtent</h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-surface-soft"><th className={th}>Dernière page vue</th><th className={`${th} text-right`}>Visites terminées ici</th></tr></thead>
                  <tbody>
                    {s.sorties.map((r) => (
                      <tr key={r.path} className="border-b border-line last:border-0">
                        <td className={td}><CheminPage path={r.path} /></td>
                        <td className={`${td} text-right tabular-nums`}>{nb(r.sorties)} <span className="text-muted-strong">({pct(r.sorties, s.resume.visites)})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          </div>

          {/* --------------------------------- Clics -------------------------------- */}
          <section aria-labelledby="t-clics">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="t-clics" className="text-base font-bold">
                Ce qui est cliqué {page ? <>sur <span className="font-mono text-sm">{page}</span></> : 'sur tout le site'}
              </h2>
              {page ? (
                <span className="flex gap-3 text-sm">
                  <Link href={`/admin/statistiques/carte?jours=${p.jours}&page=${encodeURIComponent(page)}`} className="underline">Voir sur la page</Link>
                  <Link href={lien({ page: null })} className="underline">Voir tout le site</Link>
                </span>
              ) : null}
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

          <section aria-labelledby="t-recherches" className="min-w-0">
            <h2 id="t-recherches" className="mb-2 text-base font-bold">Ce qu’ils cherchent</h2>
            <Card className="p-3 text-sm">
              {s.recherches.length === 0 ? <p className="text-muted-strong">Aucune recherche.</p> : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
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
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Entonnoir({ ligne }: { ligne: LigneEntonnoir }) {
  const base = ligne.visites
  // La plus forte perte d'une étape à la suivante est mise en avant : c'est
  // là qu'il faut regarder en premier.
  const pertes = ETAPES.map((et, i) => {
    if (i === 0) return null
    const avant = ligne[ETAPES[i - 1].cle]
    return avant > 0 ? Math.round(((avant - ligne[et.cle]) / avant) * 100) : null
  })
  const pire = Math.max(...pertes.map((x) => x ?? -1))
  return (
    <ol className="flex flex-col gap-3">
      {ETAPES.map((et, i) => {
        const n = ligne[et.cle as CleEtape]
        const perte = pertes[i]
        return (
          <li key={et.cle} className="grid gap-1 sm:grid-cols-[18rem_minmax(0,1fr)_10rem] sm:items-center sm:gap-4">
            <span className="text-sm font-semibold">{et.label}</span>
            <div className="h-6 rounded bg-surface-muted">
              <div className="h-6 rounded bg-brand" style={{ width: `${base ? Math.max(n > 0 ? 1 : 0, (n / base) * 100) : 0}%` }} />
            </div>
            <span className="text-sm tabular-nums">
              <strong>{nb(n)}</strong> <span className="text-muted-strong">({pct1(n, base)})</span>
              {perte !== null && perte > 0 ? (
                <span className={`block text-xs ${perte === pire ? 'font-bold text-danger' : 'text-muted-strong'}`}>
                  −{perte} % à cette étape{perte === pire ? ' — la plus forte perte' : ''}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ListeGestes({
  noms,
  parNom,
  precisions,
  vide,
}: {
  noms: NomEvenement[]
  parNom: Map<string, { name: string; fois: number; visites: number; total: number }>
  precisions: Record<string, Array<{ label: string; fois: number }>>
  vide: string
}) {
  const presents = noms
    .map((n) => ({ nom: n, ligne: parNom.get(n) }))
    .filter((x): x is { nom: NomEvenement; ligne: { name: string; fois: number; visites: number; total: number } } => Boolean(x.ligne))
    .sort((a, b) => b.ligne.visites - a.ligne.visites)
  if (presents.length === 0) return <p className="text-muted-strong">{vide}</p>
  return (
    <ul className="flex flex-col divide-y divide-line">
      {presents.map(({ nom, ligne }) => {
        const desc = EVENEMENTS[nom] as { chiffre?: string }
        return (
          <li key={nom} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{libelleEvenement(nom)}</span>
              <span className="shrink-0 tabular-nums">
                {nb(ligne.fois)} <span className="text-xs text-muted-strong">· {nb(ligne.visites)} visite{ligne.visites > 1 ? 's' : ''}</span>
                {desc.chiffre === 'centimes' && ligne.total > 0 ? (
                  <span className="block text-right text-xs text-muted-strong">{euros(ligne.total)}</span>
                ) : null}
              </span>
            </div>
            {precisions[nom]?.length ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-strong">
                {precisions[nom].map((x) => (
                  <li key={x.label} className="flex justify-between gap-3">
                    <span className="truncate">{x.label}</span>
                    <span className="tabular-nums">{nb(x.fois)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function CheminPage({ path }: { path: string }) {
  const nom = nomPage(path)
  return (
    <>
      {nom ? <span className="block font-semibold">{nom}</span> : null}
      {path.includes('…') ? (
        // Chemin dont l'identifiant a été retiré : il ne mène nulle part.
        <span className="block max-w-[22rem] truncate font-mono text-xs text-muted-strong">{path}</span>
      ) : (
        <a href={path} target="_blank" rel="noreferrer" className="block max-w-[22rem] truncate font-mono text-xs text-muted-strong hover:underline">{path}</a>
      )}
    </>
  )
}
