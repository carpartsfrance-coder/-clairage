/**
 * Annonce d'un ajout au panier, à l'écran, d'où qu'il vienne.
 *
 * **Pourquoi.** Sur téléphone, le client achète le plus souvent depuis la
 * barre collée en bas de la fiche. Le message « Ajouté au panier » était posé
 * dans le bloc d'achat, plus haut dans la page, donc hors de l'écran : la
 * seule trace de l'ajout était le petit chiffre rouge du panier, en haut. Le
 * 19 novembre 2026 à 20 h 28, un visiteur venu de la publicité a appuyé quatre
 * fois en une seconde sur la barre (panier à 4 × 103,90 €), croyant que rien
 * ne se passait, puis il est parti. Les boutons « Ajouter » de « Complétez
 * l'éclairage » ne disaient rien non plus, sinon « Ajouté » sur le bouton.
 *
 * Chaque ajout réussi émet donc cet événement, et `ConfirmationAjout` (posé
 * une fois pour toute la boutique) affiche la confirmation là où le client
 * regarde, avec le chemin vers le panier et la commande.
 */

export const EVENEMENT_AJOUT_PANIER = 'ledvroom:ajout-panier'

export type AnnonceAjoutPanier = {
  /** Ce qui a été ajouté, tel que le client le lit sur la fiche. */
  titre: string
  /** Vignette du produit, quand on l'a sous la main. */
  image?: { url: string; alt: string } | null
  /** Quantité ajoutée d'un coup (1 par défaut). */
  quantite?: number
  /** « La livraison est offerte… » ou « Plus que 12,10 € pour… ». */
  livraison?: string
  /** Une précision du serveur (quantité ramenée au stock, pack écarté…). */
  note?: string
}

export function annoncerAjoutPanier(annonce: AnnonceAjoutPanier) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AnnonceAjoutPanier>(EVENEMENT_AJOUT_PANIER, { detail: annonce }))
}
