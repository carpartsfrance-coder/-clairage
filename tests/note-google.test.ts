import { describe, expect, it } from 'vitest'
import { avisGoogle, noteGoogle } from '../src/lib/identity'

/*
 * Une note affichée au client est une affirmation commerciale : elle doit
 * rester vraie et vérifiable. Ces contrôles ne vérifient pas SA valeur — elle
 * change quand l'exploitant la relève — mais qu'elle reste une note plausible,
 * datée, et écrite comme un francophone l'écrit.
 */
describe('la note Google affichée en boutique', () => {
  it('s’écrit à la française, avec une seule décimale', () => {
    const note = noteGoogle()
    if (avisGoogle.note === null) {
      expect(note).toBeNull()
      return
    }
    expect(note).toMatch(/^[0-5],\d$/)
  })

  it('reste dans les bornes d’une note sur 5', () => {
    if (avisGoogle.note === null) return
    expect(avisGoogle.note).toBeGreaterThan(0)
    expect(avisGoogle.note).toBeLessThanOrEqual(5)
  })

  it('porte la date de son relevé, et un nombre d’avis entier ou rien', () => {
    expect(avisGoogle.releveLe).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    if (avisGoogle.nombre === null) return
    expect(Number.isInteger(avisGoogle.nombre)).toBe(true)
    expect(avisGoogle.nombre).toBeGreaterThan(0)
  })
})
