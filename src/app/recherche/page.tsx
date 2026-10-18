import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Recherche',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Recherche'}
      purpose={'Résultats par nom, référence ou culot, avec tri, filtres et alternatives en cas de résultat vide.'}
      step={'Catalogue et parcours véhicule'}
      related={[]}
    />
  )
}
