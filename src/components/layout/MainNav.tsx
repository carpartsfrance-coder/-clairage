'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { NavSection } from '@/lib/queries/navigation'
import { IconChevronDown } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Barre de navigation principale, avec panneaux.
 *
 * **Chaque rubrique est un lien avant d'être un panneau.** Le libellé mène à
 * la page de la rubrique ; un bouton séparé, à côté, ouvre le panneau. Un
 * en-tête où le survol est la seule façon d'atteindre un niveau laisse dehors
 * le clavier, le tactile et tous ceux qui cliquent sur ce qu'ils lisent.
 *
 * Ce qui en découle :
 *
 * - le panneau s'ouvre au clic et au survol, se ferme à Échap et au clic
 *   extérieur, et `aria-expanded` dit son état ;
 * - la fermeture au survol est temporisée : traverser un blanc de deux pixels
 *   entre le bouton et le panneau ne doit pas le faire disparaître ;
 * - une rubrique sans colonne n'a pas de bouton du tout — rien à déplier.
 */
export function MainNav({ sections }: { sections: NavSection[] }) {
  const [ouverte, setOuverte] = useState<string | null>(null)
  const conteneur = useRef<HTMLDivElement>(null)
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Échap ferme, et le clic hors de la barre aussi.
  useEffect(() => {
    if (!ouverte) return

    const surTouche = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOuverte(null)
    }
    const surClic = (event: MouseEvent) => {
      if (!conteneur.current?.contains(event.target as Node)) setOuverte(null)
    }

    document.addEventListener('keydown', surTouche)
    document.addEventListener('mousedown', surClic)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('mousedown', surClic)
    }
  }, [ouverte])

  useEffect(
    () => () => {
      if (fermeture.current) clearTimeout(fermeture.current)
    },
    [],
  )

  function programmerFermeture() {
    if (fermeture.current) clearTimeout(fermeture.current)
    fermeture.current = setTimeout(() => setOuverte(null), 180)
  }

  function annulerFermeture() {
    if (fermeture.current) {
      clearTimeout(fermeture.current)
      fermeture.current = null
    }
  }

  return (
    <div ref={conteneur} className="relative">
      <ul className="flex items-center">
        {sections.map((section, index) => {
          const deployable = section.columns.length > 0
          const active = ouverte === section.key
          const panneauId = `panneau-${section.key}`
          /*
            Le nom complet, surtitre compris. Le libellé seul produisait
            « Déplier LED haute puissance », indistinct de « Déplier LED
            veilleuses » pour qui n'a que l'annonce vocale.
          */
          const nomComplet = section.kicker ? `${section.kicker} ${section.label}` : section.label

          return (
            <li
              key={section.key}
              className="flex items-center"
              onMouseEnter={() => {
                annulerFermeture()
                if (deployable) setOuverte(section.key)
              }}
              onMouseLeave={programmerFermeture}
            >
              {index > 0 ? <span aria-hidden className="h-4 w-px bg-[#e6eadd]" /> : null}

              {/*
                Deux lignes : le surtitre dit la nature de la rubrique
                (« Packs par marque », « Ampoules »), le libellé dit laquelle.
                Sur une seule ligne, « Kits LED et ampoules LED haute
                puissance » déborderait la barre.
              */}
              <Link
                href={section.href}
                className={cn(
                  'flex flex-col justify-center py-1.5 pl-[14px] leading-tight whitespace-nowrap transition-colors first:pl-0',
                  deployable ? 'pr-1' : 'pr-[14px]',
                  section.highlight ? 'text-brand' : 'hover:text-brand',
                )}
              >
                {section.kicker ? (
                  <span
                    className={cn(
                      'text-[9px] font-medium',
                      section.highlight ? 'text-brand/80' : 'text-[#8c9481]',
                    )}
                  >
                    {section.kicker}
                  </span>
                ) : null}
                <span
                  className={cn('text-[12px]', section.highlight ? 'font-bold' : 'font-medium')}
                >
                  {section.label}
                </span>
              </Link>

              {deployable ? (
                <button
                  type="button"
                  aria-expanded={active}
                  aria-controls={panneauId}
                  aria-label={`${active ? 'Replier' : 'Déplier'} ${nomComplet}`}
                  onClick={() => setOuverte(active ? null : section.key)}
                  className="mr-[10px] flex size-6 items-center justify-center rounded-xs text-muted transition-colors hover:text-brand"
                >
                  <IconChevronDown
                    className={cn('size-3.5 transition-transform', active && 'rotate-180')}
                  />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>

      {/* Panneau : une seule instance, positionnée sous la barre. */}
      {sections.map((section) => {
        if (section.columns.length === 0 || ouverte !== section.key) return null
        return (
          <div
            key={section.key}
            id={`panneau-${section.key}`}
            onMouseEnter={annulerFermeture}
            onMouseLeave={programmerFermeture}
            className="absolute top-full left-0 z-30 mt-px w-full min-w-[520px] rounded-b-lg border border-t-0 border-line bg-white p-5 shadow-pop"
          >
            {section.description ? (
              <p className="mb-3 text-[10px] text-muted-strong">{section.description}</p>
            ) : null}

            <div
              className={cn(
                'grid gap-x-8 gap-y-4',
                section.columns.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              {section.columns.map((colonne) => (
                <div key={colonne.title}>
                  <p className="mb-2 text-[8px] font-bold tracking-[1.2px] text-[#8c9481] uppercase">
                    {colonne.title}
                  </p>
                  <ul className="flex flex-col">
                    {colonne.links.map((lien) => (
                      <li key={lien.href}>
                        <Link
                          href={lien.href}
                          onClick={() => setOuverte(null)}
                          className="flex min-h-9 items-baseline justify-between gap-3 rounded-xs py-1 text-[11px] hover:text-brand"
                        >
                          <span className="font-medium">{lien.label}</span>
                          <span className="shrink-0 text-[9px] text-[#a4a49d]">
                            {lien.hint ?? lien.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {colonne.more ? (
                    <Link
                      href={colonne.more.href}
                      onClick={() => setOuverte(null)}
                      className="mt-2 inline-flex min-h-9 items-center text-[10px] font-semibold underline underline-offset-[3px] hover:text-brand"
                    >
                      {colonne.more.label}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Toujours une sortie vers la page complète de la rubrique. */}
            <Link
              href={section.href}
              onClick={() => setOuverte(null)}
              className="mt-4 inline-flex min-h-9 items-center border-t border-line pt-3 text-[10px] font-bold hover:text-brand"
            >
              Voir toute la rubrique {section.kicker ? `${section.kicker} ` : ''}{section.label} ↗
            </Link>
          </div>
        )
      })}
    </div>
  )
}
