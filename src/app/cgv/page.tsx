import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Conditions générales de vente',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Conditions générales de vente'}
      purpose={"Conditions de vente, à valider avant l'ouverture commerciale."}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
