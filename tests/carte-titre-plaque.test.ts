import { describe, expect, it } from 'vitest'
import { presentationDeCarte } from '@/lib/carte-titre'

/*
  Ampoules ou modules complets de plaque : les deux familles se suivent sous
  « Éclairage de plaque ». Une règle trop large qui les confondrait ferait
  disparaître ce qui les distingue (relecture du 17 novembre 2026).
*/
describe('cartes d’éclairage de plaque', () => {
  it('« Pack LED éclairage de plaque » : des ampoules, boîtiers conservés', () => {
    expect(presentationDeCarte('Pack LED éclairage de plaque pour Renault Clio 4', null)).toEqual({
      titre: 'Ampoules LED de plaque',
      phrase: 'Les ampoules seules : vos boîtiers d’origine restent en place.',
    })
  })

  it('« Pack ampoules LED plaque » : la même famille', () => {
    expect(presentationDeCarte('Pack ampoules LED plaque pour Dacia Duster 2', null).titre).toBe(
      'Ampoules LED de plaque',
    )
  })

  it('« Modules LED de plaque » : les boîtiers complets', () => {
    expect(presentationDeCarte('Modules LED de plaque pour Dacia Duster 2', null)).toEqual({
      titre: 'Modules LED de plaque',
      phrase: 'Les boîtiers complets, à clipser à la place de ceux d’origine.',
    })
  })
})
