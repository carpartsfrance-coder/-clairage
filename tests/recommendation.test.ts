import { describe, expect, it } from 'vitest'
import {
  recommendPackaging,
  recommendationReason,
  type PackagingCandidate,
} from '../src/lib/recommendation'

/**
 * La règle de recommandation était écrite trois fois, et les trois versions se
 * contredisaient : les résultats véhicule conseillaient les ampoules seules
 * tout en disant que les accessoires n'étaient pas inclus, la fiche
 * recommandait le kit. Ces cas fixent la règle unique.
 */

const candidat = (over: Partial<PackagingCandidate> = {}): PackagingCandidate => ({
  id: 'ampoules',
  priceCents: 6990,
  status: 'CONFIRMED',
  purchasable: true,
  missingRequired: 0,
  ...over,
})

const ampoulesSeules = candidat({ id: 'ampoules', priceCents: 6990, missingRequired: 2 })
const kitComplet = candidat({ id: 'kit', priceCents: 9990, missingRequired: 0 })

describe('recommendPackaging', () => {
  it('préfère le conditionnement autonome, même plus cher', () => {
    expect(recommendPackaging([ampoulesSeules, kitComplet])?.id).toBe('kit')
  })

  it('préfère le moins cher quand aucun accessoire n’est nécessaire', () => {
    const sansAccessoire = candidat({ id: 'ampoules', priceCents: 6990, missingRequired: 0 })
    expect(recommendPackaging([sansAccessoire, kitComplet])?.id).toBe('ampoules')
  })

  it('ne conseille rien sans compatibilité confirmée', () => {
    const inconnus = [
      candidat({ id: 'ampoules', status: 'UNKNOWN' }),
      candidat({ id: 'kit', status: 'UNKNOWN', priceCents: 9990 }),
    ]
    expect(recommendPackaging(inconnus)).toBeNull()
  })

  it('écarte un conditionnement incompatible', () => {
    const result = recommendPackaging([
      candidat({ id: 'kit', priceCents: 9990, status: 'INCOMPATIBLE' }),
      candidat({ id: 'ampoules', priceCents: 6990 }),
    ])
    expect(result?.id).toBe('ampoules')
  })

  it('écarte un conditionnement en rupture', () => {
    const result = recommendPackaging([
      candidat({ id: 'ampoules', priceCents: 6990, purchasable: false }),
      kitComplet,
    ])
    expect(result?.id).toBe('kit')
  })

  it('retombe sur le prix quand aucun conditionnement n’est autonome', () => {
    const result = recommendPackaging([
      candidat({ id: 'ampoules', priceCents: 6990, missingRequired: 2 }),
      candidat({ id: 'kit', priceCents: 9990, missingRequired: 1 }),
    ])
    expect(result?.id).toBe('ampoules')
  })

  it('ne conseille rien quand la liste est vide', () => {
    expect(recommendPackaging([])).toBeNull()
  })

  it('reste déterministe à prix égal', () => {
    const a = candidat({ id: 'a', priceCents: 9990 })
    const b = candidat({ id: 'b', priceCents: 9990 })
    expect(recommendPackaging([a, b])?.id).toBe('a')
    expect(recommendPackaging([b, a])?.id).toBe('b')
  })
})

describe('recommendationReason', () => {
  it('explique le conseil quand un autre conditionnement est incomplet', () => {
    expect(recommendationReason(kitComplet, [ampoulesSeules, kitComplet])).toBe(
      'Contient les accessoires exigés par ce montage',
    )
  })

  it('n’explique rien quand le conseil tient au seul prix', () => {
    const moinsCher = candidat({ id: 'ampoules', priceCents: 6990 })
    expect(recommendationReason(moinsCher, [moinsCher, kitComplet])).toBeNull()
  })

  it('n’explique rien quand le conseillé est lui-même incomplet', () => {
    const result = recommendationReason(ampoulesSeules, [ampoulesSeules])
    expect(result).toBeNull()
  })
})
