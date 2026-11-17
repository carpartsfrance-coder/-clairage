/**
 * Où revenir après avoir choisi un véhicule.
 *
 * Changer de véhicule depuis une fiche produit renvoyait toujours vers la
 * liste des résultats : le client devait retrouver la fiche qu'il regardait
 * (audit du parcours, 16 novembre 2026). Le sélecteur transmet désormais la
 * page d'où il a été ouvert, et le serveur y renvoie le client — la fiche
 * affiche alors la compatibilité pour le nouveau véhicule.
 *
 * Seules les pages dont l'affichage dépend du véhicule sont acceptées : une
 * fiche produit (`/p/…`) ou une liste de catégorie (`/c/…`). Ailleurs —
 * l'accueil, une page de packs propre à un autre véhicule — la liste des
 * résultats reste la meilleure suite.
 *
 * Le chemin vient du navigateur : il est vérifié caractère par caractère,
 * sans hôte, sans paramètres, sans `//`. Cette fonction ne doit jamais faire
 * d'une route du site une redirection ouverte.
 *
 * Module pur : l'API de sélection, la page d'équipement et les tests s'en
 * servent tous.
 */

const CHEMIN_ACCEPTE = /^\/(p|c)\/[a-z0-9][a-z0-9-]{0,199}$/

export function retourApresChoix(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  return CHEMIN_ACCEPTE.test(valeur) ? valeur : null
}
