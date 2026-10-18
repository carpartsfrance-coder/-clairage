import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Catégories',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Catégories'}
      purpose={'Liste les univers et sous-catégories, avec filtres et tri.'}
      step={'Catalogue et parcours véhicule'}
      related={[{ label: 'Phares LED', href: '/c/phares-led' }]}
    />
  )
}
