import { describe, expect, it } from 'vitest'
import { addonsProposables } from '../src/lib/addons'

/**
 * Un complément déjà inclus dans le conditionnement retenu ne doit pas être
 * proposé à l'achat : le client paierait deux fois la même pièce.
 */
describe('addonsProposables', () => {
  const complements = [
    { slug: 'adaptateur-de-fixation-h7', name: 'Adaptateur de fixation H7' },
    { slug: 'pack-led-habitacle', name: 'Pack LED habitacle' },
    { slug: 'decodeur-anti-erreur-h7', name: 'Décodeur anti-erreur H7' },
  ]

  it('retire ce que le conditionnement fournit déjà', () => {
    const proposables = addonsProposables(complements, [
      'adaptateur-de-fixation-h7',
      'decodeur-anti-erreur-h7',
    ])
    expect(proposables.map((c) => c.slug)).toEqual(['pack-led-habitacle'])
  })

  it('laisse tout quand le conditionnement ne fournit rien', () => {
    expect(addonsProposables(complements, [])).toHaveLength(3)
  })

  it("rend la liste vide quand tout est inclus — l'appelant n'affiche alors pas la section", () => {
    const tout = complements.map((c) => c.slug)
    expect(addonsProposables(complements, tout)).toEqual([])
  })

  it('rapproche par produit, pas par référence de variante', () => {
    // Le pack inclut l'adaptateur en paire ; la fiche complément le vend à
    // l'unité. C'est le même accessoire, il ne doit pas être revendu.
    const proposables = addonsProposables(complements, ['adaptateur-de-fixation-h7'])
    expect(proposables.map((c) => c.slug)).not.toContain('adaptateur-de-fixation-h7')
  })
})
