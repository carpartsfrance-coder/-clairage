'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SelectedVehicle } from '@/lib/session'
import { accessoryNav, mainNav, topNav } from '@/lib/navigation'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'
import {
  IconChevronDown,
  IconClose,
  IconHeadset,
  IconMenu,
  IconReturn,
  IconUser,
} from '@/components/ui/icons'

/**
 * Menu compact pour mobile et tablette.
 *
 * Ce n'est pas la navigation ordinateur rétrécie : les sept familles sont
 * dépliables une par une, les liens d'aide et de compte sont remontés en bas de
 * panneau, et chaque cible fait au moins 44 px de haut.
 *
 * Clavier : Échap ferme, Tab tourne à l'intérieur du panneau, le focus revient
 * sur le bouton d'ouverture à la fermeture. Un changement de page ferme aussi.
 */
export function MobileNav({ vehicle }: { vehicle: SelectedVehicle | null }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

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
        setOpen(false)
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

            <nav aria-label="Catégories" className="flex-1 px-2 py-2">
              <ul>
                {mainNav.map((item) => {
                  const hasChildren = Boolean(item.children?.length)
                  const isExpanded = expanded === item.href
                  return (
                    <li key={item.href} className="border-b border-line last:border-b-0">
                      <div className="flex items-stretch">
                        <Link
                          href={item.href}
                          className={cn(
                            'flex min-h-12 flex-1 items-center px-3 text-base font-semibold',
                            item.highlight && 'text-brand',
                          )}
                        >
                          {item.label}
                        </Link>
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : item.href)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Replier' : 'Déplier'} ${item.label}`}
                            className="flex w-12 shrink-0 items-center justify-center text-muted-strong"
                          >
                            <IconChevronDown
                              className={cn('size-5 transition-transform', isExpanded && 'rotate-180')}
                            />
                          </button>
                        ) : null}
                      </div>
                      {hasChildren && isExpanded ? (
                        <ul className="pb-2">
                          {item.children!.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className="flex min-h-11 items-center px-6 text-sm text-muted-strong"
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>

              <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted">
                Accessoires
              </p>
              <ul>
                {accessoryNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex min-h-11 items-center px-3 text-sm">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
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
