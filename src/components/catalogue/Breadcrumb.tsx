import Link from 'next/link'

/**
 * Fil d'Ariane. Le dernier élément est la page courante : il n'est pas un lien,
 * et porte aria-current pour que ce soit dit, pas seulement montré.
 */
export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>
}) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden>›</span> : null}
            {item.href ? (
              <Link href={item.href} className="underline underline-offset-4 hover:text-slate-ink">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-muted-strong">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
