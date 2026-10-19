'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SelectedVehicle } from '@/lib/session'
import type { NavSection } from '@/lib/queries/navigation'
import { topNav } from '@/lib/navigation'
import { Logo } from '@/components/brand/Logo'
import { BrandMark } from '@/components/packs/BrandMark'
import { cn } from '@/lib/cn'
import {
  IconChevronRight,
  IconClose,
  IconHeadset,
  IconMenu,
  IconReturn,
  IconUser,
} from '@/components/ui/icons'

/**
 * Menu compact pour mobile et tablette.
 *
 * Ce n'est pas la navigation ordinateur rétrécie, et ce n'est plus un
 * accordéon : les rubriques s'ouvrent **en niveaux**, avec un retour explicite
 * au niveau précédent. Un accordéon fait grandir la liste sous le doigt et
 * repousse hors écran ce qu'on vient de déplier ; avec une marque par ligne,
 * c'est impraticable.
 *
 * La position de défilement du premier niveau est mémorisée et restituée au
 * retour : revenir d'une rubrique ne doit pas renvoyer en haut d'une liste
 * qu'on avait parcourue.
 *
 * Clavier : Échap ferme (ou remonte d'un niveau), Tab tourne à l'intérieur du
 * panneau, le focus revient sur le bouton d'ouverture à la fermeture. Un
 * changement de page ferme aussi.
 */
export function MobileNav({
  vehicle,
  sections,
}: {
  vehicle: SelectedVehicle | null
  sections: NavSection[]
}) {
  const [open, setOpen] = useState(false)
  /** Rubrique ouverte : `null` = premier niveau. */
  const [niveau, setNiveau] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const defilementRef = useRef<HTMLDivElement>(null)
  /** Position de défilement du premier niveau, restituée au retour. */
  const positionNiveau0 = useRef(0)

  const ouverte = niveau ? (sections.find((section) => section.key === niveau) ?? null) : null

  /** Descend d'un niveau en mémorisant où l'on en était. */
  function ouvrir(key: string) {
    positionNiveau0.current = defilementRef.current?.scrollTop ?? 0
    setNiveau(key)
    // Le niveau suivant commence en haut : c'est une nouvelle liste.
    requestAnimationFrame(() => defilementRef.current?.scrollTo({ top: 0 }))
  }

  /** Remonte, et rend au premier niveau la position qu'il avait. */
  function revenir() {
    setNiveau(null)
    requestAnimationFrame(() =>
      defilementRef.current?.scrollTo({ top: positionNiveau0.current }),
    )
  }
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Une réouverture repart du premier niveau : rouvrir sur une rubrique
  // quittée il y a dix minutes désoriente plus que cela n'aide.
  useEffect(() => {
    if (!open) setNiveau(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = panelRef.current
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null)

    focusables()[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Échap remonte d'abord d'un niveau : fermer tout alors qu'on est
        // descendu dans une rubrique ferait perdre deux gestes au lieu d'un.
        if (niveau) revenir()
        else setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ouvrir le menu"
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-sm lg:hidden"
      >
        <IconMenu className="size-7" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-slate-ink/55 lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="flex h-full w-[min(88vw,380px)] flex-col overflow-y-auto bg-white"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Logo showBaseline={false} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="-mr-2 flex size-11 items-center justify-center rounded-sm text-muted-strong"
              >
                <IconClose className="size-6" />
              </button>
            </div>

            {vehicle ? (
              <p className="border-b border-line bg-surface-soft px-4 py-3 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Votre véhicule
                </span>
                <span className="font-semibold">{vehicle.label}</span>
              </p>
            ) : null}

            {/*
              Navigation à niveaux.

              Niveau 0 : les rubriques. Niveau 1 : les colonnes d'une rubrique,
              précédées d'un retour explicite et d'un accès direct à la page de
              la rubrique — une rubrique est toujours une destination, pas
              seulement un tiroir.
            */}
            <nav
              aria-label="Catégories"
              ref={defilementRef}
              className="flex-1 overflow-y-auto px-2 py-2"
            >
              {ouverte ? (
                <>
                  <button
                    type="button"
                    onClick={revenir}
                    className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-muted-strong"
                  >
                    <IconChevronRight className="size-4 shrink-0 rotate-180" />
                    Toutes les rubriques
                  </button>

                  <p className="px-3 pt-2 pb-1 text-base font-bold">
                    {ouverte.kicker ? (
                      <span className="block text-[11px] font-normal text-muted-strong">
                        {ouverte.kicker}
                      </span>
                    ) : null}
                    {ouverte.label}
                  </p>

                  <Link
                    href={ouverte.href}
                    className="mx-3 mb-2 flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4"
                  >
                    Voir toute la rubrique
                  </Link>

                  {ouverte.columns.map((colonne) => (
                    <div key={colonne.title} className="border-t border-line pt-2">
                      <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                        {colonne.title}
                      </p>
                      <ul>
                        {colonne.links.map((lien) => (
                          <li key={lien.href}>
                            <Link
                              href={lien.href}
                              className="flex min-h-12 items-center justify-between gap-3 px-3 text-sm"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                {'logo' in lien ? (
                                  <BrandMark name={lien.label} logo={lien.logo} size="sm" />
                                ) : null}
                                <span className="truncate font-medium">{lien.label}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted">
                                {lien.hint ?? lien.count}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {colonne.more ? (
                        <Link
                          href={colonne.more.href}
                          className="mx-3 mb-2 flex min-h-11 items-center text-sm underline underline-offset-4"
                        >
                          {colonne.more.label}
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : (
                <ul>
                  {sections.map((section) => {
                    const deployable = section.columns.length > 0
                    return (
                      <li key={section.key} className="border-b border-line last:border-b-0">
                        {deployable ? (
                          <button
                            type="button"
                            onClick={() => ouvrir(section.key)}
                            className={cn(
                              'flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left',
                              section.highlight && 'text-brand',
                            )}
                          >
                            <span className="flex flex-col leading-tight">
                              {section.kicker ? (
                                <span className="text-[11px] text-muted-strong">
                                  {section.kicker}
                                </span>
                              ) : null}
                              <span className="text-base font-semibold">{section.label}</span>
                            </span>
                            <IconChevronRight className="size-5 shrink-0 text-muted-strong" />
                          </button>
                        ) : (
                          <Link
                            href={section.href}
                            className={cn(
                              'flex min-h-12 flex-col justify-center px-3 py-2 leading-tight',
                              section.highlight && 'text-brand',
                            )}
                          >
                            {section.kicker ? (
                              <span className="text-[11px] text-muted-strong">
                                {section.kicker}
                              </span>
                            ) : null}
                            <span className="text-base font-semibold">{section.label}</span>
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </nav>

            <div className="border-t border-line px-2 py-2">
              <ul>
                <li>
                  <Link href="/guides" className="flex min-h-12 items-center gap-3 px-3 font-semibold">
                    <IconHeadset className="size-5 text-muted-strong" />
                    Conseils &amp; montage
                  </Link>
                </li>
                {topNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex min-h-12 items-center gap-3 px-3 font-semibold">
                      {item.icon === 'return' ? (
                        <IconReturn className="size-5 text-muted-strong" />
                      ) : (
                        <IconHeadset className="size-5 text-muted-strong" />
                      )}
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/compte" className="flex min-h-12 items-center gap-3 px-3 font-semibold">
                    <IconUser className="size-5 text-muted-strong" />
                    Mon compte
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
