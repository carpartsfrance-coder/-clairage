import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Garanties',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Garanties'}
      purpose={'Portée et durée des garanties, selon les conditions validées.'}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
