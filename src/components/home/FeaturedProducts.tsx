import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState, SectionHeading } from '@/components/ui/Surface'
import { IconArrowRight } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/identity'
import type { HomeProduct } from '@/lib/queries/home'

export type FeaturedProductsProps = {
  content: { eyebrow: string; title: string }
  products: HomeProduct[]
  /** Raccourcis vers les listings. Absent = pas de barre de filtres. */
  filters?: Array<{ label: string; href: string }>
}

const HEADING_ID = 'accueil-produits-titre'

/**
 * Produits et packs mis en avant.
 *
 * Le prix est celui du conditionnement le moins cher. Quand le produit propose
 * un kit complet, il existe donc au moins deux conditionnements : on écrit
 * « À partir de » pour ne pas laisser croire à un prix unique.
 */
export function FeaturedProducts({ content, products, filters }: FeaturedProductsProps) {
  return (
    <section aria-labelledby={HEADING_ID} className="bg-surface-soft py-14">
      <div className="container-page">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
          {/* SectionHeading n'expose pas d'id : l'étiquette de la section pointe
              sur ce conteneur, qui ne contient que le sur-titre et le titre. */}
          <div id={HEADING_ID} className="min-w-0">
            <SectionHeading eyebrow={content.eyebrow} title={content.title} />
          </div>

          {filters && filters.length > 0 ? (
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
              <ul className="flex items-center gap-2 md:flex-wrap md:justify-end">
                {filters.map((filter, index) => (
                  <li key={filter.href}>
                    <Link
                      href={filter.href}
                      className={cn(
                        'inline-flex h-9 shrink-0 items-center rounded-sm px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                        index === 0
                          ? 'bg-brand text-white hover:bg-brand-dark'
                          : 'border border-line-strong bg-white text-slate-ink hover:border-slate-ink',
                      )}
                    >
                      {filter.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {products.length === 0 ? (
          <EmptyState
            className="mt-8"
            title="Aucun produit publié pour le moment."
            action={{ label: 'Voir toutes les catégories', href: '/c' }}
          />
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 min-[23rem]:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <Card as="li" key={product.slug} interactive className="min-w-0">
                <Link
                  href={`/p/${product.slug}`}
                  className="flex h-full flex-col gap-3 rounded-md p-3"
                >
                  <div className="relative aspect-[4/3] shrink-0 rounded-sm bg-white">
                    {product.image ? (
                      <div className="absolute inset-3 sm:inset-4">
                        {/* alt vide : le nom du produit est déjà dans le texte du lien. */}
                        <Image
                          src={product.image.url}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 22vw, (min-width: 368px) 45vw, 90vw"
                          className="object-contain"
                        />
                      </div>
                    ) : null}

                    {/* Annonce l'existence d'un kit ; les deux prix sont donnés
                        plus bas, chacun avec son intitulé. */}
                    {product.hasKit ? (
                      <Badge tone="dark" className="absolute top-2 left-2 uppercase">
                        Existe en kit
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col px-1 pb-1">
                    <p className="text-[0.95rem] leading-snug font-bold text-slate-ink">
                      {product.name}
                    </p>
                    {product.tagline ? (
                      <p className="mt-1 truncate text-sm text-muted">{product.tagline}</p>
                    ) : null}

                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <p className="min-w-0">
                        {product.kitPriceCents !== null ? (
                          <>
                            <span className="block text-xs text-muted">Ampoules seules</span>
                            <span className="block text-[1.05rem] font-bold text-slate-ink">
                              {formatPrice(product.fromPriceCents)}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-strong">
                              Kit complet{' '}
                              <span className="font-semibold text-slate-ink">
                                {formatPrice(product.kitPriceCents)}
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            {product.hasKit ? (
                              <span className="block text-xs text-muted">À partir de</span>
                            ) : null}
                            <span className="block text-[1.05rem] font-bold text-slate-ink">
                              {formatPrice(product.fromPriceCents)}
                            </span>
                          </>
                        )}
                      </p>
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-slate-ink"
                      >
                        <IconArrowRight className="size-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
