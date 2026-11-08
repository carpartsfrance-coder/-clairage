/**
 * Images types : ce qu'une fiche montre tant qu'elle n'a pas ses propres
 * rendus (feu allumé sur SON véhicule).
 *
 * Décidé avec l'exploitant le 8 novembre 2026, pour remettre en vente les
 * fiches prêtes (titre, prix, compatibilité) dont les photos de véhicule ne
 * sont pas encore faites — comme le font les concurrents. Une image par
 * emplacement, pas par produit :
 *
 * 1. un avant / après sur une voiture neutre (sans marque ni modèle
 *    reconnaissable) ;
 * 2. la photo des ampoules devant la boîte LEDVROOM, selon le type d'ampoule ;
 * 3. l'effet en usage : la route de nuit pour ce qui éclaire la route, sinon
 *    le gros plan « après ».
 *
 * Règles :
 * - **Jamais à la place d'un vrai visuel.** Dès qu'une fiche a un rendu, ou
 *   une photo produit à elle, ce sont eux qui s'affichent.
 * - **Toujours signalées** : nature « illustration » (la galerie affiche
 *   « Visuel d'illustration ») et légende « véhicule non représentatif ».
 * - **Pas pour la moto** : ces images montrent une voiture.
 * - **Google Shopping ne reçoit jamais l'avant / après** (texte « AVANT /
 *   APRÈS » sur l'image, refusé par Google) : voir `imagesTypesPourLeFlux`.
 *
 * Les fichiers sont dans `public/images-types/`.
 */

export const EMPLACEMENTS = [
  'phares',
  'antibrouillards',
  'feux-de-route',
  'veilleuses',
  'feux-de-jour',
  'clignotants',
  'eclairage-de-plaque',
  'feux-de-recul',
  'habitacle',
] as const

export type Emplacement = (typeof EMPLACEMENTS)[number]

type ProduitMinimal = { slug: string; name: string; vehicleType?: string | null }

const DOSSIER = '/images-types'
export const LEGENDE_IMAGE_TYPE = 'Visuel d’illustration — véhicule non représentatif.'

/** L'emplacement d'une fiche, lu dans son adresse : « pack-led-<emplacement>-… ». */
export function emplacementDeLaFiche(slug: string): Emplacement | null {
  const trouve = EMPLACEMENTS.find((emplacement) => slug.startsWith(`pack-led-${emplacement}-`))
  return trouve ?? null
}

/** Les feux de route n'ont pas d'images à eux : ce sont celles des phares. */
function visuelDe(emplacement: Emplacement): Exclude<Emplacement, 'feux-de-route'> {
  return emplacement === 'feux-de-route' ? 'phares' : emplacement
}

function photoProduit(emplacement: Emplacement, nom: string): string {
  if (/effet\s+x[ée]non/i.test(nom)) return 'produit-effet-xenon'
  switch (emplacement) {
    case 'phares':
    case 'antibrouillards':
    case 'feux-de-route':
      return 'produit-led-haute-puissance'
    case 'veilleuses':
    case 'eclairage-de-plaque':
    case 'habitacle':
      return 'produit-led-w5w'
    case 'feux-de-recul':
    case 'feux-de-jour':
      return 'produit-led-p21w'
    case 'clignotants':
      return 'produit-led-clignotant'
  }
}

const ECLAIRE_LA_ROUTE: Emplacement[] = ['phares', 'antibrouillards', 'feux-de-route']

export type ImageType = {
  url: string
  alt: string
  role: 'RESULT' | 'PRODUCT'
  /** Faux pour l'avant / après : il porte du texte, Google Shopping le refuse. */
  sansTexte: boolean
}

/** Les images types d'une fiche, dans l'ordre de la galerie. Vide si aucune. */
export function imagesTypes(produit: ProduitMinimal): ImageType[] {
  if (produit.vehicleType === 'MOTORCYCLE') return []
  const emplacement = emplacementDeLaFiche(produit.slug)
  if (!emplacement) return []
  const visuel = visuelDe(emplacement)
  const alt = `${produit.name} — visuel d’illustration`
  return [
    { url: `${DOSSIER}/${visuel}-avant-apres.webp`, alt, role: 'RESULT', sansTexte: false },
    {
      url: `${DOSSIER}/${photoProduit(emplacement, produit.name)}.webp`,
      alt: `${produit.name} — les ampoules`,
      role: 'PRODUCT',
      sansTexte: true,
    },
    ECLAIRE_LA_ROUTE.includes(emplacement)
      ? { url: `${DOSSIER}/route-nuit.webp`, alt, role: 'RESULT', sansTexte: false }
      : { url: `${DOSSIER}/${visuel}-apres.webp`, alt, role: 'RESULT', sansTexte: true },
  ]
}

/**
 * Le visuel de couverture d'une fiche sans visuel à elle (cartes du
 * catalogue, panier, accueil) : le gros plan « après », sans texte, qui se
 * recadre bien. `null` si la fiche n'a pas d'image type.
 */
export function couvertureType(produit: ProduitMinimal): { url: string; alt: string } | null {
  if (produit.vehicleType === 'MOTORCYCLE') return null
  const emplacement = emplacementDeLaFiche(produit.slug)
  if (!emplacement) return null
  return {
    url: `${DOSSIER}/${visuelDe(emplacement)}-apres.webp`,
    alt: `${produit.name} — visuel d’illustration`,
  }
}

/** Pour Google Shopping : seulement les images sans texte, la photo produit d'abord. */
export function imagesTypesPourLeFlux(produit: ProduitMinimal): string[] {
  return imagesTypes(produit)
    .filter((image) => image.sansTexte)
    .sort((a, b) => (a.role === 'PRODUCT' ? -1 : b.role === 'PRODUCT' ? 1 : 0))
    .map((image) => image.url)
}
