'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { IconSearch } from '@/components/ui/icons'

export type SearchableEntry = { slug: string; name: string; href: string; hint?: string }

/**
 * Recherche dans une liste de marques ou de modèles.
 *
 * **Elle ne s'affiche qu'au-delà du seuil.** Un champ de recherche au-dessus
 * de trois marques coûte une ligne et n'économise rien ; au-delà d'une
 * douzaine, parcourir une grille devient pénible. Le seuil est ici, pas dans
 * les pages, pour que les deux niveaux se comportent pareil.
 *
 * Le filtrage est purement local : la liste complète est déjà rendue par le
 * serveur, et chaque entrée reste un lien ordinaire. Sans JavaScript, le champ
 * n'apparaît pas et la grille reste entièrement navigable.
 */
const SEUIL = 12

export function MakeSearch({
  makes,
  label,
}: {
  makes: SearchableEntry[]
  label: string
}) {
  const [query, setQuery] = useState('')

  const resultats = useMemo(() => {
    const terme = query.trim().toLowerCase()
    if (!terme) return []
    return makes.filter((make) => make.name.toLowerCase().includes(terme)).slice(0, 10)
  }, [makes, query])

  if (makes.length < SEUIL) return null

  return (
    <div className="mt-5">
      <label htmlFor="recherche-marque" className="text-[11px] font-bold">
        {label}
      </label>
      <div className="relative mt-[7px]">
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id="recherche-marque"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          placeholder="Tapez les premières lettres"
          className="h-[46px] w-full rounded-[7px] border border-[#d5d9cf] bg-white pr-3 pl-9 text-[13px] text-[#31372c] placeholder:text-muted"
        />
      </div>

      {query.trim() ? (
        <div aria-live="polite">
          {resultats.length === 0 ? (
            <p className="mt-2 text-[10px] text-muted-strong">
              Aucune correspondance. La liste complète reste affichée ci-dessous.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {resultats.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={entry.href}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e1e5d9] px-[14px] text-[11px] hover:border-slate-ink"
                  >
                    {entry.name}
                    {entry.hint ? (
                      <span className="text-[9px] text-[#838c77]">{entry.hint}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
