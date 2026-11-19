import { connection } from 'next/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import {
  ECRANS,
  LARGEURS,
  lireCarteClics,
  pagesAvecClics,
  periode,
  type Ecran,
} from '@/lib/queries/mesure'
import { libelleEvenement } from '@/lib/mesure-evenements'
import { Card, EmptyState } from '@/components/ui/Surface'
import { Onglets } from '@/components/admin/statistiques/Onglets'
import { CarteClics } from '@/components/admin/statistiques/CarteClics'
import { nb, nomPage, pct } from '@/components/admin/statistiques/format'

/**
 * La carte des clics : où, sur une page, les visiteurs ont cliqué ou tapé —
 * et où ils ont tapé sur quelque chose qui n'a pas réagi.
 *
 * Choisir l'écran d'abord : un téléphone et un ordinateur ne voient pas la
 * même page, et mélanger leurs clics sur une seule mise en page ne voudrait
 * rien dire. Le téléphone est proposé par défaut, c'est l'écran de la
 * majorité des visites.
 */

export const metadata: Metadata = { title: 'Carte des clics', robots: { index: false, follow: false } }

/** Hauteur de fenêtre type, par écran : celle d'un appareil courant. */
const HAUTEURS: Record<Ecran, number> = { mobile: 844, tablette: 1180, ordinateur: 900 }

export default async function CartePage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string; page?: string; ecran?: string }>
}) {
  await connection()
  await requireStaff('dashboard.view')
  const params = await searchParams
  const p = periode(Number(params.jours ?? 7))
  const ecran: Ecran = ECRANS.includes(params.ecran as Ecran) ? (params.ecran as Ecran) : 'mobile'
  const pages = await pagesAvecClics(p, ecran)
  const page =
    params.page?.startsWith('/') && !params.page.includes('…') ? params.page : (pages.find((x) => !x.path.includes('…'))?.path ?? null)
  const carte = page ? await lireCarteClics(p, page, ecran) : null

  const lien = (q: Record<string, string | null>) => {
    const u = new URLSearchParams({ jours: String(p.jours), ecran })
    if (page) u.set('page', page)
    for (const [k, v] of Object.entries(q)) {
      if (v === null) u.delete(k)
      else u.set(k, v)
    }
    return `/admin/statistiques/carte?${u}`
  }

  // Ce qui est cliqué sur cette page, et ce qui ne réagit pas.
  const parLibelle = new Map<string, { clics: number; gene: number; nom: string | null }>()
  for (const pt of carte?.points ?? []) {
    const cle = pt.label ?? '—'
    const x = parLibelle.get(cle) ?? { clics: 0, gene: 0, nom: null }
    if (pt.kind === 'event') {
      x.gene += 1
      x.nom = pt.name
    } else x.clics += 1
    parLibelle.set(cle, x)
  }
  const classement = [...parLibelle.entries()].sort((a, b) => b[1].clics + b[1].gene - (a[1].clics + a[1].gene)).slice(0, 25)
  const base = carte?.profondeur.find((t) => t.tranche === 0)?.visites ?? 0

  return (
    <div className="flex flex-col gap-5">
      <Onglets actif="carte" jours={p.jours} conserver={{ ecran, page }} />

      <nav aria-label="Écran" className="flex flex-wrap gap-1.5 text-sm">
        {ECRANS.map((e) => (
          <Link
            key={e}
            href={`/admin/statistiques/carte?jours=${p.jours}&ecran=${e}${page ? `&page=${encodeURIComponent(page)}` : ''}`}
            aria-current={ecran === e ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 ${ecran === e ? 'border-ink bg-ink text-white' : 'border-line hover:border-line-strong'}`}
          >
            {e[0].toUpperCase() + e.slice(1)} <span className="text-xs opacity-70">({LARGEURS[e].apercu} px)</span>
          </Link>
        ))}
      </nav>

      {pages.length === 0 ? (
        <EmptyState
          title="Aucun clic positionné sur cet écran pour la période."
          description="La position des clics est enregistrée depuis le 19 novembre 2026. Les clics plus anciens n’ont pas de position et ne peuvent pas être replacés sur la page."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <section aria-labelledby="t-pages-carte" className="min-w-0">
            <h2 id="t-pages-carte" className="mb-2 text-sm font-bold">Pages</h2>
            <Card className="max-h-[44rem] overflow-y-auto">
              <ul className="divide-y divide-line text-sm">
                {pages.map((x) => (
                  <li key={x.path}>
                    {x.path.includes('…') ? (
                      <span className="block px-3 py-2 text-muted-strong">
                        <span className="block truncate font-mono text-xs">{x.path}</span>
                        <span className="text-xs">non affichable</span>
                      </span>
                    ) : (
                      <Link
                        href={lien({ page: x.path })}
                        aria-current={page === x.path ? 'page' : undefined}
                        className={`block px-3 py-2 hover:bg-surface-soft ${page === x.path ? 'bg-surface-muted' : ''}`}
                      >
                        {nomPage(x.path) ? <span className="block font-semibold">{nomPage(x.path)}</span> : null}
                        <span className="block truncate font-mono text-xs text-muted-strong">{x.path}</span>
                        <span className="text-xs text-muted-strong">{nb(x.clics)} clics · {nb(x.visites)} visites</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section aria-label="Carte" className="min-w-0">
            {page && carte ? (
              <CarteClics
                key={`${page}-${ecran}`}
                path={page}
                largeur={LARGEURS[ecran].apercu}
                hauteur={HAUTEURS[ecran]}
                centre={ecran === 'ordinateur'}
                points={carte.points.map((pt) => ({ x: pt.x, y: pt.y, w: pt.w, gene: pt.kind === 'event' }))}
                profondeur={carte.profondeur}
              />
            ) : (
              <p className="text-sm text-muted-strong">Choisissez une page.</p>
            )}
          </section>

          {carte ? (
            <aside className="flex min-w-0 flex-col gap-4">
              <div>
                <h2 className="mb-2 text-sm font-bold">Jusqu’où ils descendent</h2>
                <Card className="p-3 text-sm">
                  {base === 0 ? (
                    <p className="text-muted-strong">Pas encore de défilement mesuré sur cette page et cet écran.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {carte.profondeur.filter((t) => t.tranche > 0).map((t) => (
                        <li key={t.tranche} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
                          <span className="tabular-nums text-xs text-muted-strong">{t.tranche} %</span>
                          <span className="h-2 rounded bg-surface-muted">
                            <span className="block h-2 rounded bg-ink/70" style={{ width: `${(t.visites / base) * 100}%` }} />
                          </span>
                          <span className="text-right tabular-nums text-xs">{pct(t.visites, base)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {base > 0 ? (
                    <p className="mt-2 text-xs text-muted-strong">Part des {nb(base)} visites qui ont vu la page jusqu’à cette hauteur.</p>
                  ) : null}
                </Card>
              </div>
              <div>
                <h2 className="mb-2 text-sm font-bold">Ce qui est touché</h2>
                <Card className="p-3 text-sm">
                  <ul className="flex flex-col gap-1.5">
                    {classement.map(([label, x]) => (
                      <li key={label} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{label}</span>
                          {x.gene > 0 ? (
                            <span className="block text-xs font-semibold text-danger">
                              {nb(x.gene)} × {x.nom ? libelleEvenement(x.nom).toLowerCase() : 'gêne'}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-strong">{nb(x.clics + x.gene)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  )
}
