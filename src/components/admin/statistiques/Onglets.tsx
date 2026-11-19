import Link from 'next/link'

/**
 * Les quatre écrans de la mesure, et la période qui les accompagne.
 *
 * La période voyage d'un onglet à l'autre : passer de la vue d'ensemble sur
 * 30 jours à la liste des visites et retomber sur 7 jours sans l'avoir
 * demandé, c'est lire deux chiffres qui ne parlent pas de la même chose.
 */

const ONGLETS = [
  { cle: 'ensemble', href: '/admin/statistiques', label: 'Vue d’ensemble' },
  { cle: 'visites', href: '/admin/statistiques/visites', label: 'Visites une par une' },
  { cle: 'carte', href: '/admin/statistiques/carte', label: 'Carte des clics' },
  { cle: 'paniers', href: '/admin/statistiques/paniers', label: 'Paniers' },
] as const

export type CleOnglet = (typeof ONGLETS)[number]['cle']

export function Onglets({
  actif,
  jours,
  conserver = {},
}: {
  actif: CleOnglet
  jours: number
  /** Paramètres propres à l'onglet, à garder quand on change de période. */
  conserver?: Record<string, string | null | undefined>
}) {
  const lienPeriode = (j: number) => {
    const u = new URLSearchParams()
    u.set('jours', String(j))
    for (const [k, v] of Object.entries(conserver)) if (v) u.set(k, v)
    return `?${u}`
  }
  return (
    <div className="flex flex-col gap-3">
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
              href={lienPeriode(j)}
              aria-current={jours === j ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-semibold ${jours === j ? 'bg-white shadow-soft' : 'text-muted-strong'}`}
            >
              {j === 1 ? '24 h' : `${j} jours`}
            </Link>
          ))}
        </nav>
      </div>
      <nav aria-label="Écrans de statistiques" className="flex flex-wrap gap-1 border-b border-line">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={`${o.href}?jours=${jours}`}
            aria-current={actif === o.cle ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              actif === o.cle ? 'border-brand text-ink' : 'border-transparent text-muted-strong hover:text-ink'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
