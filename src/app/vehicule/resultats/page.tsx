import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Éclairages pour mon véhicule',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Éclairages pour mon véhicule'}
      purpose={'Produits par emplacement, avec le statut de compatibilité de chacun.'}
      step={'Catalogue et parcours véhicule'}
      related={[{ label: 'Changer de véhicule', href: '/vehicule' }]}
    />
  )
}
