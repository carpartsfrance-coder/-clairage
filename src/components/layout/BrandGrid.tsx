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
            className={cn(
              'flex h-full flex-col items-center justify-center gap-2 rounded-lg border px-1.5 py-3 text-center transition-colors',
              tone === 'page'
                ? 'border-[#e1e1e1] bg-white hover:border-slate-ink'
                : 'border-transparent hover:border-[#e1e1e1] hover:bg-surface-paper',
            )}
          >
            <BrandMark name={entry.label} logo={entry.logo ?? null} size="lg" />

            {/*
              Le nom est toujours écrit.

              Il était masqué sous les logos, au motif que la plupart SONT le
              nom (Citroën, Fiat, Jeep…). Mais sur téléphone, à cette taille,
              une partie des logos ne se reconnaît plus — et un logo ne doit
              pas être le seul moyen d'identifier une marque (audit du
              16 novembre 2026). Sous un logo, le nom passe en gris et en
              graisse normale : il confirme sans répéter avec la même voix.
              Sans logo, il garde sa graisse : c'est lui qui identifie.

              `min-w-0` sur l'élément lui-même : sans lui, un nom long
              (« Harley-Davidson », « Indian Motorcycle ») élargit la cellule
              au lieu d'être tronqué, et toute la grille se décale.
            */}
            <span
              className={cn(
                // Deux lignes plutôt qu'une coupure : « Harley-Davidson » se
                // lisait « Harley-Davi… » sur petit écran.
                'line-clamp-2 w-full min-w-0 text-[11px] leading-tight break-words',
                entry.logo ? 'text-muted-strong' : 'font-semibold',
              )}
            >
              {entry.label}
            </span>

            {entry.hint ? (
              <span className="text-[9px] text-[#8b8b8b]">{entry.hint}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}
