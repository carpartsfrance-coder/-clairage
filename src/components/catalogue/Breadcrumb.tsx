import Link from 'next/link'

/**
 * Fil d'Ariane — `.breadcrumb` du code de référence.
 *
 * Valeurs reprises de `styles.css` : hauteur de 54 px (43 en mobile), 11 px
 * (10 en mobile), 10 px d'écart, séparateurs en #a7a8a9 et page courante en
 * couleur d'encre.
 *
 * Le dernier élément est la page courante : il n'est pas un lien, et porte
 * aria-current pour que ce soit dit, pas seulement montré.
 */
export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>
}) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-[10px] text-muted fiche:text-[11px]">
      <ol className="flex h-[43px] flex-wrap items-center gap-x-[9px] gap-y-1 fiche:h-[54px] fiche:gap-x-2.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-[9px] fiche:gap-2.5">
            {index > 0 ? (
              <span aria-hidden="true" className="text-[#a7a8a9]">
                ›
              </span>
            ) : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink hover:underline underline-offset-4">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
