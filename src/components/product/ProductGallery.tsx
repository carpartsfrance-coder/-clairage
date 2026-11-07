'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { GalleryItem } from '@/lib/queries/product'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconInfo, IconPack, IconZoom } from '@/components/ui/icons'
import { useProductConfiguration } from './ProductConfiguration'

/**
 * Galerie de la fiche produit — `.gallery` de la maquette V2.
 *
 * Valeurs reprises : visuel de 435 px (480 au-delà de 1 450, 380 sous 1 100,
 * 290 sous 800, 265 sous 370), rayon 12 px sur fond #f2f2f2, pastille de vue
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

  /*
    Le visuel suit le conditionnement retenu.

    Choisir « les ampoules seules » pendant que la galerie continue de montrer
    le kit complet et ses accessoires, c'est donner à voir autre chose que ce
    qu'on s'apprête à acheter. Au changement, on présente donc la vue qui
    correspond : le contenu du pack pour un kit, le produit seul sinon.

    Seul un VRAI changement de conditionnement déclenche ce saut — pas le
    premier rendu, et pas un re-rendu quelconque. Sans cette garde, la galerie
    reviendrait sur sa vue par défaut dès que le client a choisi une autre
    vignette, ce qui reprendrait son geste.
  */
  const conditionnementVu = useRef<string | null>(null)
  useEffect(() => {
    const id = configuration?.selectedId ?? null
    if (id === null) return
    const premier = conditionnementVu.current === null
    const change = conditionnementVu.current !== id
    conditionnementVu.current = id
    if (premier || !change) return

    /*
      Changer de conditionnement ramène au visuel qui le représente : le contenu
      du kit pour un kit, sinon le premier de la liste — celui que montre aussi
      la carte du catalogue. Viser le rôle « produit » renverrait au packshot
      alors que la fiche s'ouvre sur le rendu, et le client verrait l'image
      reculer d'un cran à chaque clic.
    */
    const estKit = (configuration?.selected?.components.length ?? 0) > 0
    const cible = estKit ? items.findIndex((item) => item.role === 'KIT_CONTENT') : 0
    if (cible >= 0) setVue(cible)
  }, [configuration?.selectedId, configuration?.selected, items])

  if (items.length === 0) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl border border-line bg-surface-muted text-sm text-muted">
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
    // Gauche/droite sur téléphone, haut/bas quand les vignettes sont en colonne.
    const avance = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const recule = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!avance && !recule) return
    event.preventDefault()
    const suivant =
      avance
        ? (position + 1) % onglets.length
        : (position - 1 + onglets.length) % onglets.length
    setVue(onglets[suivant].vue)
    document.getElementById(`galerie-vignette-${suivant}`)?.focus()
  }

  return (
    /*
      .gallery — refonte LEDVROOM : visuels carrés.

      Les photos du catalogue sont carrées (1:1). Le cadre large de la V2 les
      posait entre deux bandes grises ; le cadre est maintenant carré, comme
      elles. Sur grand écran, les vignettes passent en colonne à gauche : la
      photo reste grande sans allonger la page. Sur téléphone, elle prend toute
      la largeur et les vignettes se rangent dessous.

      Elle n'est plus collée au défilement : les promesses de la fiche se
      posent dessous, dans la même colonne, et une galerie collante viendrait
      les recouvrir.
    */
    <div>
      <div className="flex flex-col gap-2.5 fiche:flex-row-reverse fiche:items-start fiche:gap-3">
        {/* .main-visual */}
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#f2f2f2] fiche:min-w-0 fiche:flex-1 fiche:rounded-2xl">
          {packAffiche ? (
            /* .gallery-pack — la composition, dans le cadre du visuel. */
            <div className="flex h-full flex-col justify-center bg-[#f5f6f7] px-6 py-6 fiche:px-10 fiche:py-10">
              <span className="mb-4 grid size-11 place-items-center rounded-xl border border-[#e0e0e0] bg-white text-[#6b6d70]">
                <IconPack className="size-5" />
              </span>
              <h3 className="mb-4 text-[22px] leading-[1.15] font-bold tracking-[-0.6px] fiche:mb-6 fiche:text-[28px]">
                Tout votre montage,
                <br />
                dans un seul pack.
              </h3>
              <ul>
                {composition.map((composant, rang) => (
                  <li
                    key={composant.sku}
                    className="flex items-center gap-3 border-b border-[#dcdcdc] py-2.5 text-[14px] fiche:gap-4 fiche:py-3 fiche:text-[15px]"
                  >
                    <span className="text-[12px] text-[#6b6d70]">
                      {String(rang + 1).padStart(2, '0')}
                    </span>
                    <strong>
                      {composant.quantity > 1 ? `${composant.quantity} ` : ''}
                      {composant.productName}
                    </strong>
                    <IconCheck className="ml-auto size-4 shrink-0 text-ok" />
                  </li>
                ))}
              </ul>
              <small className="mt-3 text-[12px] text-[#6b6d70]">
                Composition du conditionnement retenu, détaillée plus bas.
              </small>
            </div>
          ) : (
            <>
              {/*
                Un packshot sur fond clair reste contenu, avec sa marge : ses
                extrémités sont ce que le client cherche à reconnaître. Une
                photographie ou un rendu remplit le cadre carré.
              */}
              <Image
                key={current.url}
                src={current.url}
                alt={current.alt}
                fill
                priority
                sizes="(min-width: 801px) 45vw, 100vw"
                className={cn(
                  packshot ? 'object-contain p-5 mix-blend-multiply fiche:p-8' : 'object-cover',
                )}
              />

              {/* .visual-label : l'intitulé de la vue qu'on regarde. */}
              <span className="absolute top-3 left-3 z-[2] rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-ink shadow-soft fiche:top-4 fiche:left-4">
                {current.thumbLabel}
              </span>

              {/* .visual-corner : la légende enregistrée du visuel. */}
              {current.caption ? (
                <span className="absolute bottom-3 left-3 z-[2] max-w-[75%] rounded-full bg-white/90 px-3 py-1 text-[11px] text-[#55585b] fiche:bottom-4 fiche:left-4">
                  {current.caption}
                </span>
              ) : null}

              {/* .zoom-button — 44 px, la taille d'un doigt. */}
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label="Agrandir le visuel"
                className="absolute top-2 right-2 z-[2] grid size-11 place-items-center rounded-full bg-white text-ink shadow-soft fiche:top-3 fiche:right-3"
              >
                <IconZoom className="size-5" />
              </button>
            </>
          )}
        </div>

        {/*
          .gallery-tabs — vignettes carrées, comme les visuels. L'intitulé
          n'est plus incrusté : il s'affiche sur la grande photo, et la
          vignette le porte en nom accessible.
        */}
        {onglets.length > 1 ? (
          <div
            role="tablist"
            aria-label="Vues du produit"
            className={cn(
              'grid gap-2',
              COLONNES[Math.min(onglets.length, 4)] ?? 'grid-cols-3',
              'fiche:flex fiche:w-[84px] fiche:shrink-0 fiche:flex-col fiche:gap-2.5',
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
                  aria-label={onglet.libelle}
                  title={onglet.libelle}
                  tabIndex={actif ? 0 : -1}
                  onKeyDown={(event) => surTouche(event, position)}
                  onClick={() => setVue(onglet.vue)}
                  className={cn(
                    'relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-[#f2f2f2] transition-colors fiche:size-[84px] fiche:rounded-xl',
                    actif ? 'border-2 border-brand' : 'border border-[#e1e1e1] hover:border-line-strong',
                  )}
                >
                  {visuel ? (
                    <Image
                      src={visuel.url}
                      alt=""
                      fill
                      sizes="96px"
                      className={cn(
                        estPackshot(visuel.role)
                          ? 'object-contain p-1.5 mix-blend-multiply'
                          : 'object-cover',
                      )}
                    />
                  ) : (
                    <IconPack className="size-6 text-[#6b6d70]" />
                  )}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {/*
        .visual-note — uniquement si le visuel affiché est une illustration ou
        un rendu simulé. Le dire d'une photographie du produit réel serait
        s'excuser d'une vraie photo.
      */}
      {!packAffiche && (current.nature === 'ILLUSTRATION' || current.nature === 'DIAGRAM') ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] leading-[1.5] text-[#6b6d70]">
          <IconInfo className="size-3.5 shrink-0" />
          {current.nature === 'DIAGRAM'
            ? 'Schéma de principe — il situe le montage, il ne le représente pas.'
            : 'Visuel d’illustration — il ne montre pas un montage réalisé.'}
        </p>
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
