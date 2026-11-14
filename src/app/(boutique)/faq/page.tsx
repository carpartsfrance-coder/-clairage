import { permanentRedirect } from 'next/navigation'

/**
 * /faq → /aide.
 *
 * Cette page était un gabarit « page non encore construite » qui promettait
 * les questions fréquentes. Elles existent maintenant, publiées, sur /aide —
 * avec le suivi de commande et le formulaire de contact autour. Deux pages
 * pour la même liste n'auraient servi qu'à en laisser une vide.
 *
 * Redirection plutôt que suppression : l'adresse a pu être mise en favori ou
 * citée ailleurs, et elle continue de mener aux réponses.
 */
export default function Page() {
  permanentRedirect('/aide#questions')
}
