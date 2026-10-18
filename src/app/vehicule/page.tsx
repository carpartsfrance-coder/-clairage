import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: 'Mon véhicule',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <ComingSoon
      title={'Mon véhicule'}
      purpose={"Sélection complète du véhicule : marque, modèle, année, puis équipement lumineux d'origine."}
      step={'Catalogue et parcours véhicule'}
      related={[]}
    />
  )
}
