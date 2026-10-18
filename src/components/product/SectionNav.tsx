'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export type SectionNavItem = { href: string; label: string }

/**
 * Ancres des sections — `.section-nav` de la référence.
 *
 * Valeurs reprises de `styles.css` : filet bas, fond blanc, 39 px d'écart
 * (25 en mobile avec défilement horizontal), intitulés à 11 px, 19 px de
 * marge haute et basse, et le soulignement rouge de 2 px sous la section
 * courante.
 *
 * Le suivi du défilement est en JavaScript, mais rien n'en dépend : ce sont
 * des ancres ordinaires. Sans script, elles naviguent toujours ; seul le
 * soulignement reste sur la première.
 */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState(items[0]?.href ?? '')

  useEffect(() => {
    const cibles = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((element): element is HTMLElement => element !== null)
    if (cibles.length === 0) return

    const observateur = new IntersectionObserver(
      (entrées) => {
        // La section courante est la plus haute de celles qui coupent la
        // bande de lecture : on ne saute pas à la suivante dès qu'elle pointe.
        const visibles = entrées
          .filter((entrée) => entrée.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles[0]) setActive(`#${visibles[0].target.id}`)
      },
      // Bande étroite sous l'en-tête : la section « courante » est celle qu'on
      // est en train de lire, pas celle qui affleure en bas de fenêtre.
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    )

    cibles.forEach((cible) => observateur.observe(cible))
    return () => observateur.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Sections de la fiche"
      className="sticky top-0 z-20 border-b border-line bg-white"
    >
      <div className="container-page flex gap-[25px] overflow-x-auto whitespace-nowrap fiche:gap-[39px]">
        {items.map((item) => {
          const courant = item.href === active
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={courant ? 'true' : undefined}
              className={cn(
                'relative shrink-0 py-[15px] text-[10px] fiche:py-[19px] fiche:text-[11px]',
                courant
                  ? 'font-bold text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand'
                  : 'text-[#737371] hover:text-ink',
              )}
            >
              {item.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
