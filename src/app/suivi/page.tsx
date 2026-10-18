import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Suivre ma commande',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Suivre ma commande'}
      purpose={"Suivi d'une commande, y compris pour une commande passée sans compte."}
      step={'Espace client'}
      related={[]}
    />
  )
}
