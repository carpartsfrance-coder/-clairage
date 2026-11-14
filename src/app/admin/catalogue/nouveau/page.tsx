import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { listCategoryOptions, listVatRates } from '@/lib/queries/admin'
import { ProductCreateForm } from '@/components/admin/ProductCreateForm'

export const metadata: Metadata = {
  title: 'Nouveau produit',
  robots: { index: false, follow: false },
}

/**
 * Création d'une fiche produit.
 *
 * Cet écran comble une impasse, pas un confort : **rien dans l'application ne
 * créait un produit.** Le catalogue en ligne venait de `prisma/seed.ts` et de
 * deux scripts lancés à la main ; le seul chemin depuis le back-office était un
 * import CSV, qui crée bien un produit mais n'attribue aucun taux de TVA — et
 * la publication le refuse, à juste titre. Une boutique sans accès à la ligne
 * de commande ne pouvait donc pas mettre un produit en vente.
 *
 * Le droit exigé est `catalog.edit`, pas `catalog.publish` : créer une fiche en
 * brouillon n'est pas la mettre en vente.
 */
export default async function AdminProductCreatePage() {
  await requireStaff('catalog.edit')

  const [categories, tauxTva] = await Promise.all([listCategoryOptions(), listVatRates()])

  return (
    <div className="flex flex-col gap-1">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.6px]">Nouveau produit</h1>
        <p className="mt-1 max-w-[640px] text-[11px] leading-[1.8] text-muted-strong">
          Ce formulaire demande ce qui empêche de publier une fiche : une rubrique, un
          conditionnement actif, un prix et un taux de TVA. Le reste — accroche, visuels,
          caractéristiques, compatibilités — s&apos;ajoute ensuite sur la fiche, où chaque bloc a
          son propre enregistrement.
        </p>
        <p className="mt-2 text-[11px]">
          <Link href="/admin/catalogue" className="font-semibold underline underline-offset-4">
            Retour au catalogue
          </Link>
        </p>
      </div>

      <ProductCreateForm categories={categories} tauxTva={tauxTva} />
    </div>
  )
}
