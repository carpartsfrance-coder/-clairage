import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Conseils & montage',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Conseils & montage'}
      purpose={'Guides de montage par emplacement et par véhicule, avec niveau de difficulté.'}
      step={'Contenus et paramètres'}
      related={[{ label: 'Aide & contact', href: '/aide' }]}
    />
  )
}
