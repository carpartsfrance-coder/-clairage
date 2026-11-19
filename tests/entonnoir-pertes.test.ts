import { describe, expect, it } from 'vitest'
import { pertesEntonnoir } from '../src/components/admin/statistiques/entonnoir'

const e = (n: number, partielle = false) => ({ n, partielle })

describe('pertes de l’entonnoir', () => {
  it('ne désigne pas une étape mesurée depuis peu (relevé du 19 novembre 2026)', () => {
    // Visites, fiche, ajout (partiel), panier, commande, validée (partielle), payée.
    const { pertes, pire } = pertesEntonnoir([e(174), e(126), e(0, true), e(2), e(0), e(0, true), e(0)])
    expect(pertes[2]).toBeNull()
    // Le panier se compare à la fiche, dernière étape complète avant lui.
    expect(pertes[3]).toEqual({ pct: 98, perdues: 124 })
    expect(pertes[4]).toEqual({ pct: 100, perdues: 2 })
    // −100 % sur 2 visites ne l'emporte pas sur −98 % sur 124.
    expect(pire).toBe(3)
  })

  it('compte une étape gestuelle quand elle couvre toute la période', () => {
    const { pertes, pire } = pertesEntonnoir([e(100), e(80), e(10), e(8)])
    expect(pertes[2]).toEqual({ pct: 88, perdues: 70 })
    expect(pire).toBe(2)
  })

  it('ne parle pas de perte quand une étape dépasse la précédente', () => {
    const { pertes } = pertesEntonnoir([e(10), e(0), e(3)])
    expect(pertes[2]).toBeNull()
  })

  it('départage deux pertes égales en visites par le pourcentage', () => {
    const { pire } = pertesEntonnoir([e(100), e(90), e(10), e(0)])
    // 10 perdues à −10 %, 80 à −89 %, 10 à −100 % : la plus grosse en visites gagne.
    expect(pire).toBe(2)
    const egal = pertesEntonnoir([e(20), e(10), e(0)])
    expect(egal.pire).toBe(2)
  })

  it('rien à désigner sans perte', () => {
    expect(pertesEntonnoir([e(0), e(0)]).pire).toBeNull()
  })
})
