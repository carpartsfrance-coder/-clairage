import type { FitmentStatus } from './fitment'
import { nomUtileDuConditionnement } from './nom-conditionnement'
import { natureDuProduit } from './types-produit'
import { recommendPackaging } from './recommendation'
import type { CarteEclairage } from './packs-vue'

/**
 * Mise en forme de la page « les éclairages pour votre véhicule ».
 *
 * La page dessinait ses produits autrement que la page d'une génération, qui
 * montre pourtant les mêmes pièces au même client : une section titrée par
 * emplacement, et dedans une carte en trois blocs bordés — vignette de 80 px,
 * liste des conditionnements, pied de provenance. Le relevé du catalogue dit
 * ce que cette architecture servait : sur 10 183 couples (configuration,
 * emplacement), **10 072 ne portent qu'un seul produit** (98,9 %) ; sur
 * 10 295 compatibilités, **une seule** a un deuxième conditionnement, **cinq**
 * une réserve de montage, **cinq** une date de vérification, **aucune** une
 * quantité supérieure à un. Autrement dit : trois blocs par carte, réservés en
 * permanence pour des informations que cinq fiches sur dix mille possèdent, et
 * un titre de section par carte unique.
 *
 * Le résultat visible était une page de cartes creuses répétant deux fois le
 * nom du produit — le conditionnement porte le même nom que son produit sur
 * 10 320 des 10 327 références du catalogue.
 *
 * Ce module ramène donc les résultats au modèle de carte partagé avec la page
 * d'une génération, où les mentions rares ne s'affichent que remplies. Rien
 * n'est perdu : la réserve, la provenance, le deuxième conditionnement et la
 * quantité restent sur la carte qui les porte, et nulle part ailleurs.
 */

/** Un conditionnement documenté pour un emplacement. */
export type LigneResultat = {
  /** L'identifiant de la compatibilité, et la clé de la ligne. */
  id: string
  /** La variante elle-même : c'est elle qu'on met au panier. */
  variantId: string
  status: FitmentStatus
  quantity: number
  restrictions: string | null
  source: string | null
  verifiedAt: Date | null
  variantName: string
  priceCents: number
  /** Vrai quand ce conditionnement contient d'autres références (kit). */
  isKit: boolean
  /**
   * Accessoires indispensables que ce conditionnement ne fournit pas.
   *
   * C'est ce qui décide du conseil : un conditionnement qui ne se monte pas
   * seul ne peut pas être « conseillé » avec son seul prix.
   */
  missingRequired: number
  /** Vendable en l'état : on ne conseille pas une rupture. */
  purchasable: boolean
}

/** Un produit, et les conditionnements qui conviennent à cet emplacement. */
export type ProduitResultat = {
  productSlug: string
  productName: string
  image: { url: string; alt: string } | null
  /** Le meilleur statut parmi les conditionnements : il mène la carte. */
  status: FitmentStatus
  lines: LigneResultat[]
}

export type GroupeResultat = {
  code: string
  label: string
  products: ProduitResultat[]
}

/**
 * La phase, quand le nom de la génération ne la dit pas déjà.
 *
 * Le bandeau annonçait « Éclairage BMW M4 (F82 F83) » puis, en dessous,
 * « (F82 F83) » : le référentiel range le code de caisse dans la phase ET
 * dans le nom, et la page le recopiait deux fois à deux lignes d'écart.
 */
export function phaseUtile(phase: string | null, nomDeLaGeneration: string): string | null {
  if (!phase) return null
  return nomDeLaGeneration.includes(phase) ? null : phase
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/**
 * La provenance, rédigée — ou rien.
 *
 * Le libellé change avec le statut : une information « datée du » n'est pas
 * une vérification. Confondre les deux ferait passer une absence de réponse
 * pour une réponse vérifiée.
 */
export function provenance(
  status: FitmentStatus,
  verifiedAt: Date | null,
  source: string | null,
): string | null {
  if (!verifiedAt) return null
  const intitule = status === 'UNKNOWN' ? 'Information datée du' : 'Vérifié le'
  return `${intitule} ${dateFormatter.format(verifiedAt)}${source ? ` · ${source}` : ''}`
}

/**
 * Les cartes de la page des résultats, une par produit.
 *
 * Un produit documenté sur deux emplacements n'apparaît qu'une fois — en
 * grille unique il ferait doublon, et le client croirait devoir l'acheter deux
 * fois — et sa carte nomme les deux emplacements.
 */
export function cartesDesResultats(groupes: GroupeResultat[]): CarteEclairage[] {
  const parSlug = new Map<string, CarteEclairage>()

  for (const groupe of groupes) {
    for (const produit of groupe.products) {
      const vue = parSlug.get(produit.productSlug)
      if (vue) {
        if (!vue.emplacements.some((e) => e.label === groupe.label)) {
          vue.emplacements.push({ code: groupe.code, label: groupe.label })
        }
        continue
      }

      /*
        Conditionnement mis en avant : la règle partagée avec la fiche produit
        et les cartes de listing. Prendre le premier confirmé — donc le moins
        cher, les lignes étant triées par prix — conseillait les ampoules
        seules tout en annonçant sur la même carte que les accessoires
        n'étaient pas inclus.
      */
      const conseille = recommendPackaging(produit.lines) ?? produit.lines[0]
      if (!conseille) continue

      parSlug.set(produit.productSlug, {
        slug: produit.productSlug,
        nom: produit.productName,
        variantId: conseille.variantId,
        emplacements: [{ code: groupe.code, label: groupe.label }],
        image: produit.image,
        status: produit.status,
        prixCents: conseille.priceCents,
        // Plusieurs produits par emplacement : la carte dit ce qu'est chacun.
        conditionnement:
          nomUtileDuConditionnement(conseille.variantName, produit.productName) ??
          natureDuProduit(produit.productName),
        // Les combinaisons d'options (« Ballasts : … ») se choisissent sur la fiche.
        autres: produit.lines
          .filter((ligne) => ligne.id !== conseille.id && !ligne.variantName.includes(' : '))
          .map((ligne) => ({
            nom: ligne.isKit ? `${ligne.variantName} · tout compris` : ligne.variantName,
            prixCents: ligne.priceCents,
          })),
        reserve: conseille.restrictions,
        verifie: provenance(produit.status, conseille.verifiedAt, conseille.source),
        quantite: conseille.quantity > 1 ? conseille.quantity : null,
      })
    }
  }

  return [...parSlug.values()]
}
