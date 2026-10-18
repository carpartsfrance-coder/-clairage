import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Commande',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Commande'}
      purpose={'Coordonnées, adresses, livraison, paiement en mode test et récapitulatif.'}
      step={'Panier, commande et paiements'}
      related={[{ label: 'Panier', href: '/panier' }]}
    />
  )
}
