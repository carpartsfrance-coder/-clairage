import { describe, expect, it } from 'vitest'
import {
  altSansReference,
  contientUneReference,
  ficheSansReferences,
  retirerLesReferences,
} from '@/lib/sans-reference'

describe('sans-reference', () => {
  it('repère les désignations d’ampoules et de culots', () => {
    for (const texte of [
      'Kit Xénon HID H1 35W Slim Canbus Pro',
      'Ampoule LED W5W 12 V',
      'LED T10 Quad',
      'Culot BA9S',
      'Ampoules D1S',
      'Ampoule P21/5W',
      'Boîtiers anti-erreur pour kit H7',
      'Kit HB4 9006',
    ]) {
      expect(contientUneReference(texte), texte).toBe(true)
    }
  })

  it('laisse les véhicules, les années et les teintes', () => {
    for (const texte of [
      'Gros plan sur une Opel Corsa E (2015–2019) — phares en ampoules effet xénon.',
      'Volkswagen Transporter T5',
      'BMW Série 3 G20',
      'Blanc pur 6 000 K',
      'Kit LED 35W',
      'Pack LED habitacle pour Audi A3 8V — les ampoules',
    ]) {
      expect(contientUneReference(texte), texte).toBe(false)
    }
  })

  it('retire la référence et nettoie ce qu’elle laisse', () => {
    expect(retirerLesReferences('Kit Xénon HID H1 35W Slim Canbus Pro – 4300K')).toBe(
      'Kit Xénon HID 35W Slim Canbus Pro – 4300K',
    )
    expect(retirerLesReferences('Boîtiers anti-erreur ODB pour Kit LED Haute Puissance H7')).toBe(
      'Boîtiers anti-erreur ODB pour Kit LED Haute Puissance',
    )
    expect(retirerLesReferences('LED T10 Quad – Blanc – W5W')).toBe('LED Quad – Blanc')
  })

  it('remplace un texte alternatif qui nomme une ampoule, garde les autres', () => {
    const repli = 'Kit xénon pour Audi A3 8V — visuel d’illustration'
    expect(altSansReference('Kit Xénon HID H1 35W Slim Canbus Pro', repli)).toBe(repli)
    expect(altSansReference('Gros plan sur une Audi A3 8V', repli)).toBe('Gros plan sur une Audi A3 8V')
    expect(altSansReference('', repli)).toBe(repli)
    expect(altSansReference(null, repli)).toBe(repli)
  })
})


describe('ficheSansReferences', () => {
  const fiche = {
    name: 'Kit xénon pour Audi A3 8V',
    slug: 'kit-xenon-audi-a3-8v',
    bulbBase: 'H1',
    specs: [
      { label: 'Culot', value: 'H1' },
      { label: 'Température de couleur', value: '6 000 K' },
      { label: 'Contenu', value: '2 ampoules H1 et 2 ballasts' },
    ],
    gallery: [
      { url: '/a.webp', alt: 'Kit Xénon HID H1 35W Slim Canbus Pro' },
      { url: '/b.webp', alt: 'Gros plan sur une Audi A3 8V' },
    ],
    variants: [
      {
        name: 'Kit H1 6000K',
        components: [{ productName: 'Ampoule xénon H1', variantName: 'H1 6000K' }],
        missingAccessories: [{ productName: 'Boîtiers anti-erreur pour Kit LED H1', variantName: 'La paire' }],
        image: { url: '/c.webp', alt: 'Ampoule H1' },
        imageAllumee: null,
      },
    ],
    optionalAddons: [
      { name: 'Résistance H8 / H11 anti-ODB', tagline: null, variantName: 'La paire', image: null },
    ],
  }

  it('ne laisse aucune désignation d’ampoule dans ce qui s’affiche', () => {
    const propre = ficheSansReferences(fiche)
    expect(contientUneReference(JSON.stringify(propre))).toBe(false)
    expect(propre.bulbBase).toBeNull()
    expect(propre.specs).toEqual([{ label: 'Température de couleur', value: '6 000 K' }])
    expect(propre.gallery.map((v) => v.alt)).toEqual([
      'Kit xénon pour Audi A3 8V — visuel d’illustration',
      'Gros plan sur une Audi A3 8V',
    ])
    expect(propre.variants[0].components[0].productName).toBe('Ampoule xénon')
    expect(propre.optionalAddons[0].name).toBe('Résistance anti-ODB')
  })

  it('ne touche pas au reste de la fiche', () => {
    const propre = ficheSansReferences(fiche)
    expect(propre.slug).toBe('kit-xenon-audi-a3-8v')
    expect(propre.gallery[0].url).toBe('/a.webp')
  })
})
