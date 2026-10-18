import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Moyens de paiement',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Moyens de paiement'}
      purpose={'Moyens acceptés et sécurité des transactions.'}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
