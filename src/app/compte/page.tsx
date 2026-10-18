import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Mon compte'}
      purpose={'Commandes, documents, adresses, véhicules enregistrés, retours et assistance.'}
      step={'Espace client'}
      related={[{ label: 'Se connecter', href: '/connexion' }]}
    />
  )
}
