import type { Metadata } from 'next'
import { VehiculeIntrouvable } from '@/components/vehicle/VehiculeIntrouvable'

export const metadata: Metadata = {
  title: 'Véhicule non proposé',
  robots: { index: false, follow: false },
}

/**
 * 404 des pages de marque, de modèle et de génération.
 *
 * Elle existe parce que la 404 générale ne dit pas la bonne chose ici : une
 * page de marque sans modèle visible, ou de modèle sans produit en ligne, est
 * un cul-de-sac qui laisse croire à une panne. Le statut HTTP reste 404 et le
 * `noindex` est explicite — Google ne doit ni garder ces adresses à son index,
 * ni les proposer en résultat. Elles ne figurent pas non plus au plan de site.
 *
 * Le texte est partagé avec la 404 du parcours `/vehicule` : voir
 * `VehiculeIntrouvable`.
 */
export default function PacksNotFound() {
  return <VehiculeIntrouvable />
}
