import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Questions fréquentes',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Questions fréquentes'}
      purpose={"Réponses sur le choix, la compatibilité, l'homologation, le montage et la livraison."}
      step={'Contenus et paramètres'}
      related={[{ label: 'Nous contacter', href: '/contact' }]}
    />
  )
}
