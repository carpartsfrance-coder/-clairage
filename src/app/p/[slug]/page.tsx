import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Fiche produit',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Fiche produit'}
      purpose={'Galerie, compatibilité par emplacement, conditionnements, accessoires nécessaires et achat.'}
      step={'Fiche produit, variantes et kits'}
      related={[{ label: 'Toutes les catégories', href: '/c' }]}
    />
  )
}
