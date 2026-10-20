'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { NavSection } from '@/lib/queries/navigation'
import { IconChevronDown } from '@/components/ui/icons'
import { BrandGrid } from './BrandGrid'
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
  const piste = useRef<HTMLUListElement>(null)
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Ce qui reste hors écran de chaque côté de la piste, pour les dégradés. */
  const [debord, setDebord] = useState({ gauche: false, droite: false })

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

  /*
    Dégradés d'extrémité : ils ne s'affichent que s'il reste vraiment quelque
    chose à atteindre. Une barre qui tient en entier ne doit pas suggérer le
    contraire, et une barre qui déborde ne doit pas laisser croire qu'elle est
    complète — c'est tout ce que ces deux booléens décident.
  */
  useEffect(() => {
    const element = piste.current
    if (!element) return

    const mesurer = () => {
      const reste = element.scrollWidth - element.clientWidth - element.scrollLeft
      setDebord({ gauche: element.scrollLeft > 1, droite: reste > 1 })
    }

    mesurer()
    element.addEventListener('scroll', mesurer, { passive: true })
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(element)
    return () => {
      element.removeEventListener('scroll', mesurer)
      observateur.disconnect()
    }
  }, [sections])

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
    /*
      `min-w-0` : sans lui, la barre impose sa largeur naturelle à l'en-tête.
      Douze rubriques en `nowrap` font 1 579 px pour un conteneur de 1 280, et
      c'est la PAGE entière qui se mettait à défiler latéralement — à 1 366 px,
      le document mesurait 1 767 px de large. Le débordement est désormais
      contenu dans la piste ci-dessous : la page ne bouge plus.

      Le défilement ne remplace pas une barre qui tiendrait d'elle-même. Le
      nombre de rubriques est une donnée, pas du code : elles viennent des
      catégories racines publiées, et se règlent en back-office.
    */
    <div ref={conteneur} className="relative min-w-0 flex-1">
      {/*
        Les dégradés sont posés sur le conteneur, pas sur la piste : dans la
        piste ils défileraient avec elle. `pointer-events-none` pour qu'ils
        n'avalent pas le clic sur la première ou la dernière rubrique.
      */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent transition-opacity',
          debord.gauche ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent transition-opacity',
          debord.droite ? 'opacity-100' : 'opacity-0',
        )}
      />

      <ul ref={piste} className="no-scrollbar flex items-center overflow-x-auto">
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
            /*
              Largeur fixée, et non `w-full`. La barre de rubriques déborde la
              largeur du conteneur — dix libellés en `nowrap` font 1 578 px là
              où la page en fait 1 232 : un panneau en `w-full` héritait de ce
              débordement, et sa dernière colonne de marques tombait hors de
              la fenêtre. On reprend donc la largeur de la page, plafonnée à
              celle de la fenêtre.

              `max-h` + défilement : vingt-quatre marques tiennent en trois
              rangées au-delà de 1 280 px, en quatre en dessous. Sans plafond,
              la dernière rangée passerait sous le bord de la fenêtre sur les
              écrans courts, et le lien « Voir les 47 marques » avec elle.
            */
            className="absolute top-full left-0 z-30 mt-px max-h-[78vh] w-[min(1232px,calc(100vw-3rem))] overflow-y-auto overscroll-contain rounded-b-lg border border-t-0 border-line bg-white p-5 shadow-pop"
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

                  {colonne.variant === 'marques' ? (
                    /*
                      Six colonnes dès 1024 px, huit au-delà de 1280 : la
                      pastille fait 60 px, le nom tient sous elle, et les
                      vingt-quatre marques s'affichent dans une hauteur
                      comparable à celle que dix lignes occupaient.
                    */
                    <BrandGrid
                      entries={colonne.links}
                      className="grid-cols-6 gap-1 xl:grid-cols-8"
                      onNavigate={() => setOuverte(null)}
                    />
                  ) : (
                    <ul className="flex flex-col">
                      {colonne.links.map((lien) => (
                        <li key={lien.href}>
                          <Link
                            href={lien.href}
                            onClick={() => setOuverte(null)}
                            className="flex min-h-9 items-center justify-between gap-3 rounded-xs py-1 text-[11px] hover:text-brand"
                          >
                            <span className="min-w-0 truncate font-medium">{lien.label}</span>
                            <span className="shrink-0 text-[9px] text-[#a4a49d]">
                              {lien.hint ?? lien.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

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
