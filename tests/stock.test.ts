import { describe, expect, it } from 'vitest'
import {
  availabilityForKit,
  availabilityForVariant,
  availabilityLabel,
  isPurchasable,
} from '../src/lib/stock'
import { buildDeliveryTeaser } from '../src/lib/delivery-teaser'

/**
 * Le calcul de disponibilité d'un kit est l'endroit où l'on vend le plus
 * facilement une pièce qu'on n'a pas : division entière oubliée, composant
 * facultatif compté comme bloquant, stock réservé ignoré. D'où ces cas.
 */

const variant = (over: Partial<Parameters<typeof availabilityForVariant>[0]> = {}) => ({
  sku: 'SKU',
  name: 'Variante',
  stockOnHand: 10,
  stockReserved: 0,
  lowStockThreshold: 2,
  backorder: false,
  ...over,
})

describe('availabilityForVariant', () => {
  it('retire le stock réservé du vendable', () => {
    const result = availabilityForVariant(variant({ stockOnHand: 10, stockReserved: 4 }))
    expect(result.sellable).toBe(6)
    expect(result.state).toBe('IN_STOCK')
  })

  it('passe en stock faible au niveau du seuil, pas en dessous', () => {
    expect(availabilityForVariant(variant({ stockOnHand: 2 })).state).toBe('LOW_STOCK')
    expect(availabilityForVariant(variant({ stockOnHand: 3 })).state).toBe('IN_STOCK')
  })

  it('ne descend jamais sous zéro quand le réservé dépasse le détenu', () => {
    const result = availabilityForVariant(variant({ stockOnHand: 2, stockReserved: 5 }))
    expect(result.sellable).toBe(0)
    expect(result.state).toBe('OUT_OF_STOCK')
  })

  it('reste vendable à découvert quand backorder est actif', () => {
    const result = availabilityForVariant(variant({ stockOnHand: 0, backorder: true }))
    expect(result.state).toBe('BACKORDER')
    expect(result.sellable).toBeNull()
    expect(isPurchasable(result)).toBe(true)
  })
})

describe('availabilityForKit', () => {
  const component = (over: Partial<ReturnType<typeof variant>> = {}) => variant(over)

  it('divise par la quantité exigée dans le kit', () => {
    // 10 adaptateurs, 2 par kit → 5 kits possibles, pas 10.
    const result = availabilityForKit([
      { quantity: 2, required: true, component: component({ sku: 'ADAPT', stockOnHand: 10 }) },
    ])
    expect(result.sellable).toBe(5)
  })

  it('retient le composant le plus contraint', () => {
    const result = availabilityForKit([
      { quantity: 1, required: true, component: component({ sku: 'AMPOULES', stockOnHand: 64 }) },
      { quantity: 2, required: true, component: component({ sku: 'ADAPT', stockOnHand: 7 }) },
      { quantity: 2, required: true, component: component({ sku: 'CANBUS', stockOnHand: 40 }) },
    ])
    expect(result.sellable).toBe(3) // floor(7 / 2)
    expect(result.limitingComponent?.sku).toBe('ADAPT')
  })

  it('ignore les composants facultatifs dans le calcul', () => {
    const result = availabilityForKit([
      { quantity: 1, required: true, component: component({ sku: 'AMPOULES', stockOnHand: 8 }) },
      { quantity: 1, required: false, component: component({ sku: 'BONUS', stockOnHand: 0 }) },
    ])
    expect(result.sellable).toBe(8)
    expect(isPurchasable(result)).toBe(true)
  })

  it('tombe en rupture dès qu’un composant obligatoire manque', () => {
    const result = availabilityForKit([
      { quantity: 1, required: true, component: component({ sku: 'AMPOULES', stockOnHand: 64 }) },
      { quantity: 2, required: true, component: component({ sku: 'ADAPT', stockOnHand: 1 }) },
    ])
    expect(result.sellable).toBe(0)
    expect(result.state).toBe('OUT_OF_STOCK')
    expect(result.limitingComponent?.sku).toBe('ADAPT')
    expect(isPurchasable(result)).toBe(false)
  })

  it('tient compte du stock réservé des composants', () => {
    const result = availabilityForKit([
      {
        quantity: 1,
        required: true,
        component: component({ sku: 'AMPOULES', stockOnHand: 10, stockReserved: 9 }),
      },
    ])
    expect(result.sellable).toBe(1)
  })

  it('refuse de déclarer disponible un kit sans composant obligatoire', () => {
    // Un « kit » vide ne doit pas renvoyer l'infini : il n'est pas vendable.
    expect(availabilityForKit([]).state).toBe('OUT_OF_STOCK')
    expect(
      availabilityForKit([
        { quantity: 1, required: false, component: component({ stockOnHand: 99 }) },
      ]).state,
    ).toBe('OUT_OF_STOCK')
  })
})

describe('availabilityLabel', () => {
  it("n'annonce un nombre que lorsque le stock est réellement bas", () => {
    expect(availabilityLabel(availabilityForVariant(variant({ stockOnHand: 50 })))).toBe('En stock')
    expect(availabilityLabel(availabilityForVariant(variant({ stockOnHand: 2 })))).toBe(
      'Plus que 2 en stock',
    )
  })
})

describe('buildDeliveryTeaser', () => {
  const colissimo = {
    code: 'COLISSIMO',
    label: 'Domicile',
    carrier: 'Colissimo',
    priceCents: 590,
    freeFromCents: 8000,
    minDays: 2,
    maxDays: 3,
  }
  const relais = {
    code: 'RELAIS',
    label: 'Point relais',
    carrier: 'Mondial Relay',
    priceCents: 390,
    freeFromCents: 8000,
    minDays: 3,
    maxDays: 5,
  }

  it("n'annonce rien quand aucune méthode n'est configurée", () => {
    expect(buildDeliveryTeaser([], 9990)).toBeNull()
  })

  it('offre la livraison au-dessus du seuil et reprend les délais de la méthode retenue', () => {
    const teaser = buildDeliveryTeaser([colissimo, relais], 9990)
    expect(teaser?.priceLabel).toBe('Livraison offerte')
    expect(teaser?.delayLabel).toBe('estimation 2 à 3 jours ouvrés')
    expect(teaser?.missingForFreeCents).toBeNull()
  })

  it('indique ce qui manque pour la franchise sous le seuil', () => {
    const teaser = buildDeliveryTeaser([colissimo, relais], 6990)
    expect(teaser?.priceLabel).toContain('3,90')
    expect(teaser?.missingForFreeCents).toBe(1010)
  })

  it("n'invente pas de délai quand une borne manque", () => {
    const teaser = buildDeliveryTeaser([{ ...colissimo, maxDays: null }], 9990)
    expect(teaser?.delayLabel).toBeNull()
  })
})
