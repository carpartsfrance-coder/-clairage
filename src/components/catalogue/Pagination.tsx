import Link from 'next/link'
import { cn } from '@/lib/cn'
import { IconChevronRight } from '@/components/ui/icons'

/**
 * Pagination par liens réels : chaque page a son URL, donc elle est
 * partageable, indexable et utilisable sans JavaScript. Un « charger plus »
 * en JavaScript aurait privé la navigation au clavier d'un point d'arrivée.
 */
export function Pagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number
  pageCount: number
  buildHref: (page: number) => string
}) {
  if (pageCount <= 1) return null

  // Fenêtre glissante autour de la page courante : au-delà d'une poignée de
  // pages, tout afficher devient illisible sur mobile.
  const windowSize = 2
  const pages: number[] = []
  for (let p = 1; p <= pageCount; p += 1) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= windowSize) pages.push(p)
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1.5 pt-8">
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          rel="prev"
          className="flex h-10 items-center gap-1 rounded-sm border border-line-strong px-3 text-sm font-semibold hover:border-slate-ink"
        >
          <IconChevronRight className="size-4 rotate-180" />
          Précédent
        </Link>
      ) : null}

      <ol className="flex items-center gap-1.5">
        {pages.map((p, index) => {
          const previous = pages[index - 1]
          return (
            <li key={p} className="flex items-center gap-1.5">
              {previous && p - previous > 1 ? (
                <span aria-hidden className="px-1 text-muted">
                  …
                </span>
              ) : null}
              <Link
                href={buildHref(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  'flex size-10 items-center justify-center rounded-sm border text-sm font-semibold',
                  p === page
                    ? 'border-brand bg-brand text-white'
                    : 'border-line-strong bg-white hover:border-slate-ink',
                )}
              >
                {p}
              </Link>
            </li>
          )
        })}
      </ol>

      {page < pageCount ? (
        <Link
          href={buildHref(page + 1)}
          rel="next"
          className="flex h-10 items-center gap-1 rounded-sm border border-line-strong px-3 text-sm font-semibold hover:border-slate-ink"
        >
          Suivant
          <IconChevronRight className="size-4" />
        </Link>
      ) : null}
    </nav>
  )
}
