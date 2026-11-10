import { describe, expect, it } from 'vitest'
import { estUneReferenceDAmpoule, motsDeRecherche } from '../src/lib/recherche-mots'

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

describe('estUneReferenceDAmpoule', () => {
  it('reconnaît une référence seule', () => {
    for (const saisie of ['h7', 'H4', 'ampoule h7', 'led W5W', 'p21w', 'kit led h11', 'HB3']) {
      expect(estUneReferenceDAmpoule(saisie)).toBe(true)
    }
  })
  it('laisse passer une recherche par véhicule', () => {
    for (const saisie of ['golf 7', 'clio 4 veilleuses', 'h7 golf 7', 'audi a3', 't5 transporter']) {
      expect(estUneReferenceDAmpoule(saisie)).toBe(false)
    }
  })
})

describe('années dans la recherche', () => {
  it('ignore une année quand un autre mot reste', () => {
    expect(motsDeRecherche('duster 2015')).toEqual([['duster']])
    expect(motsDeRecherche('duster 2015 led')).toEqual([['duster']])
  })
  it('garde une année tapée seule', () => {
    expect(motsDeRecherche('2015')).toEqual([['2015']])
  })
})
