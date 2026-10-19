import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { prisma } from '@/lib/db'
import { EmptyState } from '@/components/ui/Surface'
import { CategoryBoard } from '@/components/admin/CategoryBoard'

export const metadata: Metadata = {
  title: 'Catégories',
  robots: { index: false, follow: false },
}

/**
 * Catégories du catalogue — ordre et visibilité.
 *
 * Cet écran pilote directement la navigation du site : le menu est construit
 * depuis les catégories publiées, dans l'ordre de leur position. Changer une
 * ligne ici change le menu, sans déploiement.
 *
 * Il affiche aussi le nombre de produits publiés par catégorie, parce que
 * c'est ce qui décide de la présence dans le menu : une catégorie publiée mais
 * vide n'y apparaît pas, et l'administrateur doit pouvoir comprendre pourquoi
 * sans deviner.
 */
export default async function AdminCategoriesPage() {
  await requireStaff('catalog.view')

  const categories = await prisma.category.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { name: true } },
      _count: {
        select: {
          products: { where: { product: { status: 'PUBLISHED' } } },
          children: true,
        },
      },
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.6px]">Catégories</h1>
        <p className="mt-1 max-w-[640px] text-[11px] leading-[1.8] text-muted-strong">
          L&apos;ordre et la visibilité réglés ici pilotent le menu du site. Une catégorie
          dépubliée sort du menu mais conserve ses produits et son adresse ; une catégorie publiée
          sans produit publié n&apos;apparaît pas dans le menu, pour ne pas y mener à une page
          vide.
        </p>
        <p className="mt-2 text-[11px]">
          <Link href="/admin/catalogue" className="font-semibold underline underline-offset-4">
            Retour au catalogue
          </Link>
        </p>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Aucune catégorie."
          description="Le catalogue se peuple par le script d'amorçage ou par import."
        />
      ) : (
        <CategoryBoard
          categories={categories.map((category) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
            family: category.family,
            position: category.position,
            published: category.published,
            parentName: category.parent?.name ?? null,
            childCount: category._count.children,
            publishedProducts: category._count.products,
          }))}
        />
      )}
    </div>
  )
}
