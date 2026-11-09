'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { IconChevronDown } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Une colonne de liens du pied de page.
 *
 * Sur téléphone, repliée derrière son titre (demande de l'exploitant,
 * 9 novembre 2026) : les quinze catégories de « Acheter » faisaient à elles
 * seules un écran entier. Sur ordinateur, toujours ouverte. Les liens restent
 * dans la page dans les deux cas (masqués en CSS), pour les moteurs.
 */
export function ColonneDuPied({ titre, liens }: { titre: string; liens: Array<{ label: string; href: string }> }) {
  const [ouverte, setOuverte] = useState(false)
  const id = useId()
  return (
    <nav aria-label={titre} className="max-lg:border-b max-lg:border-[#3a454b]">
      <h2 className="text-[14px] font-bold text-[#e2e7e8] lg:mb-3.5 lg:text-[12px]">
        <button
          type="button"
          aria-expanded={ouverte}
          aria-controls={id}
          onClick={() => setOuverte((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between text-left lg:pointer-events-none lg:min-h-0"
        >
          {titre}
          <IconChevronDown
            aria-hidden
            className={cn('size-4 shrink-0 transition-transform lg:hidden', ouverte && 'rotate-180')}
          />
        </button>
      </h2>
      <ul id={id} className={cn('pb-3 lg:block lg:pb-0', !ouverte && 'max-lg:hidden')}>
        {liens.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block py-2.5 text-[14px] text-[#97a5aa] transition-colors hover:text-white lg:my-2 lg:py-0 lg:text-[11px]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
