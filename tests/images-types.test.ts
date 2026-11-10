import { describe, expect, it } from 'vitest'
import { couvertureType, emplacementDeLaFiche, imagesTypes, imagesTypesPourLeFlux } from '../src/lib/images-types'

describe('images types par emplacement', () => {
  it("lit l'emplacement dans l'adresse de la fiche", () => {
    expect(emplacementDeLaFiche('pack-led-feux-de-recul-toyota-hilux-viii')).toBe('feux-de-recul')
    expect(emplacementDeLaFiche('pack-led-eclairage-de-plaque-dacia-duster-2')).toBe('eclairage-de-plaque')
    expect(emplacementDeLaFiche('pack-led-feux-de-route-audi-a3')).toBe('feux-de-route')
    expect(emplacementDeLaFiche('autre-chose')).toBeNull()
  })

  it('phares : avant/après, ampoules LED, route de nuit', () => {
    const images = imagesTypes({ slug: 'pack-led-phares-ford-fiesta-mk7', name: 'Pack LED phares pour Ford Fiesta' })
    expect(images.map((i) => i.url)).toEqual([
      '/images-types/phares-avant-apres.webp',
      '/images-types/produit-led-haute-puissance.webp',
      '/images-types/route-nuit.webp',
    ])
  })

  it("pas de route de nuit pour les antibrouillards ni pour l'effet xénon", () => {
    expect(imagesTypes({ slug: 'pack-led-antibrouillards-audi-a3', name: 'Pack LED antibrouillards' })[2].url).toBe('/images-types/antibrouillards-apres.webp')
    expect(imagesTypes({ slug: 'pack-led-phares-bmw-e90', name: 'Pack ampoules effet xénon phares' })[2].url).toBe('/images-types/phares-apres.webp')
  })

  it("effet xénon : la photo des ampoules halogènes, pas des LED", () => {
    const images = imagesTypes({ slug: 'pack-led-phares-bmw-serie-3-e90-e91', name: 'Pack ampoules effet xénon phares pour BMW Serie 3' })
    expect(images[1].url).toBe('/images-types/produit-effet-xenon.webp')
  })

  it('feux de route : les images des phares', () => {
    expect(imagesTypes({ slug: 'pack-led-feux-de-route-audi-a3', name: 'x' })[0].url).toBe('/images-types/phares-avant-apres.webp')
  })

  it('en couverture, les ampoules et jamais une voiture', () => {
    expect(couvertureType({ slug: 'pack-led-feux-de-recul-toyota-hilux-viii', name: 'Pack LED feux de recul' })?.url).toBe('/images-types/produit-led-p21w.webp')
    expect(couvertureType({ slug: 'pack-led-phares-bmw-e90', name: 'Pack ampoules effet xénon phares' })?.url).toBe('/images-types/produit-effet-xenon.webp')
  })

  it('moto : seulement la photo des ampoules, jamais une voiture', () => {
    const moto = { slug: 'pack-led-phares-kawasaki-z750', name: 'Pack LED phares', vehicleType: 'MOTORCYCLE' }
    expect(imagesTypes(moto).map((i) => i.url)).toEqual(['/images-types/produit-led-haute-puissance.webp'])
    expect(couvertureType(moto)?.url).toBe('/images-types/produit-led-haute-puissance.webp')
  })

  it("Google Shopping : seulement la photo produit (ni texte ni filigrane)", () => {
    expect(imagesTypesPourLeFlux({ slug: 'pack-led-veilleuses-audi-a3', name: 'Pack LED veilleuses' })).toEqual([
      '/images-types/produit-led-w5w.webp',
    ])
    expect(imagesTypesPourLeFlux({ slug: 'pack-led-phares-audi-a3', name: 'Pack LED phares' })).toEqual([
      '/images-types/produit-led-haute-puissance.webp',
    ])
  })
})
