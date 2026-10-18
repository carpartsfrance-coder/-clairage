import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Catégorie',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Catégorie'}
      purpose={"Produits d'une catégorie, filtrés par le véhicule sélectionné quand il y en a un."}
      step={'Catalogue et parcours véhicule'}
      related={[{ label: 'Toutes les catégories', href: '/c' }]}
    />
  )
}
