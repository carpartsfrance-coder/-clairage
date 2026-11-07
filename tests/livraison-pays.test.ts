import { describe, expect, it } from 'vitest'
import {
  centimesEnEuros,
  codeDepuisLibelle,
  eurosEnCentimes,
  PAYS_EUROPE,
  paysDejaPris,
  trierLesPays,
} from '../src/lib/livraison-pays'

describe('pays de livraison', () => {
  it('couvre les 27 pays de l’UE, sans doublon', () => {
    expect(PAYS_EUROPE.filter((p) => p.ue)).toHaveLength(27)
    expect(new Set(PAYS_EUROPE.map((p) => p.code)).size).toBe(PAYS_EUROPE.length)
  })

  it('met la France en tête, puis l’ordre alphabétique', () => {
    expect(trierLesPays(['DE', 'FR', 'BE', 'AT']).map((p) => p.code)).toEqual(['FR', 'DE', 'AT', 'BE'])
  })

  it('refuse un pays déjà rattaché à une autre zone', () => {
    const zones = [
      { id: 'fr', label: 'France', countries: ['FR', 'MC'] },
      { id: 'eu', label: 'Europe', countries: ['BE', 'DE'] },
    ]
    expect(paysDejaPris(['BE', 'FR'], zones, 'eu')).toEqual([{ code: 'FR', zone: 'France' }])
    expect(paysDejaPris(['BE', 'DE', 'IT'], zones, 'eu')).toEqual([])
    expect(paysDejaPris(['MC'], zones, null)).toEqual([{ code: 'MC', zone: 'France' }])
  })
})

describe('saisie des prix', () => {
  it('lit les euros écrits à la française', () => {
    expect(eurosEnCentimes('5,90')).toBe(590)
    expect(eurosEnCentimes('5.9')).toBe(590)
    expect(eurosEnCentimes(' 80 € ')).toBe(8000)
    expect(eurosEnCentimes('0')).toBe(0)
    expect(eurosEnCentimes('')).toBeNull()
    expect(eurosEnCentimes('abc')).toBeNaN()
    expect(eurosEnCentimes('-3')).toBeNaN()
    expect(centimesEnEuros(590)).toBe('5,90')
    expect(centimesEnEuros(null)).toBe('')
  })

  it('tire un code technique du libellé', () => {
    expect(codeDepuisLibelle('Europe (UE)')).toBe('EUROPE-UE')
    expect(codeDepuisLibelle('Livraison à domicile')).toBe('LIVRAISON-A-DOMICILE')
    expect(codeDepuisLibelle('!!!')).toBe('ZONE')
  })
})
