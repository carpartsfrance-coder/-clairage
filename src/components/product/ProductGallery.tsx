'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { GalleryItem } from '@/lib/queries/product'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconHeadset, IconInfo, IconPack, IconZoom } from '@/components/ui/icons'
import { useProductConfiguration } from './ProductConfiguration'

/**
 * Galerie de la fiche produit — `.gallery` de la maquette V2.
 *
 * Valeurs reprises : visuel de 435 px (480 au-delà de 1 450, 380 sous 1 100,
 * 290 sous 800, 265 sous 370), rayon 12 px sur fond #f3f4ef, pastille de vue
 * en haut à gauche, bouton d'agrandissement de 32 px, légende en bas, puis
 * trois vignettes de 77 px à intitulé incrusté.
 *
 * **Le visuel est contenu, pas recadré.** La V1 l'affichait en `cover` : un
 * packshot carré dans un cadre large perdait ses extrémités — les culots des
 * ampoules, précisément ce que le client cherche à reconnaître. La V2 le pose
 * en `contain` avec une marge, et le cadre ne ment plus sur la forme du
 * produit.
 *
 * **Le fondu multiplié n'est pas décoratif** : il détoure un packshot sur fond
 * blanc en le multipliant sur le panneau clair. Une photographie en situation y
 * deviendrait illisible, donc le mode suit le rôle du visuel.
 *
 * **La mention des visuels illustratifs vient de la base, pas d'une constante.**
 * Le schéma dit d'une illustration ou d'un rendu simulé qu'il « doit être
 * signalé au client » (`MediaNature`) : la ligne apparaît quand le visuel
 * affiché est de cette nature, et seulement là. La maquette l'écrit en dur
 * parce que tous ses visuels en sont.
 *
 * Les vignettes restent un groupe d'onglets : flèches gauche/droite pour
 * circuler, Entrée pour choisir.
 */

/** Vrai pour un packshot sur fond clair, qui supporte le fondu multiplié. */
function estPackshot(role: GalleryItem['role']) {
  return role === 'PRODUCT' || role === 'KIT_CONTENT'
}

/** Autant de colonnes que de vignettes, jusqu'à quatre. */
const COLONNES: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

/** Vue « Dans le pack » : la composition, à la place du visuel. */
const VUE_PACK: 'pack' = 'pack'

/** Ce qu'affiche le grand cadre : un visuel par son rang, ou la composition. */
type Vue = number | typeof VUE_PACK

export function ProductGallery({
  items,
  productName,
}: {
  items: GalleryItem[]
  productName: string
}) {
  const [vue, setVue] = useState<Vue>(0)
  const [zoomed, setZoomed] = useState(false)
  const configuration = useProductConfiguration()

  /*
    La vue « Dans le pack » n'existe que s'il y a un pack : un produit simple
    n'a pas de composition à prévisualiser, et un onglet vide serait une
    promesse en l'air. Elle suit le conditionnement choisi, comme le reste de
    la fiche.
  */
  const composition = (configuration?.selected?.components ?? []).filter(
    (composant) => composant.required,
  )
  const avecPack = composition.length > 0

  if (items.length === 0) {
    return (
      <div className="grid h-[290px] place-items-center rounded-[9px] border border-line bg-surface-muted text-sm text-muted fiche:h-[380px] fiche:rounded-xl min-[1101px]:h-[435px] min-[1450px]:h-[480px]">
        Aucun visuel disponible
      </div>
    )
  }

  const index = vue === VUE_PACK ? 0 : Math.min(vue, items.length - 1)
  const current = items[index]
  const packshot = estPackshot(current.role)
  const packAffiche = vue === VUE_PACK && avecPack

  /** Onglets : les visuels, puis la composition quand il y en a une. */
  const onglets: Array<{ cle: string; libelle: string; vue: Vue }> = [
    ...items.map((item, itemIndex) => ({
      cle: `${item.url}-${itemIndex}`,
      libelle: item.thumbLabel,
      vue: itemIndex,
    })),
    ...(avecPack ? [{ cle: VUE_PACK, libelle: 'Dans le pack', vue: VUE_PACK }] : []),
  ]

  function surTouche(event: React.KeyboardEvent, position: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const suivant =
      event.key === 'ArrowRight'
        ? (position + 1) % onglets.length
        : (position - 1 + onglets.length) % onglets.length
    setVue(onglets[suivant].vue)
    document.getElementById(`galerie-vignette-${suivant}`)?.focus()
  }

  return (
    /* .gallery : collée sous l'en-tête, et seulement face au bloc d'achat.
       Sous 800 px la maquette la remet dans le flux (`position:static`). */
    <div className="fiche:sticky fiche:top-[150px]">
      {/* .main-visual */}
      <div className="relative h-[290px] overflow-hidden rounded-[9px] bg-[#f3f4ef] max-[370px]:h-[265px] fiche:h-[380px] fiche:rounded-xl min-[1101px]:h-[435px] min-[1450px]:h-[480px]">
        {packAffiche ? (
          /* .gallery-pack — la composition, dans le cadre du visuel. */
          <div className="flex h-full flex-col justify-center bg-[linear-gradient(120deg,#eff2e7,#f8f9f5)] px-6 py-[22px] fiche:px-[35px] fiche:pt-12 fiche:pb-[25px]">
            <span className="mb-[14px] grid size-[45px] place-items-center rounded-xl border border-[#e2e8d9] bg-white text-[#788a66]">
              <IconPack className="size-[19px]" />
            </span>
            <h3 className="mb-[13px] text-[22px] leading-[1.15] tracking-[-0.8px] fiche:mb-6 fiche:text-[26px] fiche:leading-[1.2]">
              Tout votre montage,
              <br />
              dans un seul pack.
            </h3>
            <ul>
              {composition.map((composant, rang) => (
                <li
                  key={composant.sku}
                  className="flex items-center gap-[11px] border-b border-[#dde5d4] py-2 text-[10px] fiche:gap-[14px] fiche:py-[10px] fiche:text-[12px]"
                >
                  <span className="text-[9px] text-[#849975]">
                    {String(rang + 1).padStart(2, '0')}
                  </span>
                  <strong>
                    {composant.quantity > 1 ? `${composant.quantity} ` : ''}
                    {composant.productName}
                  </strong>
                  <IconCheck className="ml-auto size-[15px] shrink-0 text-ok" />
                </li>
              ))}
            </ul>
            <small className="mt-[9px] text-[7px] text-[#89967d] fiche:mt-[13px] fiche:text-[8px]">
              Composition du conditionnement retenu, détaillée plus bas.
            </small>
          </div>
        ) : (
          <>
            <Image
              key={current.url}
              src={current.url}
              alt={current.alt}
              fill
              priority
              sizes="(min-width: 801px) 50vw, 100vw"
              className={cn(
                'object-contain p-[8px_5px_18px] fiche:p-[16px_12px_26px]',
                packshot && 'mix-blend-multiply',
              )}
            />

            {/* .visual-label : l'intitulé de la vue qu'on regarde. */}
            <span className="absolute top-[13px] left-[14px] z-[2] rounded-3xl border border-[#e5e8df] bg-white/80 px-2 py-1 text-[7px] font-bold tracking-[1px] text-[#626b57] uppercase fiche:top-[17px] fiche:left-[18px] fiche:px-[9px] fiche:py-[5px] fiche:text-[8px]">
              {current.thumbLabel}
            </span>

            {/* .visual-corner : la légende enregistrée du visuel. */}
            {current.caption ? (
              <span className="absolute bottom-[14px] left-[15px] z-[2] max-w-[75%] text-[6.5px] tracking-[0.8px] text-[#75816b] uppercase fiche:bottom-[19px] fiche:left-5 fiche:text-[8px] fiche:tracking-[1.05px]">
                {current.caption}
              </span>
            ) : null}

            {/* .zoom-button */}
            <button
              type="button"
              onClick={() => setZoomed(true)}
              aria-label="Agrandir le visuel"
              className="absolute top-4 right-[17px] z-[2] grid size-8 place-items-center rounded-full bg-white shadow-soft"
            >
              <IconZoom className="size-[14px] fiche:size-4" />
            </button>
          </>
        )}
      </div>

      {/* .gallery-tabs : trois colonnes, intitulé incrusté en bas. */}
      {onglets.length > 1 ? (
        <div
          role="tablist"
          aria-label="Vues du produit"
          className={cn(
            'mt-2 grid gap-2 fiche:mt-[10px] fiche:gap-[10px]',
            /*
              La maquette en aligne trois. On suit le nombre réel de vues,
              parce qu'une quatrième — la composition — passerait sinon à la
              ligne et laisserait deux cases vides à côté d'elle.
            */
            COLONNES[Math.min(onglets.length, 4)] ?? 'grid-cols-3',
          )}
        >
          {onglets.map((onglet, position) => {
            const actif = onglet.vue === vue
            const visuel = onglet.vue === VUE_PACK ? null : items[onglet.vue as number]
            return (
              <button
                key={onglet.cle}
                id={`galerie-vignette-${position}`}
                type="button"
                role="tab"
                aria-selected={actif}
                tabIndex={actif ? 0 : -1}
                onKeyDown={(event) => surTouche(event, position)}
                onClick={() => setVue(onglet.vue)}
                className={cn(
                  'relative grid h-16 place-items-center overflow-hidden rounded-[5px] bg-[#f3f4ef] transition-colors fiche:h-[77px] fiche:rounded-md min-[1450px]:h-[84px]',
                  actif ? 'border-[1.7px] border-brand' : 'border border-[#e3e7db] hover:border-line-strong',
                )}
              >
                {visuel ? (
                  <Image
                    src={visuel.url}
                    alt=""
                    fill
                    sizes="160px"
                    className={cn(
                      'object-cover',
                      estPackshot(visuel.role) ? 'mix-blend-multiply' : 'brightness-[0.85]',
                    )}
                  />
                ) : (
                  <IconPack className="size-6 text-[#788a66]" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-white/95 p-[2px] text-center text-[8px] text-ink fiche:p-[3px_4px] fiche:text-[9px]">
                  {onglet.libelle}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/*
        .visual-note — uniquement si le visuel affiché est une illustration ou
        un rendu simulé. Le dire d'une photographie du produit réel serait
        s'excuser d'une vraie photo.
      */}
      {!packAffiche && (current.nature === 'ILLUSTRATION' || current.nature === 'DIAGRAM') ? (
        <p className="mt-[9px] flex items-center justify-center gap-[5px] text-center text-[8px] leading-[1.5] text-[#92998a] fiche:mt-3 fiche:gap-[6px] fiche:text-[9px]">
          <IconInfo className="size-[11px] shrink-0 fiche:size-3" />
          {current.nature === 'DIAGRAM'
            ? 'Schéma de principe — il situe le montage, il ne le représente pas.'
            : 'Visuel d’illustration — il ne montre pas un montage réalisé.'}
        </p>
      ) : null}

      {/* .gallery-promise — masquée sous 800 px par la maquette. */}
      <div className="mt-[21px] hidden items-center gap-[13px] border-t border-line pt-[23px] text-[11px] text-[#737b6b] fiche:flex">
        <IconHeadset className="size-[25px] shrink-0 text-[#667b57]" strokeWidth={1.5} />
        <span>
          Un doute sur votre montage ?
          <br />
          <Link
            href="/contact"
            className="mt-[2px] inline-block text-[11px] font-bold text-[#3f5035] underline-offset-[3px] hover:underline"
          >
            On vous accompagne, avant et après.<span className="ml-[7px]">↗</span>
          </Link>
        </span>
      </div>

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
