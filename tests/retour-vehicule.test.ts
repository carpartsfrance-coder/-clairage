import { describe, expect, it } from 'vitest'
import { retourApresChoix } from '@/lib/retour-vehicule'

describe('retourApresChoix', () => {
  it('accepte une fiche produit ou une catégorie', () => {
    expect(retourApresChoix('/p/pack-led-phares-opel-corsa-e')).toBe('/p/pack-led-phares-opel-corsa-e')
    expect(retourApresChoix('/c/veilleuses')).toBe('/c/veilleuses')
  })

  it("renvoie aux résultats depuis l'accueil ou une page de packs", () => {
    expect(retourApresChoix('/')).toBeNull()
    expect(retourApresChoix('/packs/auto/dacia/duster/duster')).toBeNull()
    expect(retourApresChoix('/vehicule/resultats')).toBeNull()
  })

  it("n'ouvre jamais de redirection vers un autre site", () => {
    expect(retourApresChoix('//exemple.com/p/x')).toBeNull()
    expect(retourApresChoix('https://exemple.com/p/x')).toBeNull()
    expect(retourApresChoix('/p/x?suite=https://exemple.com')).toBeNull()
    expect(retourApresChoix('/p/../admin')).toBeNull()
    expect(retourApresChoix('/p/X')).toBeNull()
    expect(retourApresChoix('/p/')).toBeNull()
  })

  it('ignore tout ce qui n’est pas une chaîne', () => {
    expect(retourApresChoix(undefined)).toBeNull()
    expect(retourApresChoix(null)).toBeNull()
    expect(retourApresChoix(['/p/x'])).toBeNull()
  })
})
