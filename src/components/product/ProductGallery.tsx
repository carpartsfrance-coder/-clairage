'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { GalleryItem } from '@/lib/queries/product'
import { cn } from '@/lib/cn'
import { IconClose, IconZoom } from '@/components/ui/icons'

/**
 * Galerie de la fiche produit.
 *
 * Les vignettes sont des boutons d'un groupe d'onglets : flèches gauche/droite
 * pour circuler, Entrée pour choisir — c'est le motif attendu par les lecteurs
 * d'écran, et il évite d'avoir à cliquer au pixel près.
 *
 * La légende de chaque visuel est affichée telle qu'elle est enregistrée. Quand
 * un visuel est une illustration, c'est sa légende qui le dit : on ne laisse
 * pas croire qu'un rendu simulé est une photo du résultat.
 */
export function ProductGallery({
  items,
  badge,
  productName,
}: {
  items: GalleryItem[]
  /** Pastille en haut à gauche : « Blanc pur · 6 000 K ». */
  badge?: string | null
  productName: string
}) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  if (items.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-line bg-surface-muted text-sm text-muted">
        Aucun visuel disponible
      </div>
    )
  }

  const current = items[Math.min(index, items.length - 1)]

  function onThumbKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length
    setIndex(next)
    document.getElementById(`galerie-vignette-${next}`)?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-surface-muted">
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain"
        />

        {badge ? (
          <span className="absolute left-4 top-4 rounded-xs border border-line bg-white/95 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide">
            {badge}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="Agrandir le visuel"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full border border-line bg-white/95 transition-colors hover:border-slate-ink"
        >
          <IconZoom className="size-5" />
        </button>

        {current.caption ? (
          <p className="absolute bottom-3 left-4 right-4 text-xs text-muted-strong">
            {current.caption}
          </p>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div role="tablist" aria-label="Visuels du produit" className="grid grid-cols-4 gap-3">
          {items.map((item, itemIndex) => {
            const active = itemIndex === index
            return (
              <button
                key={item.url}
                id={`galerie-vignette-${itemIndex}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onKeyDown={onThumbKeyDown}
                onClick={() => setIndex(itemIndex)}
                className="flex flex-col gap-1.5 text-left"
              >
                <span
                  className={cn(
                    'relative block aspect-square overflow-hidden rounded-sm border bg-surface-muted transition-colors',
                    active ? 'border-brand' : 'border-line hover:border-line-strong',
                  )}
                >
                  <Image
                    src={item.url}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-contain p-1.5"
                  />
                </span>
                <span
                  className={cn(
                    'truncate text-xs',
                    active ? 'font-bold text-slate-ink' : 'text-muted-strong',
                  )}
                >
                  {item.thumbLabel}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {zoomed ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} — visuel agrandi`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-ink/85 p-4"
          onClick={() => setZoomed(false)}
          onKeyDown={(event) => event.key === 'Escape' && setZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Fermer"
            autoFocus
            className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-white text-slate-ink"
          >
            <IconClose className="size-6" />
          </button>
          <div className="relative h-full max-h-[85vh] w-full max-w-5xl">
            <Image
              src={current.url}
              alt={current.alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
