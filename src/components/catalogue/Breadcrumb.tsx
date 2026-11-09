import Link from 'next/link'
import { cn } from '@/lib/cn'

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
  retourMobile,
}: {
  items: Array<{ label: string; href?: string }>
  /**
   * Sur téléphone, un seul lien retour (« ‹ Audi A1 (2010–2018) ») à la place
   * du fil complet, qui prenait deux lignes pour redire le titre (demande de
   * l'exploitant, 9 novembre 2026). Le fil complet reste dans les données
   * structurées (BreadcrumbStructuredData) : rien ne change pour Google.
   */
  retourMobile?: { label: string; href: string } | null
}) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-[10px] text-muted fiche:text-[11px]">
      {retourMobile ? (
        <Link
          href={retourMobile.href}
          className="flex min-h-10 items-center gap-1.5 py-1.5 text-[13px] font-semibold text-muted-strong hover:text-ink fiche:hidden"
        >
          <span aria-hidden="true" className="text-[17px] leading-none">‹</span>
          {retourMobile.label}
        </Link>
      ) : null}
      <ol
        className={cn(
          'flex min-h-[43px] flex-wrap items-center gap-x-[9px] gap-y-1 py-2 fiche:min-h-[54px] fiche:gap-x-2.5',
          retourMobile && 'max-fiche:hidden',
        )}
      >
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
