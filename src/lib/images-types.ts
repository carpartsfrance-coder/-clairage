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
 * - **Les ampoules d'abord.** En couverture et en tête de galerie, la photo
 *   des ampoules : une voiture qui n'est pas la sienne ferait douter le
 *   client de la compatibilité. L'avant / après vient ensuite, en
 *   illustration de l'effet.
 * - **Jamais à la place d'un vrai visuel.** Dès qu'une fiche a un rendu, ou
 *   une photo produit à elle, ce sont eux qui s'affichent.
 * - **Toujours signalées** : nature « illustration » (la galerie affiche
 *   « Visuel d'illustration ») et légende « véhicule non représentatif ».
 * - **Moto : seulement la photo des ampoules.** Les avant / après et la
 *   route montrent une voiture : jamais sur une fiche moto.
 * - **Google Shopping ne reçoit jamais l'avant / après** (texte « AVANT /
 *   APRÈS » sur l'image, refusé par Google) : voir `imagesTypesPourLeFlux`.
 *
 * Les fichiers sont dans `public/images-types/`.
 */

import { typeDeProduit } from './types-produit'

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
  if (estEffetXenon(nom)) return 'produit-effet-xenon'
  // L'antibrouillard arrière prend une ampoule de feu arrière, pas de phare.
  if (emplacement === 'antibrouillards' && estArriere(nom)) return 'produit-led-p21w'
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

/*
  La route de nuit (halogène contre LED, faisceau qui porte loin) ne vaut que
  pour des phares LED : croisement et route. Ni pour les antibrouillards, qui
  n'éclairent pas la route de cette façon, ni pour l'effet xénon, qui blanchit
  la lumière sans la porter aussi loin — l'image promettrait plus que le
  produit (remarque de l'exploitant, 8 novembre 2026). Ailleurs, c'est le gros
  plan « après » de l'emplacement.
*/
const ECLAIRE_LA_ROUTE: Emplacement[] = ['phares', 'feux-de-route']
const estEffetXenon = (nom: string) => /effet\s+x[ée]non/i.test(nom)
/*
  « Antibrouillard arrière », « clignotants arrière » : les avant / après et
  gros plans types montrent l'avant de la voiture. Ces fiches n'ont que la
  photo des ampoules (8 novembre 2026).
*/
const estArriere = (nom: string) => /\barri[eè]re\b/i.test(nom)

export type ImageType = {
  url: string
  alt: string
  role: 'RESULT' | 'PRODUCT'
  /** Faux pour l'avant / après : il porte du texte, Google Shopping le refuse. */
  sansTexte: boolean
}

/** Les images types d'une fiche, dans l'ordre de la galerie. Vide si aucune. */
export function imagesTypes(produit: ProduitMinimal): ImageType[] {
  // Feux additionnels, centrale, clignotants complets… : leur photo seule.
  const type = typeDeProduit(produit.name)
  if (type) {
    return [
      {
        url: `${DOSSIER}/${type.image}.webp`,
        alt: `${produit.name} — visuel d’illustration`,
        role: 'PRODUCT',
        sansTexte: true,
      },
    ]
  }
  const emplacement = emplacementDeLaFiche(produit.slug)
  if (!emplacement) return []
  if (produit.vehicleType === 'MOTORCYCLE' || estArriere(produit.name)) {
    return [
      {
        url: `${DOSSIER}/${photoProduit(emplacement, produit.name)}.webp`,
        alt: `${produit.name} — les ampoules`,
        role: 'PRODUCT',
        sansTexte: true,
      },
    ]
  }
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
    ECLAIRE_LA_ROUTE.includes(emplacement) && !estEffetXenon(produit.name)
      ? { url: `${DOSSIER}/route-nuit.webp`, alt, role: 'RESULT', sansTexte: false }
      : { url: `${DOSSIER}/${visuel}-apres.webp`, alt, role: 'RESULT', sansTexte: true },
  ]
}

/**
 * Le visuel de couverture d'une fiche sans visuel à elle (cartes du
 * catalogue, pages véhicule, panier, accueil) : **la photo des ampoules**,
 * jamais une voiture.
 *
 * C'était le gros plan « après » sur la voiture neutre. Sur la page d'un
 * véhicule, les cartes des packs qui ont leurs rendus montrent ce véhicule ;
 * à côté, une autre voiture laissait croire au client que ce pack-là n'était
 * pas pour la sienne (remarque de l'exploitant, 8 novembre 2026). Les
 * ampoules devant la boîte ne montrent aucune voiture : rien à comparer.
 * `null` si la fiche n'a pas d'image type.
 */
export function couvertureType(produit: ProduitMinimal): { url: string; alt: string } | null {
  const type = typeDeProduit(produit.name)
  if (type) return { url: `${DOSSIER}/${type.image}.webp`, alt: `${produit.name} — visuel d’illustration` }
  const emplacement = emplacementDeLaFiche(produit.slug)
  if (!emplacement) return null
  return {
    url: `${DOSSIER}/${photoProduit(emplacement, produit.name)}.webp`,
    alt: `${produit.name} — les ampoules`,
  }
}

/** Pour Google Shopping : seulement les images sans texte, la photo produit d'abord. */
export function imagesTypesPourLeFlux(produit: ProduitMinimal): string[] {
  return imagesTypes(produit)
    .filter((image) => image.sansTexte)
    .sort((a, b) => (a.role === 'PRODUCT' ? -1 : b.role === 'PRODUCT' ? 1 : 0))
    .map((image) => image.url)
}
