import Link from 'next/link'
import { BrandMark } from '@/components/packs/BrandMark'
import { cn } from '@/lib/cn'

export type BrandGridEntry = {
  label: string
  href: string
  /** Ce qui s'écrit sous le nom : « 38 modèles ». */
  hint?: string
  logo?: { url: string; alt: string } | null
}

/**
 * Grille des marques d'un parcours véhicule.
 *
 * **Une marque se reconnaît, elle ne se lit pas.** Le menu alignait les
 * marques comme il alignait les familles et les culots : un libellé par
 * ligne, précédé d'une pastille de 28 px. Dix marques occupaient toute la
 * hauteur du panneau, et le logo — la seule chose que l'œil cherche quand il
 * cherche sa marque — y était trop petit pour être identifié avant le texte.
 * En grille, la même hauteur en loge vingt-quatre, chacune avec un carré de
 * 60 px.
 *
 * Le nombre de colonnes n'a pas de valeur par défaut : il est passé par
 * l'appelant, parce qu'un panneau d'en-tête, un tiroir mobile et une page
 * n'ont pas la même largeur, et que `cn` concatène sans arbitrer les conflits
 * — deux `grid-cols-*` dans la même classe laisseraient l'ordre du CSS
 * décider.
 *
 * `onNavigate` ferme le panneau qui contient la grille ; la page des marques,
 * elle, n'a rien à fermer.
 */
export function BrandGrid({
  entries,
  className,
  tone = 'menu',
  onNavigate,
}: {
  entries: BrandGridEntry[]
  /**
   * Classes de la grille : nombre de colonnes ET écart compris.
   *
   * Rien n'est posé par défaut, parce que `cn` concatène sans arbitrer les
   * conflits — un `grid-cols-*` ou un `gap-*` par défaut laisserait l'ordre
   * du CSS décider lequel l'emporte, et non l'appelant. Les points de rupture
   * sont ceux de Tailwind (`sm:`, `md:`, `xl:`) : les seuils maison (`fiche:`)
   * et les `min-[…]` ne s'ordonnent pas par largeur avec eux.
   */
  className: string
  /**
   * `menu` : fond transparent, le cadre n'apparaît qu'au survol — un panneau
   * déroulant n'a pas à ressembler à une grille de cartes.
   * `page` : cadre permanent, parce que la grille EST le contenu de la page.
   */
  tone?: 'menu' | 'page'
  onNavigate?: () => void
}) {
  return (
    <ul className={cn('grid', className)}>
      {entries.map((entry) => (
        <li key={entry.href}>
          <Link
            href={entry.href}
            onClick={onNavigate}
            /*
              L'infobulle remplace le nom écrit pour les logos que personne ne
              reconnaît du premier coup. Elle ne remplace rien pour les
              lecteurs d'écran : c'est le libellé masqué ci-dessous qui donne
              son nom au lien.
            */
            title={entry.logo ? entry.label : undefined}
            className={cn(
              'flex h-full flex-col items-center justify-center gap-2 rounded-lg border px-1.5 py-3 text-center transition-colors',
              tone === 'page'
                ? 'border-[#e3e6dc] bg-white hover:border-slate-ink'
                : 'border-transparent hover:border-[#e3e6dc] hover:bg-surface-paper',
            )}
          >
            <BrandMark name={entry.label} logo={entry.logo ?? null} size="lg" />

            {/*
              Le nom n'est écrit que s'il n'est pas déjà dessiné.

              La plupart des logos constructeurs SONT le nom — Citroën, Fiat,
              Jeep, Land Rover, Iveco. Le réécrire sous la pastille le faisait
              lire deux fois, en deux graisses différentes, et donnait à la
              grille un air de formulaire. Sans logo, en revanche, la pastille
              ne porte que deux lettres : le nom devient alors la seule chose
              qui identifie la marque, et il s'affiche.

              `min-w-0` sur l'élément lui-même : sans lui, un nom long
              (« Harley-Davidson », « Indian Motorcycle ») élargit la cellule
              au lieu d'être tronqué, et toute la grille se décale.
            */}
            <span
              className={
                entry.logo
                  ? 'sr-only'
                  : 'w-full min-w-0 truncate text-[11px] leading-tight font-semibold'
              }
            >
              {entry.label}
            </span>

            {entry.hint ? (
              <span className="text-[9px] text-[#8c9481]">{entry.hint}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}
