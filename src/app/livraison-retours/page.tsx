import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Livraison & retours',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Livraison & retours'}
      purpose={'Zones, méthodes, tarifs, délais et conditions de retour, telles que configurées.'}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
