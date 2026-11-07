import type { Metadata } from 'next'
import { VehiculeIntrouvable } from '@/components/vehicle/VehiculeIntrouvable'

export const metadata: Metadata = {
  title: 'Véhicule non proposé',
  robots: { index: false, follow: false },
}

/**
 * 404 du parcours par le sélecteur : l'étape d'équipement d'une génération
 * qui n'est plus proposée.
 *
 * Le sélecteur ne liste plus ce véhicule, mais son adresse peut rester dans un
 * favori ou un onglet ouvert avant la dépublication. Elle répond 404 plutôt
 * que d'ouvrir l'étape d'équipement sur une page de résultats vide.
 */
export default function VehiculeNotFound() {
  return <VehiculeIntrouvable />
}
