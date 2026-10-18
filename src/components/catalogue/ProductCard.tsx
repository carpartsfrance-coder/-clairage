import Image from 'next/image'
import Link from 'next/link'
import type { ProductListItem } from '@/lib/queries/catalogue'
import { formatPrice } from '@/lib/identity'
import { availabilityLabel } from '@/lib/stock'
import { cn } from '@/lib/cn'
import { Badge, FitmentBadge } from '@/components/ui/Badge'
import { IconArrowRight } from '@/components/ui/icons'

/**
 * Carte produit partagée par les listes, la recherche et les résultats
 * véhicule.
 *
 * Le statut de compatibilité n'apparaît que si un véhicule est sélectionné.
 * Sans véhicule, aucun badge : ne rien dire vaut mieux que laisser croire que
 * la question a été tranchée.
 *
 * **Les prix.** La carte portait la pastille « Le kit complet » au-dessus du
 * prix du conditionnement le moins cher : les deux informations étaient
 * exactes séparément, mais ensemble elles annonçaient un kit à 69,90 € alors
 * qu'il en coûte 99,90 €. Quand un kit existe et coûte davantage, les deux
 * lignes sont donc affichées, chacune avec son intitulé. Les montants viennent
 * du catalogue, jamais du composant.
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const multiplePackagings = product.variantCount > 1
  const unavailable = product.availability.state === 'OUT_OF_STOCK'
  const incompatible = product.fitment === 'INCOMPATIBLE'

  return (
    <li className="h-full">
      <Link
        href={`/p/${product.slug}`}
        className={cn(
          'group flex h-full flex-col rounded-md border border-line bg-white transition-colors hover:border-line-strong',
          incompatible && 'opacity-75',
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-md bg-white p-4">
          {product.image ? (
            <Image
              src={product.image.url}
              alt=""
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-contain p-4"
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-sm bg-surface-muted text-sm text-muted">
              {product.name}
            </div>
          )}

          {/* La pastille annonce l'existence d'un kit, pas le prix affiché
              dessous : les deux prix sont donnés côte à côte dans la carte. */}
          {product.hasKit ? (
            <Badge tone="dark" className="absolute left-3 top-3">
              Existe en kit complet
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 border-t border-line p-4">
          {product.fitment ? <FitmentBadge status={product.fitment} short className="w-fit" /> : null}

          <p className="font-bold leading-snug">{product.name}</p>

          {product.tagline ? (
            <p className="line-clamp-2 text-sm text-muted">{product.tagline}</p>
          ) : null}

          {product.bulbBase || product.colorTemperature ? (
            <p className="text-xs text-muted">
              {[product.bulbBase, product.colorTemperature ? `${product.colorTemperature} K` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}

          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <div>
              {product.kitPriceCents !== null ? (
                /* Deux conditionnements, deux prix nommés : aucun des deux ne
                   peut être pris pour l'autre. */
                <>
                  <p className="text-xs text-muted">Ampoules seules</p>
                  <p className="text-[1.05rem] font-bold">
                    {formatPrice(product.fromPriceCents)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-strong">
                    Kit complet{' '}
                    <span className="font-semibold text-slate-ink">
                      {formatPrice(product.kitPriceCents)}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  {multiplePackagings ? (
                    <p className="text-xs text-muted">À partir de</p>
                  ) : null}
                  <p className="text-[1.05rem] font-bold">
                    {formatPrice(product.fromPriceCents)}
                  </p>
                </>
              )}
              <p
                className={cn(
                  'text-xs',
                  unavailable ? 'text-muted' : 'text-ok',
                )}
              >
                {availabilityLabel(product.availability)}
              </p>
            </div>

            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong transition-colors group-hover:border-slate-ink"
            >
              <IconArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}
