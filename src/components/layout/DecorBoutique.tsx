import { Suspense } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { BarreDeNavigation } from './BarreDeNavigation'
import { Mesure } from '@/components/mesure/Mesure'

/**
 * En-tête, pied de page et ce qui les accompagne, autour d'un contenu.
 *
 * Posé par `(boutique)/layout.tsx` pour toutes les pages publiques — et aussi,
 * à la main, par la page 404 de la racine : une URL inconnue n'appartient à
 * aucun groupe de routes, donc aucune mise en page de groupe ne s'y applique.
 * Sans ce composant, une faute de frappe dans une adresse menait à une page
 * sans en-tête ni pied de page, dont on ne pouvait plus rien faire.
 *
 * **L'en-tête n'est pas dans la coquille statique.** Il affiche le panier et le
 * véhicule retenu, tous deux tirés des cookies : il ne peut pas être pré-rendu
 * une fois pour tous les visiteurs. Il est donc entouré d'un `<Suspense>` et
 * arrive juste après le reste de la page, servi depuis le cache. Le repli garde
 * sa hauteur exacte, pour que le contenu ne saute pas quand l'en-tête se pose.
 *
 * Le pied de page, lui, ne lit rien de la requête (son seuil de livraison et
 * son menu passent par le cache du catalogue, son année est mise en cache à la
 * journée) : il fait partie de la coquille.
 */
export function DecorBoutique({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Retour visuel immédiat au clic sur un lien (voir le composant). */}
      <Suspense fallback={null}>
        <BarreDeNavigation />
      </Suspense>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <Suspense fallback={<SqueletteEntete />}>
        <Header />
      </Suspense>
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <Footer />
      <Suspense fallback={null}>
        <Mesure />
      </Suspense>
    </>
  )
}

/**
 * Repli de l'en-tête, le temps qu'il arrive.
 *
 * Il ne dessine rien : il occupe la hauteur de l'en-tête déployé — bandeau de
 * réassurance (26 px, 29 au-delà de 800 px), ligne principale et navigation —
 * pour que le contenu de la page ne remonte pas d'un cran quand l'en-tête se
 * pose. Les hauteurs viennent de `Header.tsx`.
 */
function SqueletteEntete() {
  return <div aria-hidden className="h-[157px] shrink-0 bg-white md:h-[160px]" />
}
