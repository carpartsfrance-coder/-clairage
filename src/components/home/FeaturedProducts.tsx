import Image from 'next/image'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/Surface'
import { IconArrowRight } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/identity'
import type { HomeProduct } from '@/lib/queries/home'

export type FeaturedProductsProps = {
  content: { eyebrow: string; title: string }
  products: HomeProduct[]
  /** Raccourcis vers les listings. Absent = pas de barre de filtres. */
  filters?: Array<{ label: string; href: string }>
  /** Raccourci aligné à droite du titre. */
  shortcut?: { label: string; href: string }
}

const HEADING_ID = 'accueil-produits-titre'

/**
 * Produits et packs mis en avant — `.essentials-section` du code de référence.
 *
 * Reprend les valeurs de `home.css` : visuel pleine largeur de 215 px (155 en
 * mobile), pavé d'informations en 17/15/13, titre à 14 px, descriptif à 9 px
 * sur deux lignes réservées, filet au-dessus du prix, prix à 19 px et bouton
 * rond de 32 px. Le projet affichait une vignette détourée en 4/3 et une carte
 * plus courte de 42 px.
 *
 * **Deux écarts assumés avec la référence.**
 *
 * 1. Les filtres sont des liens vers les vraies catégories, pas le tri en
 *    JavaScript de la démonstration : un filtre qui masque des cartes sans
 *    changer l'adresse ne se partage pas et ne se retrouve pas.
 * 2. Quand un produit existe en kit, la carte montre les deux prix. La
 *    référence n'en affiche qu'un ; ici le prix d'entrée est celui des
 *    ampoules seules, et l'annoncer seul sous une étiquette « kit » tromperait
 *    sur ce qui est livré.
 */
export function FeaturedProducts({ content, products, filters, shortcut }: FeaturedProductsProps) {
  return (
    <section aria-labelledby={HEADING_ID} className="bg-white">
      <div className="container-page py-[34px] lg:py-12">
        {/* .home-section-heading : titre à gauche, raccourci à droite. */}
        <div className="mb-5 block items-end justify-between gap-5 lg:mb-6 lg:flex">
          {/* L'étiquette de la section pointe sur ce conteneur, qui ne porte
              que le sur-titre et le titre. */}
          <div id={HEADING_ID} className="min-w-0">
            <p className="mb-2.5 text-[7px] font-bold tracking-[1.2px] text-brand uppercase lg:text-[8px] lg:tracking-[1.6px]">
              {content.eyebrow}
            </p>
            <h2 className="max-w-[340px] text-[25px] leading-[1.15] font-bold tracking-[-0.8px] text-slate-ink lg:max-w-none lg:text-[29px] lg:leading-[1.1] lg:tracking-[-1px]">
              {content.title}
            </h2>
          </div>

          {shortcut ? (
            <Link
              href={shortcut.href}
              className="mt-3.5 inline-flex min-h-11 items-center gap-2 text-[10px] font-bold whitespace-nowrap text-slate-ink hover:underline lg:mt-0 lg:min-h-0"
            >
              {shortcut.label}
              <span aria-hidden="true" className="text-[16px] leading-none">
                ↗
              </span>
            </Link>
          ) : null}
        </div>

        {/* .product-filters : pastilles arrondies vers les vraies catégories. */}
        {filters && filters.length > 0 ? (
          <nav aria-label="Filtrer par univers" className="mb-[17px] lg:mb-[23px]">
            <ul className="flex flex-wrap gap-[7px] lg:gap-[9px]">
              {filters.map((filter, index) => (
                <li key={filter.href}>
                  <Link
                    href={filter.href}
                    className={cn(
                      'inline-flex items-center rounded-full px-[11px] py-[6px] text-[9px] whitespace-nowrap transition-colors lg:px-[14px] lg:py-[7px] lg:text-[10px]',
                      index === 0
                        ? 'border border-[#282e23] bg-[#282e23] text-white'
                        : 'border border-[#e1e5d9] text-[#737d68] hover:border-[#282e23] hover:text-[#282e23]',
                    )}
                  >
                    {filter.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {products.length === 0 ? (
          <EmptyState
            title="Aucun produit publié pour le moment."
            action={{ label: 'Voir toutes les catégories', href: '/c' }}
          />
        ) : (
          <>
            {/* .home-products : 4 colonnes et 18 px d'écart (2 et 11 en mobile). */}
            <ul className="grid grid-cols-2 gap-[11px] lg:grid-cols-4 lg:gap-[18px]">
              {products.map((product) => (
                <li
                  key={product.slug}
                  className="min-w-0 overflow-hidden rounded-[9px] border border-[#e3e6dc] bg-white transition-colors hover:border-[#c6cbba]"
                >
                  <Link href={`/p/${product.slug}`} className="flex h-full flex-col">
                    {/* .home-product-image : 215 px, fond #f3f4ee. */}
                    <span className="relative block h-[155px] w-full shrink-0 overflow-hidden bg-[#f3f4ee] lg:h-[215px]">
                      {product.image ? (
                        /* alt vide : le nom du produit est déjà dans le lien. */
                        <Image
                          src={product.image.url}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 300px, 50vw"
                          className="object-cover"
                        />
                      ) : null}

                      {/* .product-tag : annonce l'existence d'un kit. Les deux
                          prix sont donnés plus bas, chacun avec son intitulé. */}
                      {product.hasKit ? (
                        <span className="absolute top-2.5 left-[9px] inline-flex rounded-[3px] border border-[#d4e3cd] bg-[#e4eee0] px-[5px] py-[3px] text-[5px] font-bold tracking-[0.3px] text-[#426039] uppercase lg:top-[13px] lg:left-[13px] lg:px-1.5 lg:py-1 lg:text-[6px] lg:tracking-[0.6px]">
                          Existe en kit
                        </span>
                      ) : null}
                    </span>

                    {/* .home-product-info : 17/15/13 (12/10 en mobile). */}
                    <span className="flex min-w-0 flex-1 flex-col px-2.5 py-3 lg:px-[15px] lg:pt-[17px] lg:pb-[13px]">
                      {product.categoryName ? (
                        <small className="block text-[6px] tracking-[0.6px] text-[#8c9481] uppercase lg:text-[7px] lg:tracking-[0.9px]">
                          {product.categoryName}
                        </small>
                      ) : null}

                      <span className="my-[7px] block text-[12px] leading-[1.35] font-bold tracking-[-0.2px] text-slate-ink lg:text-[14px] lg:leading-normal">
                        {product.name}
                      </span>

                      {product.tagline ? (
                        <span className="mb-3 block min-h-[37px] text-[8px] leading-[1.6] text-[#838c77] lg:mb-[18px] lg:min-h-[29px] lg:text-[9px]">
                          {product.tagline}
                        </span>
                      ) : null}

                      {/* .product-bottom : filet, prix à gauche, flèche à droite. */}
                      <span className="mt-auto flex items-center justify-between gap-2 border-t border-[#e8ebe0] pt-2.5 lg:pt-3">
                        <span className="min-w-0">
                          {product.kitPriceCents !== null ? (
                            <>
                              <small className="block text-[6px] tracking-[0.6px] text-[#8a947e] uppercase lg:text-[7px]">
                                Ampoules seules
                              </small>
                              <strong className="block text-[17px] leading-tight tracking-[-0.5px] text-slate-ink lg:text-[19px] lg:tracking-[-0.6px]">
                                {formatPrice(product.fromPriceCents)}
                              </strong>
                              <small className="mt-0.5 block text-[6px] text-[#8a947e] lg:text-[7px]">
                                Kit complet{' '}
                                <span className="font-bold text-slate-ink">
                                  {formatPrice(product.kitPriceCents)}
                                </span>
                              </small>
                            </>
                          ) : (
                            <>
                              {product.hasKit ? (
                                <small className="block text-[6px] tracking-[0.6px] text-[#8a947e] uppercase lg:text-[7px]">
                                  À partir de
                                </small>
                              ) : null}
                              <strong className="block text-[17px] leading-tight tracking-[-0.5px] text-slate-ink lg:text-[19px] lg:tracking-[-0.6px]">
                                {formatPrice(product.fromPriceCents)}
                              </strong>
                              <small className="mt-0.5 block text-[6px] text-[#8a947e] lg:text-[7px]">
                                TTC
                              </small>
                            </>
                          )}
                        </span>

                        <span
                          aria-hidden="true"
                          className="grid size-[27px] shrink-0 place-items-center rounded-full border border-[#dfe5d6] text-slate-ink lg:size-8"
                        >
                          <IconArrowRight className="size-[13px] lg:size-[15px]" />
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/*
              .section-fineprint — la référence y écrit que les prix sont
              illustratifs. Ici les prix viennent du catalogue : la mention ne
              porte donc que sur ce qui reste à vérifier, la compatibilité.
            */}
            <p className="mt-3 text-[8px] leading-[1.7] text-[#999b92]">
              La compatibilité et l'homologation dépendent du véhicule et de son équipement
              d'origine : elles sont à confirmer sur la fiche produit avant commande.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
