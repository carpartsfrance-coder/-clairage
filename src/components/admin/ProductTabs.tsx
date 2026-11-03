import Link from 'next/link'
import { cn } from '@/lib/cn'
import { ONGLETS, ONGLET_LABELS, type OngletValue } from '@/lib/admin/onglets-produit'

/**
 * La barre d'onglets de la fiche produit.
 *
 * Ce sont des liens, pas des boutons : l'onglet vit dans l'adresse. Le relevé
 * des manques peut donc pointer dessus, une fiche à moitié remplie se partage
 * telle quelle, et le bouton « précédent » du navigateur fait ce qu'on attend
 * de lui. Rien ici n'a besoin de JavaScript.
 *
 * Deux marques sur chaque onglet, et elles ne disent pas la même chose :
 *
 * - **Le compteur** dit ce qu'il y a dedans — quatre visuels, deux
 *   conditionnements. Il manque quand il n'y a rien à compter (la fiche, le
 *   référencement).
 * - **La pastille** dit qu'il y manque quelque chose. Sans elle, découper
 *   l'écran en six cacherait les trous au lieu de les montrer, et le relevé
 *   des manques existe précisément pour qu'on cesse de les découvrir après la
 *   publication.
 */
export function ProductTabs({
  productId,
  actif,
  compteurs,
  marques,
}: {
  productId: string
  actif: OngletValue
  /** Ce que chaque onglet contient, quand ça se compte. */
  compteurs: Partial<Record<OngletValue, number>>
  /** Les onglets qui portent au moins un manque. */
  marques: ReadonlySet<OngletValue>
}) {
  return (
    <nav aria-label="Sections de la fiche" className="mt-5 border-b border-line">
      {/* Le défilement horizontal est la seule mise en page qui tienne six
          onglets sous 640 px sans les empiler sur trois lignes. */}
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ONGLETS.map((onglet) => {
          const courant = onglet === actif
          const compteur = compteurs[onglet]
          const marque = marques.has(onglet)

          return (
            <li key={onglet} className="shrink-0">
              <Link
                href={`/admin/catalogue/${productId}?onglet=${onglet}`}
                aria-current={courant ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
                  courant
                    ? 'border-brand font-bold text-slate-ink'
                    : 'border-transparent font-medium text-muted-strong hover:text-slate-ink',
                )}
              >
                {ONGLET_LABELS[onglet]}
                {compteur === undefined ? null : (
                  <span className="rounded-full bg-surface-soft px-1.5 text-xs font-semibold tabular-nums text-muted-strong">
                    {compteur}
                  </span>
                )}
                {marque ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-warn"
                    /* Le titre porte le sens : une pastille de couleur seule
                       ne dit rien à qui ne la distingue pas. */
                    title="Point à compléter"
                    aria-label="Point à compléter"
                    role="img"
                  />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
