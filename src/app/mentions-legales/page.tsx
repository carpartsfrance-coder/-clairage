import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Mentions légales',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Mentions légales'}
      purpose={"Identité de l'éditeur, hébergeur et directeur de la publication."}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
