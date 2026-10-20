import { describe, expect, it } from 'vitest'
import { AVAILABILITY_URLS } from '../src/components/seo/StructuredData'

/**
 * Le balisage ne doit jamais déclarer autre chose que ce que la fiche
 * affiche. Le point sensible est la disponibilité : un repli silencieux sur
 * « en rupture » coûterait du référencement sans que personne ne le voie.
 */
describe('disponibilité déclarée aux moteurs', () => {
  it('couvre tous les états du catalogue', () => {
    expect(Object.keys(AVAILABILITY_URLS).sort()).toEqual(
      ['BACKORDER', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].sort(),
    )
  })

  it('distingue le stock limité du stock plein', () => {
    expect(AVAILABILITY_URLS.LOW_STOCK).toBe('https://schema.org/LimitedAvailability')
    expect(AVAILABILITY_URLS.IN_STOCK).toBe('https://schema.org/InStock')
  })

  it('déclare la vente à découvert comme telle, et non comme une rupture', () => {
    // Un produit sur commande est achetable : le déclarer en rupture le
    // retirerait des résultats enrichis alors qu'il se vend.
    expect(AVAILABILITY_URLS.BACKORDER).toBe('https://schema.org/BackOrder')
    expect(AVAILABILITY_URLS.BACKORDER).not.toBe(AVAILABILITY_URLS.OUT_OF_STOCK)
  })

  it('n’utilise que des URL schema.org', () => {
    for (const url of Object.values(AVAILABILITY_URLS)) {
      expect(url.startsWith('https://schema.org/')).toBe(true)
    }
  })
})
