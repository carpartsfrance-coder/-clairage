import { describe, expect, it } from 'vitest'
import { leVehicule, typeDeProduit } from '../src/lib/types-produit'
import { nomAvecPeriode } from '../src/lib/seo-fiche'
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

describe('leVehicule', () => {
  it('élide devant une voyelle seulement', () => {
    expect(leVehicule('Audi A3 (2012–2020)')).toBe('l’Audi A3 (2012–2020)')
    expect(leVehicule('Toyota Hilux 8')).toBe('le Toyota Hilux 8')
    expect(leVehicule('Hyundai Tucson')).toBe('le Hyundai Tucson')
  })
  it('dit « la » devant une moto, sans élision devant H ou Y', () => {
    expect(leVehicule('Yamaha YZF-R6 600 (2006–2007)', true)).toBe('la Yamaha YZF-R6 600 (2006–2007)')
    expect(leVehicule('Honda CBR 1000 RR', true)).toBe('la Honda CBR 1000 RR')
    expect(leVehicule('Harley-Davidson Fat Bob 1690', true)).toBe('la Harley-Davidson Fat Bob 1690')
    expect(leVehicule('Aprilia RS 125', true)).toBe('l’Aprilia RS 125')
  })
})

describe('nomAvecPeriode', () => {
  it('ajoute les années, sauf si le nom les porte déjà', () => {
    expect(nomAvecPeriode('Centrale de clignotants LED pour Yamaha YZF-R6 600', 2006, 2007)).toBe(
      'Centrale de clignotants LED pour Yamaha YZF-R6 600 (2006–2007)',
    )
    expect(nomAvecPeriode('Kit xénon HID pour Honda CB 500', 2019, null)).toBe(
      'Kit xénon HID pour Honda CB 500 (depuis 2019)',
    )
    expect(nomAvecPeriode('Pack LED phares pour Ford Focus 2008', 2008, 2011)).toBe('Pack LED phares pour Ford Focus 2008')
  })
})
