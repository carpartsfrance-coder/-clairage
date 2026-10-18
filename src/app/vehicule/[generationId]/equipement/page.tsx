import type { Metadata } from 'next'
import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata: Metadata = {
  title: "Équipement d'origine",
  robots: { index: false, follow: false },
}

/**
 * Étape d'équipement lumineux d'origine.
 *
 * Elle s'intercale quand une génération expose plusieurs équipements (halogène,
 * xénon d'origine, LED d'origine) : le choix revient au client, parce qu'un
 * halogène et un xénon n'acceptent pas le même produit.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Équipement d'origine"
      purpose="Choix de l'équipement lumineux d'origine du véhicule, avant toute recommandation de kit."
      step="Catalogue et parcours véhicule"
      related={[{ label: 'Changer de véhicule', href: '/vehicule' }]}
    />
  )
}
