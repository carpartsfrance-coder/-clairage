import { describe, expect, it } from 'vitest'
import {
  attendReponse,
  cheminPropre,
  doitAlerterEquipe,
  doitRelayerParEmail,
  emailValide,
  EQUIPE_PRESENTE_MS,
  jetonPropre,
  lirePanier,
  nettoyerMessage,
  PRESENCE_MS,
  RAPPEL_ALERTE_MS,
  slugPropre,
  visiteurPresent,
} from '@/lib/chat'

const t0 = new Date('2026-11-19T20:00:00Z')
const plus = (ms: number) => new Date(t0.getTime() + ms)

describe('discussion — ce qu’on accepte du navigateur', () => {
  it('nettoie un message sans en changer le sens', () => {
    expect(nettoyerMessage('  Bonjour,\r\n\r\n\r\n\r\nça va sur ma Clio ?  ')).toBe(
      'Bonjour,\n\nça va sur ma Clio ?',
    )
    expect(nettoyerMessage('a\t \t b')).toBe('a b')
  })

  it('refuse un message vide ou qui n’est pas du texte', () => {
    expect(nettoyerMessage('   \n  ')).toBeNull()
    expect(nettoyerMessage(42)).toBeNull()
    expect(nettoyerMessage(undefined)).toBeNull()
  })

  it('coupe un message trop long', () => {
    expect(nettoyerMessage('x'.repeat(5000))?.length).toBe(1000)
    expect(nettoyerMessage('x'.repeat(5000), 4000)?.length).toBe(4000)
  })

  it('n’accepte qu’une adresse plausible, ramenée en minuscules', () => {
    expect(emailValide(' Client@Exemple.FR ')).toBe('client@exemple.fr')
    expect(emailValide('client@exemple')).toBeNull()
    expect(emailValide('pas une adresse')).toBeNull()
    expect(emailValide(`${'a'.repeat(160)}@exemple.fr`)).toBeNull()
  })

  it('garde le chemin de la page, sans paramètres de publicité', () => {
    expect(cheminPropre('/p/kit-led-h7?gclid=abc#avis')).toBe('/p/kit-led-h7')
    expect(cheminPropre('https://ailleurs.fr/p/x')).toBeNull()
    expect(cheminPropre('//ailleurs.fr')).toBeNull()
    expect(cheminPropre('/admin/discussions')).toBeNull()
    expect(cheminPropre('/api/chat')).toBeNull()
  })

  it('n’accepte qu’un identifiant de fiche bien formé', () => {
    expect(slugPropre('kit-led-h7-blanc-pur-6000k')).toBe('kit-led-h7-blanc-pur-6000k')
    expect(slugPropre('../admin')).toBeNull()
    expect(slugPropre('Kit LED')).toBeNull()
  })

  it('n’accepte que des jetons de la forme fabriquée par le serveur', () => {
    expect(jetonPropre('A'.repeat(32))).toBe('A'.repeat(32))
    expect(jetonPropre('A'.repeat(31))).toBeNull()
    expect(jetonPropre(`${'A'.repeat(31)}/`)).toBeNull()
    expect(jetonPropre(null)).toBeNull()
  })
})

describe('discussion — qui prévenir, et comment', () => {
  it('prévient l’équipe au premier message', () => {
    expect(doitAlerterEquipe({ alertedAt: null, staffReadAt: null }, t0)).toBe(true)
  })

  it('ne relance pas l’équipe à chaque message d’une même salve', () => {
    expect(doitAlerterEquipe({ alertedAt: t0, staffReadAt: null }, plus(60_000))).toBe(false)
  })

  it('relance l’équipe si l’alerte précédente n’a pas été lue à temps', () => {
    expect(doitAlerterEquipe({ alertedAt: t0, staffReadAt: null }, plus(RAPPEL_ALERTE_MS))).toBe(true)
  })

  it('prévient de nouveau quand le visiteur relance une discussion déjà lue', () => {
    expect(
      doitAlerterEquipe({ alertedAt: t0, staffReadAt: plus(60_000) }, plus(10 * 60_000)),
    ).toBe(true)
  })

  it('se tait quand l’équipe a la discussion sous les yeux', () => {
    const lu = plus(5 * 60_000)
    expect(doitAlerterEquipe({ alertedAt: t0, staffReadAt: lu }, plus(5 * 60_000 + 5_000))).toBe(false)
    expect(doitAlerterEquipe({ alertedAt: null, staffReadAt: t0 }, plus(EQUIPE_PRESENTE_MS - 1))).toBe(
      false,
    )
  })

  it('considère le visiteur présent tant que sa page relit la discussion', () => {
    expect(visiteurPresent(t0, plus(PRESENCE_MS - 1))).toBe(true)
    expect(visiteurPresent(t0, plus(PRESENCE_MS))).toBe(false)
    expect(visiteurPresent(null, t0)).toBe(false)
  })

  it('n’envoie la réponse par e-mail qu’au visiteur parti qui a laissé son adresse', () => {
    const parti = { email: 'client@exemple.fr', customerSeenAt: t0 }
    expect(doitRelayerParEmail(parti, plus(PRESENCE_MS + 1))).toBe(true)
    expect(doitRelayerParEmail(parti, plus(1_000))).toBe(false)
    expect(doitRelayerParEmail({ email: null, customerSeenAt: t0 }, plus(PRESENCE_MS + 1))).toBe(false)
  })

  it('sait quand une discussion attend une réponse', () => {
    expect(attendReponse([{ authorKind: 'staff' }, { authorKind: 'customer' }])).toBe(true)
    expect(attendReponse([{ authorKind: 'customer' }, { authorKind: 'staff' }])).toBe(false)
    expect(attendReponse([])).toBe(false)
  })

  it('relit un panier enregistré sans faire confiance à sa forme', () => {
    expect(
      lirePanier([
        { produit: 'Kit LED H7', option: 'La paire', quantite: 1, prixCents: 4990 },
        { produit: 42 },
        null,
        'texte',
      ]),
    ).toEqual([{ produit: 'Kit LED H7', option: 'La paire', quantite: 1, prixCents: 4990 }])
    expect(lirePanier(null)).toEqual([])
  })
})
