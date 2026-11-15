import { Suspense } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { BarreDeNavigation } from './BarreDeNavigation'
import { Mesure } from '@/components/mesure/Mesure'
import { Consentement } from '@/components/consentement/Consentement'
import { baliseGoogleAdsConfiguree } from '@/lib/google-ads'

/**
 * En-tête, pied de page et ce qui les accompagne, autour d'un contenu.
 *
 * Posé par `(boutique)/layout.tsx` pour toutes les pages publiques — et aussi,
 * à la main, par la page 404 de la racine : une URL inconnue n'appartient à
 * aucun groupe de routes, donc aucune mise en page de groupe ne s'y applique.
 * Sans ce composant, une faute de frappe dans une adresse menait à une page
 * sans en-tête ni pied de page, dont on ne pouvait plus rien faire.
 *
 * **L'en-tête arrive après le reste.** Il affiche le panier et le véhicule
 * retenu, tous deux tirés des cookies, et quatre requêtes avant de pouvoir
 * s'afficher. Entouré d'un `<Suspense>`, il n'empêche plus le contenu de la
 * page de partir : celui-ci s'affiche d'abord, l'en-tête se pose ensuite. Le
 * repli garde sa hauteur exacte, pour que rien ne saute à ce moment-là.
 *
 * Attention si l'on touche à ces frontières : aucune page du site n'est
 * pré-rendue, et c'est ce qui permet à une page de répondre 404 sur une fiche
 * inconnue ou 308 sur une adresse renommée — une réponse qui commence par une
 * coquille pré-calculée est figée à 200. Le pré-rendu partiel a été essayé le
 * 14 novembre 2026 pour cette raison, puis retiré ; le commentaire de
 * `next.config.ts` raconte ce qu'il faudrait régler avant d'y revenir.
 *
 * **Deux mesures cohabitent ici, et elles ne se mélangent pas.** `Mesure` est
 * la mesure maison, anonyme et sans cookie, dispensée de consentement, et elle
 * tourne pour tout le monde. `Consentement` est le bandeau publicitaire et la
 * balise Google Ads qu'il commande : il n'apparaît que si l'identifiant de
 * conversion est renseigné dans l'environnement. Sans lui, le site n'a ni
 * bandeau ni script tiers, exactement comme avant.
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
      {/*
        Le bandeau de consentement est posé ici, et non en fin de page, bien
        qu'il s'affiche en bas : il est en position fixe, donc son rang dans le
        document ne change rien à l'écran, mais il change tout au clavier. Plus
        bas, répondre à la question aurait demandé de traverser tout le site à
        la tabulation. Juste après le lien d'évitement, le choix vient tout de
        suite — c'est le moins qu'on doive à quelqu'un à qui on demande un
        accord.
      */}
      {baliseGoogleAdsConfiguree() ? <Consentement /> : null}
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
