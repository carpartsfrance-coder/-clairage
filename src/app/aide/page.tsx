import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Aide',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Aide'}
      purpose={"Point d'entrée de l'assistance : montage, commande, retour, garantie."}
      step={'Contenus et paramètres'}
      related={[{ label: 'Nous contacter', href: '/contact' }]}
    />
  )
}
