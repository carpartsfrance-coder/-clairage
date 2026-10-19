import { describe, expect, it } from 'vitest'
import {
  deduceMissingAccessories,
  type MissingAccessoryLine,
  type RequiredAccessory,
} from '../src/lib/fitment'

/**
 * Accessoires indispensables absents du panier.
 *
 * C'est le calcul qui décide si l'on dit au client « votre montage demande des
 * pièces que le panier ne contient pas ». Se tromper dans un sens le laisse
 * partir avec un colis inutilisable ; dans l'autre, on lui réclame des pièces
 * qu'il a déjà. Le piège tenu ici : les composants d'un kit servent au montage
 * de CE kit, ils ne sont pas des pièces de rechange pour une autre ligne.
 */

const adaptateur = (over: Partial<RequiredAccessory> = {}): RequiredAccessory => ({
  variantId: 'v-adapt',
  sku: 'ACC-ADAPT',
  productSlug: 'adaptateur',
  productName: 'Adaptateur de fixation',
  variantName: "l'unité",
  quantity: 2,
  required: true,
  priceCents: 690,
  note: null,
  ...over,
})

const ligne = (over: Partial<MissingAccessoryLine> = {}): MissingAccessoryLine => ({
  variantId: 'v-ampoules',
  productName: 'Kit LED H7',
  variantName: 'Les ampoules seules',
  quantity: 1,
  componentSkus: [],
  ...over,
})

/** Raccourci : une seule ligne, et ce que son montage exige. */
function manquants(
  lines: MissingAccessoryLine[],
  exigences: Record<string, RequiredAccessory[]>,
) {
  const map = new Map(
    Object.entries(exigences).map(([variantId, accessories]) => [variantId, { accessories }]),
  )
  return deduceMissingAccessories(lines, map)
}

describe('deduceMissingAccessories', () => {
  it('signale un accessoire exigé qu’aucune ligne n’apporte', () => {
    const result = manquants([ligne()], { 'v-ampoules': [adaptateur()] })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ variantId: 'v-adapt', quantity: 2 })
    expect(result[0].requiredForName).toBe('Kit LED H7 — Les ampoules seules')
  })

  it('ne signale rien quand le kit de la ligne le contient déjà', () => {
    const result = manquants(
      [ligne({ componentSkus: [{ sku: 'ACC-ADAPT', quantity: 2 }] })],
      { 'v-ampoules': [adaptateur()] },
    )

    expect(result).toEqual([])
  })

  it('multiplie le besoin par la quantité de la ligne', () => {
    const result = manquants([ligne({ quantity: 3 })], { 'v-ampoules': [adaptateur()] })

    expect(result[0].quantity).toBe(6)
  })

  it('déduit la ligne du panier qui EST cet accessoire', () => {
    const result = manquants(
      [
        ligne(),
        ligne({ variantId: 'v-adapt', productName: 'Adaptateur', quantity: 2, componentSkus: [] }),
      ],
      { 'v-ampoules': [adaptateur()], 'v-adapt': [] },
    )

    expect(result).toEqual([])
  })

  it('ne déduit que partiellement quand la réserve ne suffit pas', () => {
    const result = manquants(
      [
        ligne({ quantity: 2 }), // exige 4
        ligne({ variantId: 'v-adapt', productName: 'Adaptateur', quantity: 1 }),
      ],
      { 'v-ampoules': [adaptateur()], 'v-adapt': [] },
    )

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
  })

  it("n'impute PAS les composants d'un kit au montage d'une autre ligne", () => {
    /*
      Deux kits complets au panier apportent chacun leurs adaptateurs — mais
      pour leur propre montage. Une paire d'ampoules nues ajoutée à côté a
      toujours besoin des siens. C'est l'erreur que ce calcul a d'abord faite,
      et qui faisait taire l'alerte au pire moment.
    */
    const result = manquants(
      [
        ligne({
          variantId: 'v-kit',
          variantName: 'Le kit complet',
          quantity: 2,
          componentSkus: [{ sku: 'ACC-ADAPT', quantity: 2 }],
        }),
        ligne(), // les ampoules seules, sans composant
      ],
      { 'v-kit': [adaptateur()], 'v-ampoules': [adaptateur()] },
    )

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('ignore les accessoires facultatifs', () => {
    const result = manquants([ligne()], { 'v-ampoules': [adaptateur({ required: false })] })

    expect(result).toEqual([])
  })

  it('ne fait pas une ligne s’exiger elle-même', () => {
    const result = manquants(
      [ligne({ variantId: 'v-adapt', productName: 'Adaptateur' })],
      { 'v-adapt': [adaptateur()] },
    )

    expect(result).toEqual([])
  })

  it('additionne le besoin de plusieurs lignes sur le même accessoire', () => {
    const result = manquants(
      [ligne(), ligne({ variantId: 'v-autre', productName: 'Autre produit' })],
      { 'v-ampoules': [adaptateur()], 'v-autre': [adaptateur()] },
    )

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(4)
  })
})
