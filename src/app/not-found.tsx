import type { Metadata } from 'next'
import { DecorBoutique } from '@/components/layout/DecorBoutique'
import { PageIntrouvable } from '@/components/layout/PageIntrouvable'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
}

/**
 * 404 des URL qui ne correspondent à aucune route.
 *
 * Elle pose le décor de la boutique elle-même, et c'est nécessaire : une URL
 * inconnue n'appartient à aucun groupe de routes, donc ni `(boutique)/layout`
 * ni aucune autre mise en page de groupe ne s'y applique — seule la racine, qui
 * ne contient que la coquille du document. Sans cet appel, une faute de frappe
 * dans une adresse menait à une page nue, sans en-tête ni pied de page.
 */
export default function NotFound() {
  return (
    <DecorBoutique>
      <PageIntrouvable />
    </DecorBoutique>
  )
}
