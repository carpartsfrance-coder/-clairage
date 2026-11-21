import { describe, expect, it } from 'vitest'
import { remiseAffichee } from '@/lib/remise'

describe('remiseAffichee', () => {
  it('affiche un palier rond, arrondi vers le bas', () => {
    expect(remiseAffichee(810, 1090)).toBe(25) // 25,7 %
    expect(remiseAffichee(844, 1090)).toBe(20) // 22,6 %, l'ancien « −23 % »
    expect(remiseAffichee(7590, 9290)).toBe(15) // 18,3 %
  })

  it('tombe juste sur le palier sans erreur de flottant', () => {
    expect(remiseAffichee(800, 1000)).toBe(20)
    expect(remiseAffichee(750, 1000)).toBe(25)
    expect(remiseAffichee(7120, 8900)).toBe(20)
  })

  it("n'annonce rien sans remise réelle d'au moins 5 %", () => {
    expect(remiseAffichee(1000, null)).toBeNull()
    expect(remiseAffichee(1000, undefined)).toBeNull()
    expect(remiseAffichee(1000, 1000)).toBeNull()
    expect(remiseAffichee(1000, 900)).toBeNull()
    expect(remiseAffichee(990, 1030)).toBeNull() // 3,9 %
  })

  it('ne dépasse jamais la remise réelle', () => {
    for (let barre = 50; barre <= 20000; barre += 37) {
      for (let prix = 1; prix < barre; prix += 53) {
        const affichee = remiseAffichee(prix, barre)
        if (affichee === null) continue
        expect(affichee % 5).toBe(0)
        expect(prix).toBeLessThanOrEqual(Math.round((barre * (100 - affichee)) / 100))
      }
    }
  })
})
