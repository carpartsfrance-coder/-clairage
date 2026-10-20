import { describe, expect, it } from 'vitest'
import { alertesAEnvoyer } from '../src/lib/stock-alerts'

/**
 * La règle d'envoi : une alerte part quand sa référence est redevenue
 * commandable, et seulement là.
 */
describe('alertesAEnvoyer', () => {
  const alertes = [
    { id: 'a1', variantId: 'v-dispo' },
    { id: 'a2', variantId: 'v-rupture' },
    { id: 'a3', variantId: 'v-decouvert' },
    { id: 'a4', variantId: 'v-inconnu' },
  ]

  const stock = new Map<string, number | null>([
    ['v-dispo', 3],
    ['v-rupture', 0],
    // `null` : vente à découvert ouverte, la référence est commandable.
    ['v-decouvert', null],
  ])

  it('envoie quand du stock est revenu', () => {
    expect(alertesAEnvoyer(alertes, stock).map((a) => a.id)).toContain('a1')
  })

  it("n'envoie rien tant que la référence est en rupture", () => {
    expect(alertesAEnvoyer(alertes, stock).map((a) => a.id)).not.toContain('a2')
  })

  it('envoie quand la vente à découvert est ouverte : la référence est commandable', () => {
    expect(alertesAEnvoyer(alertes, stock).map((a) => a.id)).toContain('a3')
  })

  it("n'envoie rien pour une variante dont l'état n'a pas pu être lu", () => {
    // Mieux vaut un message en retard qu'un message faux : sans état connu,
    // on laisse l'alerte en attente pour le passage suivant.
    expect(alertesAEnvoyer(alertes, stock).map((a) => a.id)).not.toContain('a4')
  })

  it('ne retient que les alertes concernées', () => {
    expect(alertesAEnvoyer(alertes, stock).map((a) => a.id)).toEqual(['a1', 'a3'])
  })
})
