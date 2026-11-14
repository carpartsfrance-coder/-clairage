import type { Metadata } from 'next'
import { PageIntrouvable } from '@/components/layout/PageIntrouvable'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
}

/**
 * 404 des pages publiques : un `notFound()` appelé par une fiche produit, une
 * rubrique ou un pack atterrit ici, à l'intérieur du décor de la boutique.
 */
export default function NotFound() {
  return <PageIntrouvable />
}
