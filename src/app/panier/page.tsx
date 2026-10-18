import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Panier',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Panier'}
      purpose={'Quantités, variantes, composants des kits, code promotionnel et totaux calculés côté serveur.'}
      step={'Panier, commande et paiements'}
      related={[]}
    />
  )
}
