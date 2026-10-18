import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Confidentialité',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Confidentialité'}
      purpose={'Données collectées, finalités, durées et droits des personnes.'}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
