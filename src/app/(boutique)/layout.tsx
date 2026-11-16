import { DecorBoutique } from '@/components/layout/DecorBoutique'

/**
 * Mise en page des pages publiques.
 *
 * **Pourquoi un groupe de routes.** `(boutique)` entre parenthèses est
 * transparent pour le routage : aucune URL ne change, `src/app/(boutique)/p/…`
 * reste `/p/…`. Le seul effet est de donner une mise en page commune aux pages
 * publiques, et à elles seules. Le back-office garde la sienne, avec son propre
 * `<main>` et son propre lien d'évitement.
 *
 * Avant, ce décor était dans la mise en page racine, qui devait donc lire
 * l'en-tête `x-pathname` pour savoir s'il fallait s'abstenir sur `/admin`.
 * Cette seule lecture rendait tout le site dynamique : aucune page ne pouvait
 * être mise en cache. Le groupe de routes répond à la même question — « suis-je
 * dans la boutique ? » — sans rien lire de la requête.
 */
export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  /*
    Les photos produit viennent du stockage objet, un autre domaine que le
    site. Annoncer ce domaine dans la tête de page laisse le navigateur ouvrir
    la connexion (DNS, TLS) pendant qu'il lit encore le HTML, au lieu
    d'attendre la première <img> : c'est autant de gagné sur l'affichage de la
    photo principale d'une fiche, mesuré à 4,2 s sur téléphone (PageSpeed,
    16 novembre 2026). Sans domaine configuré, rien n'est émis.
  */
  const hoteMedias = process.env.MEDIA_PUBLIC_HOST

  return (
    <>
      {/* React place ce <link> dans la tête du document. Sans `crossOrigin` :
          les photos sont chargées par des <img> ordinaires, et une
          préconnexion « anonyme » ne leur servirait pas. */}
      {hoteMedias ? <link rel="preconnect" href={`https://${hoteMedias}`} /> : null}
      <DecorBoutique>{children}</DecorBoutique>
    </>
  )
}
