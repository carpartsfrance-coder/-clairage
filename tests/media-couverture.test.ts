import { describe, expect, it } from 'vitest'
import { ARGS_COUVERTURE, couverture } from '../src/lib/media-couverture'

/**
 * Choix du visuel de couverture.
 *
 * Ce que ces tests protègent : **la carte montre le feu allumé, pas le culot**.
 * C'est le seul visuel que voit un client qui parcourt le catalogue, et il
 * décide s'il ouvre la fiche. Une erreur ici ne casse rien — elle remet
 * simplement partout le packshot que l'on vient d'écarter.
 */

const rendu = { role: 'RESULT', media: { url: 'rendu.jpg' } }
const produit = { role: 'PRODUCT', media: { url: 'produit.jpg' } }
const kit = { role: 'KIT_CONTENT', media: { url: 'kit.jpg' } }

describe('couverture', () => {
  it('préfère le rendu au visuel produit', () => {
    expect(couverture([produit, rendu])).toBe(rendu)
  })

  it('ne dépend pas de l’ordre d’arrivée', () => {
    expect(couverture([rendu, produit])).toBe(rendu)
  })

  it('reprend le visuel produit quand il n’y a pas de rendu', () => {
    expect(couverture([produit])).toBe(produit)
  })

  it('garde le premier de son rôle, donc la position la plus basse', () => {
    const premier = { role: 'RESULT', media: { url: 'gros-plan.jpg' } }
    const second = { role: 'RESULT', media: { url: 'comparatif.jpg' } }
    expect(couverture([premier, second])).toBe(premier)
  })

  it('ignore les rôles qui ne représentent pas le produit', () => {
    // Le contenu d'un kit et une photo de montage ne sont pas des couvertures.
    expect(couverture([kit])).toBeUndefined()
  })

  it('ne renvoie rien sur une fiche sans visuel', () => {
    expect(couverture([])).toBeUndefined()
  })
})

describe('ARGS_COUVERTURE', () => {
  it('ne ramène que les deux rôles de couverture', () => {
    expect([...ARGS_COUVERTURE.where.role.in].sort()).toEqual(['PRODUCT', 'RESULT'])
  })

  it('en ramène assez pour que le rendu puisse l’emporter', () => {
    // Avec take: 1 trié par position, un visuel produit en position 0 sortirait
    // seul et le rendu ne serait jamais vu.
    expect(ARGS_COUVERTURE.take).toBeGreaterThan(1)
  })
})
