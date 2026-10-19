'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { SelectedVehicle } from '@/lib/session'
import { cn } from '@/lib/cn'
import { IconCar, IconChevronDown, IconClose, IconMotorcycle, IconPencil } from '@/components/ui/icons'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'

/**
 * Point d'entrée véhicule du header.
 *
 * Deux présentations : `menu` pour la ligne principale sur ordinateur,
 * `bar` pour le bandeau mobile dédié. Les deux ouvrent le même sélecteur dans
 * une boîte de dialogue modale, avec piège de focus et fermeture à Échap.
 */
export function VehicleMenu({
  vehicle,
  variant = 'menu',
}: {
  vehicle: SelectedVehicle | null
  /**
   * `menu` : ligne principale du header.
   * `bar`  : bandeau mobile, le libellé du véhicule est porté par le bouton.
   * `action` : bouton seul, quand le libellé est déjà affiché à côté
   *            (VehicleBar) — sinon il apparaîtrait deux fois.
   */
  variant?: 'menu' | 'bar' | 'action'
}) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Échap ferme, Tab reste enfermé dans la modale, le focus revient au bouton.
  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const node = dialogRef.current
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
      ;(triggerRef.current ?? previouslyFocused)?.focus()
    }
  }, [open])

  const Icon = vehicle?.type === 'MOTORCYCLE' ? IconMotorcycle : IconCar

  return (
    <>
      {variant === 'action' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <IconPencil className="size-4 shrink-0" />
          {vehicle ? 'Modifier' : 'Choisir'}
        </button>
      ) : variant === 'menu' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-12 items-center gap-3 rounded-sm px-2 text-left transition-colors hover:text-brand"
        >
          <Icon className="size-8 shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-[0.9375rem] font-bold">
              {vehicle ? 'Mon véhicule' : 'Mon véhicule'}
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-strong">
              <span className="max-w-[180px] truncate">
                {vehicle ? vehicle.label : 'Ajouter un véhicule'}
              </span>
              <IconChevronDown className="size-4 shrink-0" />
            </span>
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-sm text-left text-sm"
        >
          <Icon className="size-5 shrink-0 text-muted-strong" />
          {vehicle ? (
            <>
              <span className="min-w-0 flex-1 truncate font-semibold">{vehicle.label}</span>
              <span className="flex shrink-0 items-center gap-1 font-semibold text-brand">
                <IconPencil className="size-4" />
                Modifier
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-muted-strong">
                Ajoutez votre véhicule pour filtrer le catalogue
              </span>
              <span className="shrink-0 font-semibold text-brand">Choisir</span>
            </>
          )}
        </button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-ink/55 p-4 pt-[8vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-dialog-title"
            className="w-full max-w-2xl rounded-lg border border-line bg-white shadow-pop"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id="vehicle-dialog-title" className="text-lg font-bold">
                  {vehicle ? 'Changer de véhicule' : 'Choisir mon véhicule'}
                </h2>
                <p className="mt-0.5 text-sm text-muted-strong">
                  L&apos;équipement d&apos;origine est demandé avant le choix du kit : c&apos;est
                  lui qui détermine la compatibilité, pas le culot seul.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="-m-1 shrink-0 rounded-sm p-1 text-muted-strong transition-colors hover:text-slate-ink"
              >
                <IconClose className="size-6" />
              </button>
            </div>

            <div className="px-5 py-5">
              <VehicleSelector
                layout="stacked"
                currentConfigurationId={vehicle?.configurationId ?? null}
                initial={
                  vehicle
                    ? {
                        type: vehicle.type,
                        makeId: vehicle.selection.makeId,
                        modelId: vehicle.selection.modelId,
                        year: vehicle.selection.year,
                      }
                    : null
                }
                onDone={() => setOpen(false)}
              />
            </div>

            <div
              className={cn(
                'flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm',
              )}
            >
              <Link
                href="/vehicule"
                className="font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
              >
                Page de sélection complète
              </Link>
              {vehicle ? (
                <form action="/api/vehicule/retirer" method="post">
                  <button type="submit" className="font-semibold text-muted-strong hover:text-danger">
                    Retirer le véhicule
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
