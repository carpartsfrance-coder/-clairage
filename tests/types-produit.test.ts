import { describe, expect, it } from 'vitest'
import { typeDeProduit } from '../src/lib/types-produit'
import { couvertureType, imagesTypes } from '../src/lib/images-types'

/**
 * Les fiches qui ne sont pas des packs d'ampoules (feux additionnels,
 * centrale, clignotants complets…) : elles ne montrent que la photo de leur
 * produit, jamais un avant / après d'ampoules.
 */
describe('typeDeProduit', () => {
  it('reconnaît les fiches réécrites', () => {
    expect(typeDeProduit('Feux LED antibrouillard et longue portée pour Triumph Tiger Sport 1050')?.cle).toBe('feux-additionnels')
    expect(typeDeProduit('Centrale de clignotants LED pour Harley-Davidson Fat Bob 1690')?.cle).toBe('centrale-clignotants')
    expect(typeDeProduit('Répétiteurs latéraux dynamiques LED pour Opel Corsa E')?.cle).toBe('repetiteurs')
  })
  it('laisse les packs d’ampoules tranquilles', () => {
    expect(typeDeProduit('Pack LED veilleuses pour Renault Clio IV')).toBeNull()
    expect(typeDeProduit('Pack ampoules effet xénon phares pour Volkswagen Golf 7')).toBeNull()
  })
  it('donne la seule photo du produit', () => {
    const produit = {
      slug: 'pack-led-antibrouillards-triumph-tiger-sport-1050',
      name: 'Feux LED antibrouillard et longue portée pour Triumph Tiger Sport 1050',
      vehicleType: 'MOTORCYCLE',
    }
    const images = imagesTypes(produit)
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('/images-types/produit-feux-additionnels.webp')
    expect(couvertureType(produit)?.url).toBe('/images-types/produit-feux-additionnels.webp')
  })
})
