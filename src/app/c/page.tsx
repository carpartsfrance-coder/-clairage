import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { EmptyState } from '@/components/ui/Surface'
import { IconArrowUpRight } from '@/components/ui/icons'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { getCategoryTree } from '@/lib/queries/catalogue'
import { getSelectedVehicle } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Toutes les catégories',
  description:
    'Les catégories d’éclairage LED auto et moto : phares, intérieur, plaque et recul, clignotants, xénon.',
  alternates: { canonical: '/c' },
}

/** Largeur réelle d’une vignette : ~420 px sur lg, puis 2 puis 1 colonne. */
const THUMB_SIZES = '(min-width: 1024px) 420px, (min-width: 768px) 46vw, 92vw'

/** Au-delà de quatre sous-catégories, on renvoie vers la catégorie parente. */
const MAX_VISIBLE_CHILDREN = 4

function productCountLabel(count: number) {
  return count > 1 ? `${count} produits` : `${count} produit`
}

export default async function CategoriesPage() {
  const [categories, vehicle] = await Promise.all([getCategoryTree(), getSelectedVehicle()])

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Catégories' }]} />

      <header className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.875rem] leading-[1.15] font-extrabold sm:text-[2.25rem]">
            Toutes les catégories
          </h1>
          <p className="max-w-2xl text-base text-muted-strong">
            Chaque catégorie regroupe les ampoules et les kits d&apos;un même usage. La
            compatibilité dépend du véhicule : indiquez le vôtre pour savoir ce qui lui correspond.
          </p>
        </div>

        <VehicleBar vehicle={vehicle} />
      </header>

      <section aria-labelledby="categories-list-heading" className="mt-8">
        <h2 id="categories-list-heading" className="sr-only">
          Liste des catégories
        </h2>

        {/*
          `getCategoryTree()` renvoie un tableau vide dans deux cas qu'on ne peut
          pas distinguer ici : rien n'est publié, ou la lecture a échoué. On
          décrit donc la liste vide, sans affirmer la cause.
        */}
        {categories.length === 0 ? (
          <EmptyState
            title="Aucune catégorie à afficher."
            description="La liste n'a pas pu être établie : soit rien n'est encore publié, soit le catalogue n'est pas joignable. L'accueil permet d'indiquer votre véhicule et de reprendre la navigation."
            action={{ label: "Revenir à l'accueil", href: '/' }}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const visibleChildren = category.children.slice(0, MAX_VISIBLE_CHILDREN)
              const hiddenChildren = category.children.length - visibleChildren.length

              return (
                <li key={category.slug} className="h-full">
                  {/*
                    La carte n'est pas un lien unique : les sous-catégories sont des liens
                    frères, sous le lien de la catégorie, jamais imbriqués dedans.
                  */}
                  <div className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-white transition-colors hover:border-line-strong">
                    <Link href={`/c/${category.slug}`} className="block">
                      <div className="relative aspect-[5/4] overflow-hidden bg-surface-muted">
                        {category.image ? (
                          <Image
                            src={category.image.url}
                            /* Décorative : le nom suit immédiatement, dans le même lien. */
                            alt=""
                            fill
                            sizes={THUMB_SIZES}
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center px-4 text-center text-sm text-muted">
                            {category.name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5 border-t border-line px-4 py-4">
                        <p className="flex items-start gap-1.5 text-lg font-bold text-slate-ink">
                          <span className="min-w-0">{category.name}</span>
                          <IconArrowUpRight
                            aria-hidden
                            className="mt-1 size-4 shrink-0 text-muted transition-colors group-hover:text-brand"
                          />
                        </p>

                        {category.description ? (
                          <p className="text-sm text-muted">{category.description}</p>
                        ) : null}

                        {/* Un compteur à zéro n'apprend rien : on ne l'affiche pas. */}
                        {category.productCount > 0 ? (
                          <p className="text-xs font-semibold text-muted-strong">
                            {productCountLabel(category.productCount)}
                          </p>
                        ) : null}
                      </div>
                    </Link>

                    {category.children.length > 0 ? (
                      <div className="mt-auto border-t border-line px-4 py-2">
                        <ul className="flex flex-wrap items-center gap-x-4">
                          {visibleChildren.map((child) => (
                            <li key={child.slug}>
                              <Link
                                href={`/c/${child.slug}`}
                                className="inline-flex min-h-11 items-center text-sm text-muted-strong underline underline-offset-4 hover:text-brand"
                              >
                                {child.name}
                              </Link>
                            </li>
                          ))}

                          {hiddenChildren > 0 ? (
                            <li>
                              <Link
                                href={`/c/${category.slug}`}
                                className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
                              >
                                +{hiddenChildren} autres
                                <span className="sr-only"> dans {category.name}</span>
                              </Link>
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
