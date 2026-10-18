import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Créer un compte',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Créer un compte'}
      purpose={"Inscription et vérification de l'adresse e-mail."}
      step={'Espace client'}
      related={[{ label: 'Se connecter', href: '/connexion' }]}
    />
  )
}
