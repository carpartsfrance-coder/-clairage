import { connection } from 'next/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { lireVisite, type GesteVisite, type PointTrace } from '@/lib/queries/mesure'
import { libelleEvenement } from '@/lib/mesure-evenements'
import { Card } from '@/components/ui/Surface'
import { Rejeu, type ClicRejeu, type PointRejeu } from '@/components/admin/statistiques/Rejeu'
import {
  duree,
  euros,
  formatHeure,
  formatJourHeure,
  nb,
  nomPage,
  nomSource,
} from '@/components/admin/statistiques/format'

/**
 * Une visite, dans l'ordre où elle s'est passée.
 *
 * Chaque page vue ouvre un chapitre ; sous elle, les clics, les gestes et le
 * temps passé, avec l'écart entre chaque geste. C'est ce qui permet de voir
 * qu'un visiteur a lu la FAQ « câblage » pendant 40 secondes avant de
 * repartir, là où les totaux disaient seulement « une page, 0 achat ».
 *
 * Quand la visite a été enregistrée en mode détaillé, chaque page se rejoue :
 * la page est rechargée dans un cadre à la taille de l'écran d'origine, et le
 * pointeur, les appuis et le défilement s'y rejouent.
 */

export const metadata: Metadata = { title: 'Une visite', robots: { index: false, follow: false } }

type Chapitre = {
  page: GesteVisite
  gestes: GesteVisite[]
  ms: number | null
  scroll: number | null
  fin: Date
  traces: PointTrace[]
}

/**
 * Range les gestes sous la page où ils ont eu lieu.
 *
 * Par l'adresse, pas seulement par l'heure : un geste émis au moment même où
 * une page s'affiche (« recherche sans résultat », mesuré par la page de
 * recherche) peut partir quelques millisecondes AVANT la page vue — les
 * composants de la page se montent avant celui de la mesure. Rangé à l'heure
 * seule, il tomberait sous la page précédente. On cherche donc la page de
 * même adresse ouverte au plus tard trois secondes après le geste.
 */
function chapitres(gestes: GesteVisite[], traces: PointTrace[]): { avant: GesteVisite[]; liste: Chapitre[] } {
  const avant: GesteVisite[] = []
  const liste: Chapitre[] = gestes
    .filter((g) => g.kind === 'page')
    .map((g) => ({ page: g, gestes: [], ms: null, scroll: null, fin: g.at, traces: [] }))
  for (const g of gestes) {
    if (g.kind === 'page') continue
    const t = g.at.getTime()
    const memeAdresse = liste.filter((c) => c.page.path === g.path && c.page.at.getTime() <= t + 3000)
    const courant =
      memeAdresse.at(-1) ?? liste.filter((c) => c.page.at.getTime() <= t).at(-1)
    if (!courant) {
      avant.push(g)
      continue
    }
    if (g.kind === 'sortie') {
      courant.ms = (courant.ms ?? 0) + (g.ms ?? 0)
      courant.scroll = Math.max(courant.scroll ?? 0, g.scroll ?? 0)
    } else {
      courant.gestes.push(g)
    }
    if (g.at > courant.fin) courant.fin = g.at
  }
  /*
    Les points de trace d'une page : même chemin, entre l'arrivée sur cette
    page et l'arrivée sur la suivante. Deux secondes de marge en tête : le
    premier point peut partir dans le même envoi que la page vue.
  */
  liste.forEach((c, i) => {
    const debut = c.page.at.getTime() - 2000
    const suivante = liste[i + 1]?.page.at.getTime() ?? Infinity
    c.traces = traces.filter(
      (t) => t.path === c.page.path && t.at.getTime() >= debut && t.at.getTime() < suivante,
    )
  })
  return { avant, liste }
}

/** La phrase d'un geste dans le fil. */
function phrase(g: GesteVisite): { texte: string; detail?: string | null; ton: 'neutre' | 'fort' | 'gene' } {
  if (g.kind === 'click') {
    return {
      texte: `Clic sur « ${g.label ?? g.target ?? '?'} »`,
      detail: [g.zone, g.target && g.target !== g.label ? `→ ${g.target}` : null].filter(Boolean).join(' · ') || null,
      ton: 'neutre',
    }
  }
  const nom = g.name ?? ''
  const gene = ['clic-rage', 'clic-mort', 'erreur-formulaire', 'champ-abandonne', 'ajout-panier-refuse', 'commande-refusee', 'code-promo-refuse', 'recherche-vide', 'rupture-vue', 'vehicule-absent', 'paiement-abandonne'].includes(nom)
  const fort = ['ajout-panier', 'ajout-pack', 'commande-envoyee', 'commande-payee', 'vehicule-choisi'].includes(nom)
  const valeur =
    g.value !== null && ['ajout-panier', 'ajout-pack', 'commande-payee'].includes(nom) ? euros(g.value) : null
  return {
    texte: libelleEvenement(nom),
    detail: [g.label, valeur, g.zone].filter(Boolean).join(' · ') || null,
    ton: gene ? 'gene' : fort ? 'fort' : 'neutre',
  }
}

export default async function VisitePage({
  params,
  searchParams,
}: {
  params: Promise<{ visit: string }>
  searchParams: Promise<{ jours?: string }>
}) {
  await connection()
  await requireStaff('dashboard.view')
  const { visit } = await params
  const { jours } = await searchParams
  const id = decodeURIComponent(visit).slice(0, 64)
  const { gestes, traces } = await lireVisite(id)
  if (gestes.length === 0 && traces.length === 0) notFound()

  const { avant, liste } = chapitres(gestes, traces)
  const premiere = gestes[0]
  const source = gestes.find((g) => g.source)?.source ?? null
  const device = gestes.find((g) => g.device)?.device ?? null
  const largeur = gestes.find((g) => g.w)?.w ?? null
  const hauteur = gestes.find((g) => g.h)?.h ?? null
  const total = liste.reduce((s, c) => s + (c.ms ?? 0), 0)
  const mesuree = liste.some((c) => c.ms !== null)
  const derniere = gestes.at(-1)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href={`/admin/statistiques/visites?jours=${jours ?? 7}`} className="text-sm underline">← Toutes les visites</Link>
          <h1 className="mt-1 text-xl font-extrabold">Visite du {premiere ? formatJourHeure(premiere.at) : '—'}</h1>
        </div>
        <p className="font-mono text-xs text-muted-strong">{id}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Provenance', nomSource(source)],
          [
            'Écran',
            [device ? device[0].toUpperCase() + device.slice(1) : null, largeur && hauteur ? `${largeur} × ${hauteur} px` : null]
              .filter(Boolean)
              .join(' · ') || '—',
          ],
          ['Pages vues', nb(liste.length)],
          ['Temps sur le site', mesuree ? duree(total) : '—'],
          ['Durée de bout en bout', premiere && derniere ? duree(derniere.at.getTime() - premiere.at.getTime()) : '—'],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-xs font-semibold text-muted-strong">{l}</p>
            <p className="mt-0.5 font-bold">{v}</p>
          </Card>
        ))}
      </div>

      {avant.length > 0 ? (
        <p className="text-xs text-muted-strong">{avant.length} geste(s) enregistré(s) avant la première page vue (page déjà ouverte au début de la période).</p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {liste.map((c, i) => {
          const debut = c.page.at.getTime()
          const points: PointRejeu[] = c.traces.map((t) => ({ t: t.t, kind: t.kind as PointRejeu['kind'], x: t.x, y: t.y }))
          const clics: ClicRejeu[] = c.gestes
            .filter((g) => g.x !== null && g.y !== null && (g.kind === 'click' || g.name === 'clic-rage' || g.name === 'clic-mort'))
            .map((g) => ({
              t: Math.max(0, g.at.getTime() - debut),
              x: g.x!,
              y: g.y!,
              label: g.label ?? g.name ?? '',
              gene: g.kind === 'event',
            }))
          const w = c.traces[0]?.w ?? c.page.w ?? largeur ?? 390
          const h = c.traces[0]?.h ?? c.page.h ?? hauteur ?? 844
          let precedent = debut
          return (
            <li key={c.page.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line bg-surface-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-strong">
                      Page {i + 1} · {formatHeure(c.page.at)}
                      {i > 0 ? ` · +${duree(debut - liste[i - 1].page.at.getTime())}` : ''}
                    </p>
                    <p className="mt-0.5 font-bold">
                      {nomPage(c.page.path) ?? (c.page.path.startsWith('/p/') ? 'Fiche produit' : 'Page')}
                      {c.page.label === 'commande-payee' ? ' — paiement encaissé' : ''}
                    </p>
                    {c.page.path.includes('…') ? (
                      <p className="truncate font-mono text-xs text-muted-strong">{c.page.path}</p>
                    ) : (
                      <a href={c.page.path} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-muted-strong hover:underline">{c.page.path}</a>
                    )}
                    {c.page.query ? <p className="mt-1 text-sm">Recherche : « {c.page.query} »</p> : null}
                  </div>
                  <div className="flex gap-4 text-right text-sm">
                    <span>
                      <span className="block text-xs text-muted-strong">Temps passé</span>
                      <strong className="tabular-nums">{duree(c.ms)}</strong>
                    </span>
                    <span>
                      <span className="block text-xs text-muted-strong">Descendu jusqu’à</span>
                      <strong className="tabular-nums">{c.scroll === null ? '—' : `${c.scroll} %`}</strong>
                    </span>
                  </div>
                </div>

                {c.gestes.length > 0 ? (
                  <ol className="divide-y divide-line">
                    {c.gestes.map((g) => {
                      const ph = phrase(g)
                      const ecart = g.at.getTime() - precedent
                      precedent = g.at.getTime()
                      return (
                        <li key={g.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-2 text-sm">
                          <span className="tabular-nums text-xs text-muted-strong">
                            +{duree(g.at.getTime() - debut)}
                            {ecart > 15000 ? <span className="block text-[11px]">({duree(ecart)} sans rien)</span> : null}
                          </span>
                          <span className="min-w-0">
                            <span className={ph.ton === 'gene' ? 'font-semibold text-danger' : ph.ton === 'fort' ? 'font-semibold text-[#1f5a39]' : ''}>{ph.texte}</span>
                            {ph.detail ? <span className="block truncate text-xs text-muted-strong">{ph.detail}</span> : null}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-strong">Aucun clic ni geste sur cette page.</p>
                )}

                {/* Un rejeu n'a de sens que s'il dure : un seul point ne rejoue rien. */}
                {points.some((pt) => pt.t > 500) ? (
                  <div className="border-t border-line p-4">
                    <Rejeu path={c.page.path} largeur={w} hauteur={h} points={points} clics={clics} />
                  </div>
                ) : null}
              </Card>
            </li>
          )
        })}
      </ol>

      {derniere && liste.length > 0 ? (
        <p className="text-sm text-muted-strong">
          Fin de la visite à {formatHeure(derniere.at)}, sur{' '}
          <span className="font-mono text-xs">{liste.at(-1)!.page.path}</span>.
        </p>
      ) : null}
    </div>
  )
}
