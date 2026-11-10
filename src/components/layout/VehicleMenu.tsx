'use client'

import { useEffect, useRef, useState } from 'react'
import type { SelectedVehicle } from '@/lib/session'
import { IconCar, IconChevronDown, IconClose, IconMotorcycle, IconPencil } from '@/components/ui/icons'
import { VehiclePicker } from '@/components/vehicle/VehiclePicker'

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
          className="flex min-h-9 w-full items-center gap-2.5 rounded-sm text-left text-sm"
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
                Votre véhicule : voyez ce qui lui va
              </span>
              <span className="shrink-0 font-semibold text-brand">Choisir</span>
            </>
          )}
        </button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-ink/55 sm:items-start sm:p-4 sm:pt-[7vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          {/*
            Plein écran sur téléphone, fenêtre de hauteur fixe au-delà : le
            contenu défile à l'intérieur, l'en-tête et le fil des étapes
            restent en place quand on passe d'une étape à l'autre.
          */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-dialog-title"
            className="flex h-full w-full flex-col bg-white sm:h-[min(680px,86vh)] sm:max-w-2xl sm:rounded-2xl sm:shadow-pop"
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="vehicle-dialog-title" className="text-[20px] font-bold tracking-[-0.3px]">
                  {vehicle ? 'Changer de véhicule' : 'Votre véhicule'}
                </h2>
                {vehicle ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[14px] text-muted-strong">
                    <span className="truncate">Actuel : {vehicle.label}</span>
                    <form action="/api/vehicule/retirer" method="post" className="inline">
                      <button type="submit" className="font-semibold text-muted-strong underline underline-offset-2 hover:text-danger">
                        Retirer
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-1 text-[14px] text-muted-strong">
                    Vous ne verrez ensuite que ce qui se monte dessus.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="-m-1 grid size-10 shrink-0 place-items-center rounded-full text-muted-strong transition-colors hover:bg-surface-muted hover:text-slate-ink"
              >
                <IconClose className="size-6" />
              </button>
            </div>

            <VehiclePicker
              className="flex-1"
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
        </div>
      ) : null}
    </>
  )
}
