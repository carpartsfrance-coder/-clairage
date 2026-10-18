import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Connexion',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Connexion'}
      purpose={"Accès à l'espace client."}
      step={'Espace client'}
      related={[{ label: 'Créer un compte', href: '/inscription' }]}
    />
  )
}
