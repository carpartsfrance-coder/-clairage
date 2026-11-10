import { describe, expect, it } from 'vitest'
import {
  cheminSansIdentifiant,
  libelleSansDonneePerso,
  sourceDeLaVisite,
} from '../src/lib/mesure-chemins'

const origine = 'https://ledvroom.com'
const source = (query: string, referrer = '') =>
  sourceDeLaVisite(new URLSearchParams(query), referrer, origine)

describe('mesure d’audience : rien qui désigne quelqu’un', () => {
  it('retire les identifiants des chemins', () => {
    expect(cheminSansIdentifiant('/commande/cmwbaoec10005im296lrwf4xr/confirmation')).toBe(
      '/commande/…/confirmation',
    )
    expect(cheminSansIdentifiant('/commande/abc/paiement')).toBe('/commande/…/paiement')
    expect(cheminSansIdentifiant('/compte/commandes/abc')).toBe('/compte/commandes/…')
    expect(cheminSansIdentifiant('/documents/abc')).toBe('/documents/…')
    expect(cheminSansIdentifiant('/mot-de-passe-oublie/jeton-secret')).toBe('/mot-de-passe-oublie/…')
    // Le tunnel de commande lui-même et les pages du catalogue ne changent pas.
    expect(cheminSansIdentifiant('/commande')).toBe('/commande')
    expect(cheminSansIdentifiant('/mot-de-passe-oublie')).toBe('/mot-de-passe-oublie')
    expect(cheminSansIdentifiant('/p/pack-led-plaque-dacia-duster')).toBe('/p/pack-led-plaque-dacia-duster')
    // Une seconde passe ne change rien.
    expect(cheminSansIdentifiant('/commande/…/confirmation')).toBe('/commande/…/confirmation')
  })

  it('efface les textes cliqués personnels', () => {
    expect(libelleSansDonneePerso('/', 'contact@ledvroom.com')).toBeUndefined()
    expect(libelleSansDonneePerso('/commande', '12 rue des Lilas, 75011 Paris')).toBeUndefined()
    expect(libelleSansDonneePerso('/compte/commandes', 'CMD-2026-00002')).toBeUndefined()
    expect(libelleSansDonneePerso('/commande', 'Continuer vers le paiement')).toBe('Continuer vers le paiement')
    expect(libelleSansDonneePerso('/commande', 'Colissimo 5,90 €')).toBe('Colissimo 5,90 €')
    // Sur le catalogue, les années des véhicules restent.
    expect(libelleSansDonneePerso('/packs/auto/peugeot', 'Peugeot 208 (2012–2019)')).toBe(
      'Peugeot 208 (2012–2019)',
    )
    expect(libelleSansDonneePerso('/', undefined)).toBeUndefined()
  })
})

describe('mesure d’audience : provenance de la visite', () => {
  it('reconnaît les clics de publicité', () => {
    expect(source('gclid=abc')).toBe('google (publicité)')
    expect(source('gbraid=abc')).toBe('google (publicité)')
    expect(source('wbraid=abc')).toBe('google (publicité)')
    expect(source('gad_source=1')).toBe('google (publicité)')
    expect(source('msclkid=abc')).toBe('bing (publicité)')
    expect(source('fbclid=abc')).toBe('facebook / instagram')
  })

  it('préfère les repères utm, puis la page précédente', () => {
    expect(source('utm_source=newsletter&utm_campaign=noel&gclid=x')).toBe('newsletter / noel')
    expect(source('', 'https://www.google.com/')).toBe('google.com')
    expect(source('', 'https://ledvroom.com/p/x')).toBe('direct')
    expect(source('', '')).toBe('direct')
    expect(source('', 'pas une adresse')).toBe('direct')
  })
})
