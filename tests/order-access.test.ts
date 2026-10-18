import { describe, expect, it } from 'vitest'
import { accessTokenFrom, canViewOrder } from '../src/lib/order-access'

/**
 * Contrôle d'accès aux commandes.
 *
 * Ce que ces tests protègent : les identifiants de commande circulent dans les
 * URL de retour du prestataire, les journaux serveur et l'historique du
 * navigateur. Sans jeton, les connaître suffirait à lire l'adresse, le
 * téléphone et le montant d'un client.
 */

const guestOrder = { guestToken: 'jeton-valide-aaaaaaaaaaaa', userId: null }

describe('canViewOrder', () => {
  it('accepte le bon jeton', () => {
    expect(canViewOrder(guestOrder, 'jeton-valide-aaaaaaaaaaaa')).toBe(true)
  })

  it('refuse un jeton absent', () => {
    expect(canViewOrder(guestOrder, null)).toBe(false)
  })

  it('refuse un jeton faux de même longueur', () => {
    expect(canViewOrder(guestOrder, 'jeton-faux--aaaaaaaaaaaaa')).toBe(false)
  })

  it('refuse un préfixe correct', () => {
    expect(canViewOrder(guestOrder, 'jeton-valide')).toBe(false)
  })

  it("refuse quand la commande n'a aucun jeton", () => {
    expect(canViewOrder({ guestToken: null, userId: null }, 'nimporte')).toBe(false)
  })

  it('laisse passer le propriétaire connecté, sans jeton', () => {
    const owned = { guestToken: null, userId: 'user-1' }
    expect(canViewOrder(owned, null, 'user-1')).toBe(true)
    expect(canViewOrder(owned, null, 'user-2')).toBe(false)
  })
})

describe('accessTokenFrom', () => {
  it('lit un paramètre simple', () => {
    expect(accessTokenFrom({ t: 'abc' })).toBe('abc')
  })

  it('lit le premier élément quand le paramètre est répété', () => {
    // ?t=a&t=b : Next renvoie un tableau. Prendre le premier évite qu'un
    // paramètre ajouté après coup contourne le contrôle.
    expect(accessTokenFrom({ t: ['abc', 'def'] })).toBe('abc')
  })

  it('renvoie null quand il manque ou qu’il est vide', () => {
    expect(accessTokenFrom({})).toBeNull()
    expect(accessTokenFrom({ t: '' })).toBeNull()
    expect(accessTokenFrom(undefined)).toBeNull()
  })
})
