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
  return <DecorBoutique>{children}</DecorBoutique>
}
