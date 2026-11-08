import { describe, expect, it } from 'vitest'
import { motsDeRecherche } from '../src/lib/recherche-mots'

describe('mots de recherche', () => {
  it('ignore les mots vides et cherche le chiffre aussi en romain', () => {
    expect(motsDeRecherche('clio 4 veilleuses')).toEqual([['clio'], ['4', ' IV'], ['veilleuses']])
    expect(motsDeRecherche('Ampoule LED golf 7')).toEqual([['golf'], ['7', ' VII']])
    expect(motsDeRecherche('led 308')).toEqual([['308']])
  })
  it('synonymes courants', () => {
    expect(motsDeRecherche('plafonnier 208')).toEqual([['habitacle', 'plafonnier'], ['208']])
    expect(motsDeRecherche('xenon vw golf')).toEqual([['xénon', 'xenon'], ['volkswagen'], ['golf']])
  })
  it('rien d’utile : liste vide (la phrase est gardée par l’appelant)', () => {
    expect(motsDeRecherche('ampoule led')).toEqual([])
  })
  it('une référence reste un seul mot', () => {
    expect(motsDeRecherche('LUM-PK-REVE-TOYOTA')).toEqual([['lum-pk-reve-toyota']])
    expect(motsDeRecherche('H7')).toEqual([['h7']])
  })
})
