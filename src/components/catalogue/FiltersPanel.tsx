'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { IconClose, IconSliders } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Filtres et tri : panneau sur mobile, carte en flux sur ordinateur.
 *
 * Le contenu est rendu par le serveur et passé en `children` : les facettes
 * restent des liens, le tri reste un formulaire `GET`, et les paramètres d'URL
 * ne changent pas. Ce composant ne fait que décider **où** ce contenu
 * s'affiche. Sans JavaScript, le panneau est simplement toujours ouvert.
 *
 * Pourquoi un panneau sur mobile : la carte de filtres mesurait un demi-écran
 * et s'intercalait entre la recherche et le premier produit. On la rend
 * accessible par un bouton, pour que les résultats arrivent tout de suite.
 *
 * Le panneau **ne se ferme pas** quand un filtre est appliqué : on en pose
 * souvent plusieurs à la suite, et le nombre de résultats se met à jour sous
 * les yeux. Il se ferme par la croix, Échap, le voile, ou le bouton qui
 * annonce le nombre de résultats.
 *
 * Clavier : Tab tourne dans le panneau, Échap ferme, le focus revient sur le
 * bouton d'ouverture. Même comportement que le menu mobile.
 */
export function FiltersPanel({
  children,
  activeCount,
  resultLabel,
  resetHref,
}: {
  children: ReactNode
  /** Nombre de filtres actifs, affiché sur le bouton. */
  activeCount: number
  /** « 12 résultats », quand le compte est connu. */
  resultLabel: string | null
  /** Lien de remise à zéro, absent s'il n'y a rien à retirer. */
  resetHref: string | null
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  /** Vrai le temps d'une fermeture, pour savoir s'il faut rendre le focus. */
  const wasOpen = useRef(false)
  const panelId = useId()
  const titleId = `${panelId}-titre`

  /*
    Rendre le focus au bouton d'ouverture, quelle que soit la façon dont le
    panneau s'est fermé — croix, Échap, voile, bouton de validation.

    C'est fait ici plutôt que dans chaque fermeture : Échap est traité dans un
    écouteur clavier, et l'oublier à cet endroit laissait le focus retomber sur
    le corps de la page. Au clavier, on repartait alors du tout début du
    document à chaque fermeture.
  */
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    triggerRef.current?.focus()
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

    // Le fond ne défile pas pendant que le panneau est ouvert.
    const overflowAvant = document.body.style.overflow
    document.body.style.overflow = 'hidden'

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
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflowAvant
    }
  }, [open])

  // Le retour du focus est assuré par l'effet ci-dessus, pour tous les chemins.
  function fermer() {
    setOpen(false)
  }

  return (
    <>
      {/* ---------------- Déclencheur, mobile seulement ---------------- */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong bg-white px-4 text-sm font-semibold transition-colors hover:border-slate-ink"
        >
          <IconSliders className="size-4 shrink-0" />
          Filtrer et trier
          {activeCount > 0 ? (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>

        {resultLabel ? <p className="text-sm text-muted-strong">{resultLabel}</p> : null}
      </div>

      {/* ---------------- Voile ---------------- */}
      {open ? (
        <div
          aria-hidden
          onClick={fermer}
          className="fixed inset-0 z-50 bg-ink/50 lg:hidden"
        />
      ) : null}

      {/* ---------------- Contenu ----------------
          Sur ordinateur il est toujours en flux. Sur mobile il n'existe que
          lorsqu'on l'ouvre. */}
      <div
        id={panelId}
        ref={panelRef}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? titleId : undefined}
        className={cn(
          'lg:mt-0 lg:block',
          open
            ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col rounded-t-lg bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.18)] lg:static lg:max-h-none lg:rounded-none lg:shadow-none'
            : 'mt-4 hidden lg:mt-0 lg:block',
        )}
      >
        {/* En-tête du panneau : mobile seulement. */}
        {open ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3 lg:hidden">
            <h2 id={titleId} className="text-base font-bold">
              Filtrer et trier
            </h2>
            <button
              type="button"
              onClick={fermer}
              className="inline-flex size-10 items-center justify-center rounded-sm text-muted-strong transition-colors hover:bg-surface-muted hover:text-slate-ink"
            >
              <IconClose className="size-5" />
              <span className="sr-only">Fermer les filtres</span>
            </button>
          </div>
        ) : null}

        <div className={cn(open && 'min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:overflow-visible lg:p-0')}>
          {children}
        </div>

        {/* Pied du panneau : mobile seulement. */}
        {open ? (
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-3 lg:hidden">
            {resetHref ? (
              <Link
                href={resetHref}
                className="inline-flex h-11 shrink-0 items-center px-2 text-sm font-semibold text-slate-ink underline underline-offset-4"
              >
                Réinitialiser
              </Link>
            ) : null}
            <button
              type="button"
              onClick={fermer}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-sm bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              {resultLabel ? `Voir ${resultLabel.replace(/\.$/, '')}` : 'Voir les résultats'}
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
