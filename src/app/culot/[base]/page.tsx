import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { listProducts } from '@/lib/queries/catalogue'
import { getSelectedVehicle } from '@/lib/session'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Pagination } from '@/components/catalogue/Pagination'
import { ProductCard } from '@/components/catalogue/ProductCard'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { EmptyState } from '@/components/ui/Surface'
import { IconInfo } from '@/components/ui/icons'

type PageProps = {
  params: Promise<{ base: string }>
  searchParams: Promise<{ page?: string }>
}

/**
 * Tous les produits d'un culot.
 *
 * C'est le parcours du client qui sait déjà ce qu'il cherche : il tape son
 * culot et voit les références, sans avoir à renseigner son véhicule.
 *
 * **Le culot ne confirme rien.** Deux véhicules en H7 n'acceptent pas
 * forcément la même ampoule : la forme du culot ne dit rien du bloc optique,
 * de l'équipement d'origine ni de la place disponible derrière le phare. La
 * page le dit en tête, et le bandeau véhicule reste accessible pour obtenir
 * un vrai statut.
 *
 * Aucune fiche n'est dupliquée : la liste réutilise `listProducts` et les
 * cartes du catalogue, et chaque carte mène à la fiche unique du produit.
 */

/** Culots réellement portés par un produit publié. `cache` : metadata + page. */
const lireCulot = cache(async function lireCulot(code: string) {
  try {
    const rows = await prisma.product.groupBy({
      by: ['bulbBase'],
      where: { status: 'PUBLISHED', bulbBase: { not: null } },
      _count: { _all: true },
    })
    const trouve = rows.find(
      (row) => row.bulbBase && row.bulbBase.toLowerCase() === code.toLowerCase(),
    )
    return trouve?.bulbBase ? { base: trouve.bulbBase, count: trouve._count._all } : null
  } catch (error) {
    console.error('[culot] lecture impossible', error)
    return null
  }
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { base } = await params
  const culot = await lireCulot(base)
  if (!culot) return { title: 'Culot introuvable' }

  return {
    title: `Ampoules ${culot.base}`,
    description: `Les références en culot ${culot.base} disponibles au catalogue.`,
    alternates: { canonical: `/culot/${culot.base.toLowerCase()}` },
  }
}

export default async function CulotPage({ params, searchParams }: PageProps) {
  const { base } = await params
  const { page: pageParam } = await searchParams

  const culot = await lireCulot(base)
  if (!culot) notFound()

  const page = Math.max(1, Number(pageParam) || 1)
  const vehicle = await getSelectedVehicle()
  const result = await listProducts(
    { bases: [culot.base], page, sort: 'pertinence' },
    vehicle?.configurationId ?? null,
  )

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Catégories', href: '/c' },
          { label: `Culot ${culot.base}` },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Ampoules {culot.base}
      </h1>
      <p className="mt-1 text-[11px] font-semibold">
        {result.total === 1 ? '1 référence' : `${result.total} références`}
      </p>

      {/*
        La réserve qui doit accompagner ce parcours.

        Entrer par le culot est légitime et rapide, mais un culot n'est pas une
        compatibilité : laisser croire le contraire ferait vendre une ampoule
        qui ne rentre pas dans le bloc optique.
      */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[7px] bg-warn-soft p-3 text-[#8d5420]">
        <IconInfo className="mt-px size-4 shrink-0" />
        <p className="text-[11px] leading-[1.7]">
          Le culot {culot.base} dit quelle forme a l&apos;ampoule, pas qu&apos;elle convient à
          votre véhicule : le bloc optique, l&apos;équipement d&apos;origine et la place derrière
          le phare comptent aussi.{' '}
          <Link href="/vehicule" className="font-semibold underline underline-offset-2">
            Indiquez votre véhicule
          </Link>{' '}
          pour obtenir un statut de compatibilité.
        </p>
      </div>

      <VehicleBar vehicle={vehicle} variant="compact" className="mt-4" />

      {result.items.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={`Aucune référence en ${culot.base} pour le moment.`}
          description="Le catalogue évolue : ce culot est documenté mais aucune référence publiée ne le porte actuellement."
          action={{ label: 'Voir le catalogue', href: '/c' }}
        />
      ) : (
        <>
          <ul className="mt-5 grid grid-cols-1 gap-4 min-[23rem]:grid-cols-2 fiche:grid-cols-3 min-[1101px]:grid-cols-4">
            {result.items.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            buildHref={(target) =>
              target === 1
                ? `/culot/${culot.base.toLowerCase()}`
                : `/culot/${culot.base.toLowerCase()}?page=${target}`
            }
          />
        </>
      )}
    </div>
  )
}
