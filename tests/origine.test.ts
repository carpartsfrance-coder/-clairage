import { describe, expect, it } from 'vitest'
import { origineDeLaRequete } from '../src/lib/origine'

/**
 * Derrière Render, `request.url` vaut « http://localhost:10000/… » : le retour
 * du premier paiement de test a renvoyé le client sur localhost.
 */
describe('origine publique d’une requête', () => {
  const requete = (entetes: Record<string, string>) =>
    new Request('http://localhost:10000/api/paiement/retour?order=x', { headers: entetes })

  it('suit l’hôte et le protocole transmis par le proxy', () => {
    expect(origineDeLaRequete(requete({ host: 'ledvroom.com', 'x-forwarded-proto': 'https' }))).toBe(
      'https://ledvroom.com',
    )
    expect(
      origineDeLaRequete(
        requete({ host: 'localhost:10000', 'x-forwarded-host': 'ledvroom.com', 'x-forwarded-proto': 'https, http' }),
      ),
    ).toBe('https://ledvroom.com')
  })

  it('garde le protocole de la requête faute d’en-tête de proxy (développement)', () => {
    expect(origineDeLaRequete(requete({ host: 'localhost:3400' }))).toBe('http://localhost:3400')
  })
})
