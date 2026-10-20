import { describe, expect, it } from 'vitest'
import { publiable, releverManques, type ProduitExamine } from '../src/lib/admin/completeness'

/** Fiche complète : rien ne doit remonter. */
function fiche(surcharge: Partial<ProduitExamine> = {}): ProduitExamine {
  return {
    status: 'DRAFT',
    tagline: 'Passez au blanc.',
    description: 'Une description.',
    body: 'Un rédactionnel long.',
    metaTitle: 'Kit LED H7',
    metaDescription: 'Kit LED H7 pour votre véhicule.',
    bulbBase: 'H7',
    categories: [{}],
    specs: [{}],
    media: [{ media: { alt: 'Deux ampoules LED H7' } }],
    variants: [
      {
        active: true,
        priceCents: 9990,
        vatRateId: 'tva-fr',
        sku: 'KIT-H7',
        stockOnHand: 10,
        backorder: false,
        fitments: [],
      },
    ],
    ...surcharge,
  }
}

describe('releverManques', () => {
  it('ne relève rien sur une fiche complète', () => {
    expect(releverManques(fiche())).toEqual([])
    expect(publiable(releverManques(fiche()))).toBe(true)
  })

  it('bloque la publication sans rubrique', () => {
    const manques = releverManques(fiche({ categories: [] }))
    expect(manques.map((m) => m.champ)).toContain('Rubrique')
    expect(publiable(manques)).toBe(false)
  })

  it('bloque un conditionnement sans taux de TVA — le HT affiché serait faux', () => {
    const manques = releverManques(
      fiche({ variants: [{ ...fiche().variants[0], vatRateId: null }] }),
    )
    expect(manques.some((m) => m.champ.startsWith('Taux de TVA'))).toBe(true)
    expect(publiable(manques)).toBe(false)
  })

  it('bloque un prix à zéro', () => {
    const manques = releverManques(fiche({ variants: [{ ...fiche().variants[0], priceCents: 0 }] }))
    expect(publiable(manques)).toBe(false)
  })

  it("bloque quand aucune variante n'est active", () => {
    const manques = releverManques(
      fiche({ variants: [{ ...fiche().variants[0], active: false }] }),
    )
    expect(manques.map((m) => m.champ)).toContain('Conditionnement')
    expect(publiable(manques)).toBe(false)
  })

  it('signale sans bloquer un visuel sans texte alternatif', () => {
    const manques = releverManques(fiche({ media: [{ media: { alt: '  ' } }] }))
    expect(manques.some((m) => m.champ.startsWith('Texte alternatif'))).toBe(true)
    expect(publiable(manques)).toBe(true)
  })

  it('signale une compatibilité confirmée sans source ni date', () => {
    const manques = releverManques(
      fiche({
        variants: [
          {
            ...fiche().variants[0],
            fitments: [{ status: 'CONFIRMED', source: null, verifiedAt: null }],
          },
        ],
      }),
    )
    expect(manques.some((m) => m.champ.startsWith('Source de compatibilité'))).toBe(true)
    expect(publiable(manques)).toBe(true)
  })

  it('ne reproche rien à une compatibilité inconnue : elle n’affirme rien', () => {
    const manques = releverManques(
      fiche({
        variants: [
          {
            ...fiche().variants[0],
            fitments: [{ status: 'UNKNOWN', source: null, verifiedAt: null }],
          },
        ],
      }),
    )
    expect(manques).toEqual([])
  })
})
