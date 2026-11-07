import 'server-only'
import { unstable_cache } from 'next/cache'

/**
 * Lectures du catalogue partagées entre tous les visiteurs, gardées en cache.
 *
 * **Pourquoi.** Le menu (rubriques, marques, culots), l'accueil et les listes
 * du sélecteur de véhicule ne dépendent pas du visiteur, mais elles étaient
 * relues dans la base à **chaque page** : le menu seul parcourait les dix mille
 * rattachements produit-catégorie et deux arbres marque → modèle → génération
 * → compatibilité. Sur la petite base de Render, une page affichait sa
 * première ligne au bout de 3 à 6 secondes (mesuré le 7 novembre 2026), même
 * une page de texte comme les CGV.
 *
 * **Comment.** `unstable_cache` garde le résultat en mémoire et sur le disque
 * du serveur. Passé `DUREE_CATALOGUE_S`, la requête suivante reçoit encore
 * l'ancienne version, et la relecture part en arrière-plan : aucun visiteur
 * n'attend la base pour ces données, sauf le tout premier après un
 * déploiement.
 *
 * **Ce que ça change pour l'administration.** Une modification du catalogue
 * (publication, rubrique, marque, mise en avant) apparaît dans le menu et sur
 * l'accueil au plus tard `DUREE_CATALOGUE_S` après. Les fiches produit, le
 * panier et la commande, eux, sont toujours lus en direct.
 *
 * **Une erreur n'est jamais mise en cache.** La fonction lue doit LEVER en cas
 * d'échec, et c'est l'appelant qui choisit son repli : une base injoignable
 * pendant une seconde ne doit pas laisser un menu vide pendant cinq minutes.
 */

/** Cinq minutes : assez pour soulager la base, assez court pour l'administration. */
export const DUREE_CATALOGUE_S = 300

/** Étiquette commune, pour pouvoir tout invalider d'un coup (`revalidateTag`). */
export const TAG_CATALOGUE = 'catalogue'

/**
 * Enveloppe une lecture du catalogue dans le cache partagé.
 *
 * `cle` doit être unique par lecture ; les arguments passés à la fonction
 * rendue s'y ajoutent, et le résultat doit être sérialisable en JSON (pas de
 * `Date`, pas de `Map`).
 */
export function lectureCatalogue<Args extends unknown[], Resultat>(
  cle: string,
  lire: (...args: Args) => Promise<Resultat>,
): (...args: Args) => Promise<Resultat> {
  return unstable_cache(lire, [cle], { revalidate: DUREE_CATALOGUE_S, tags: [TAG_CATALOGUE] })
}
