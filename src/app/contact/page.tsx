import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Nous contacter',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Nous contacter'}
      purpose={"Demande d'aide au choix, question technique ou suivi d'une demande en cours."}
      step={'Contenus et paramètres'}
      related={[]}
    />
  )
}
