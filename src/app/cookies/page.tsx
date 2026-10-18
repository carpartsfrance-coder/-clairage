import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Cookies',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Cookies'}
      purpose={'Traceurs réellement déposés et préférences de consentement.'}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
