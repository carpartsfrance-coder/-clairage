'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { GalleryItem } from '@/lib/queries/product'
import { cn } from '@/lib/cn'
import { IconClose, IconZoom } from '@/components/ui/icons'

/**
 * Galerie de la fiche produit — `.gallery` du code de référence.
 *
 * Valeurs reprises de `styles.css` : visuel de 439 px (480 au-delà de 1450 px,
 * 405 sous 1100, 340 sous 800), rayon 13 px sur fond #f2f2ef, pastille et
 * bouton d'agrandissement posés dessus, légende en bas, puis quatre vignettes
 * de 87 px avec leur intitulé incrusté. Le projet affichait un cadre en 4/3 et
 * des vignettes carrées légendées en dessous.
 *
 * **Le fondu multiplié n'est pas décoratif** : la référence détoure ses
 * packshots en les multipliant sur le panneau clair, ce qui ne marche que pour
 * un visuel sur fond blanc. Une photographie en situation y deviendrait
 * illisible. Le mode est donc choisi par rôle de visuel, pas appliqué à tout.
 *
 * Les vignettes restent un groupe d'onglets : flèches gauche/droite pour
 * circuler, Entrée pour choisir. La légende de chaque visuel est affichée
 * telle qu'elle est enregistrée — quand un visuel est une illustration, c'est
 * sa légende qui le dit.
 */

/** Vrai pour un packshot sur fond clair, qui supporte le fondu multiplié. */
function estPackshot(role: GalleryItem['role']) {
  return role === 'PRODUCT' || role === 'KIT_CONTENT'
}

export function ProductGallery({
  items,
  badge,
  productName,
}: {
  items: GalleryItem[]
  /** Pastille en haut à gauche : « Culot H7 ». */
  badge?: string | null
  productName: string
}) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  if (items.length === 0) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-[13px] border border-line bg-surface-muted text-sm text-muted fiche:h-[405px] min-[1101px]:h-[439px]">
        Aucun visuel disponible
      </div>
    )
  }

  const current = items[Math.min(index, items.length - 1)]
  const packshot = estPackshot(current.role)

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
    /* .gallery : collée à 25 px du haut, mais seulement là où elle fait face
       au bloc d'achat. Sous 800 px la référence la remet dans le flux. */
    <div className="fiche:sticky fiche:top-[25px]">
      {/* .main-image : 439 px, rayon 13 px, fond #f2f2ef. */}
      <div className="relative h-[340px] overflow-hidden rounded-[13px] bg-[#f2f2ef] fiche:h-[405px] min-[1101px]:h-[439px] min-[1450px]:h-[480px]">
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={cn('object-cover', packshot && 'mix-blend-multiply')}
        />

        {/* .image-pill : filet clair, fond translucide, point d'encre. */}
        {badge ? (
          <span className="absolute top-[15px] left-[15px] z-[1] flex items-center gap-[7px] rounded-full border border-[#dedfda] bg-white/60 px-2.5 py-1.5 text-[7px] font-bold tracking-[1px] uppercase fiche:top-5 fiche:left-5 fiche:text-[8px]">
            <span aria-hidden="true" className="size-[5px] rounded-full bg-ink" />
            {badge}
          </span>
        ) : null}

        {/* .expand-image : pastille blanche de 30 px. */}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="Agrandir le visuel"
          className="absolute top-[17px] right-4 z-[1] grid size-[30px] place-items-center rounded-full bg-white"
        >
          <IconZoom className="size-[17px]" />
        </button>

        {/*
          .photo-caption — deux lignes dans la référence : ce qu'on regarde,
          puis la nature du visuel. La seconde est la légende enregistrée ;
          la première est l'intitulé de la vue, pas une accroche inventée.
        */}
        <div
          className={cn(
            'absolute right-[18px] bottom-[17px] left-[18px] z-[1] flex flex-col gap-px fiche:right-[23px] fiche:bottom-5 fiche:left-[23px]',
            !packshot && 'text-white',
          )}
        >
          <strong className="text-[13px] tracking-[-0.2px] fiche:text-[14px]">
            {current.thumbLabel}
          </strong>
          {current.caption ? (
            <span className={cn('text-[8px] fiche:text-[9px]', packshot ? 'text-muted' : 'text-[#ddd]')}>
              {current.caption}
            </span>
          ) : null}
        </div>
      </div>

      {/* .thumbnails : quatre colonnes, 87 px, intitulé incrusté en bas. */}
      {items.length > 1 ? (
        <div
          role="tablist"
          aria-label="Visuels du produit"
          className={cn(
            'mt-[9px] grid gap-2 fiche:mt-3 fiche:gap-2.5',
            // La référence en aligne quatre ; on suit le nombre réel de vues
            // plutôt que de laisser une case vide.
            items.length >= 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
          )}
        >
          {items.map((item, itemIndex) => {
            const active = itemIndex === index
            return (
              <button
                key={`${item.url}-${itemIndex}`}
                id={`galerie-vignette-${itemIndex}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onKeyDown={onThumbKeyDown}
                onClick={() => setIndex(itemIndex)}
                className={cn(
                  'relative block h-[70px] overflow-hidden rounded-[7px] bg-[#f5f5f2] transition-colors fiche:h-[87px]',
                  active
                    ? 'border-[1.7px] border-brand'
                    : 'border border-line hover:border-line-strong',
                )}
              >
                <Image
                  src={item.url}
                  alt=""
                  fill
                  sizes="160px"
                  className={cn(
                    'object-cover',
                    estPackshot(item.role) ? 'mix-blend-multiply' : 'brightness-[0.8]',
                  )}
                />
                <span className="absolute inset-x-0 bottom-0 bg-white/92 p-[3px] text-center text-[8px] text-ink fiche:text-[9px]">
                  {item.thumbLabel}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* .gallery-note : une ligne centrée sous les vignettes. */}
      <p className="flex items-center justify-center gap-2 pt-3 text-[9px] text-[#71736d] fiche:pt-[17px] fiche:text-[11px]">
        <IconZoom className="size-[13px] shrink-0 text-brand fiche:size-[14px]" />
        La bonne teinte. Les bons accessoires. Un seul kit.
      </p>

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
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white text-slate-ink"
          >
            <IconClose className="size-6" />
          </button>
          <div className="relative h-full max-h-[85vh] w-full max-w-5xl">
            <Image src={current.url} alt={current.alt} fill sizes="90vw" className="object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
