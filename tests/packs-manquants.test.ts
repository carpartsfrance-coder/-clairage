import { describe, expect, it } from 'vitest'
import {
  POSITIONS,
  PRIX_SANS_PRECEDENT,
  enSlug,
  nomDuPack,
  prixCatalogue,
  skuDuPack,
  slugDuPack,
} from '../src/lib/admin/packs-manquants'

/**
 * Fabrication des packs manquants.
 *
 * Ce que ces tests protègent : **ces packs doivent être indiscernables de ceux
 * qui existent**. Ils se rangeront dans les mêmes rubriques, se chercheront par
 * les mêmes slugs et s'appareilleront aux photos par les mêmes clés. Un
 * intitulé qui diverge d'un mot, et le pack sort de sa famille sans que rien ne
 * le signale. Et un prix inventé ne se voit pas : il se facture.
 */

describe('enSlug', () => {
  it('retire les accents et les signes', () => {
    expect(enSlug('éclairage de plaque')).toBe('eclairage-de-plaque')
    expect(enSlug('feux de recul')).toBe('feux-de-recul')
    expect(enSlug('Classe C (W203)')).toBe('classe-c-w203')
  })
})

describe('slugDuPack', () => {
  it('reproduit la forme des packs existants', () => {
    expect(slugDuPack('PLATE', 'peugeot', '308-ii')).toBe(
      'pack-led-eclairage-de-plaque-peugeot-308-ii',
    )
    expect(slugDuPack('LOW_BEAM', 'volkswagen', 'polo-5-6r-6c1')).toBe(
      'pack-led-phares-volkswagen-polo-5-6r-6c1',
    )
    expect(slugDuPack('FOG', 'triumph', 'tiger-sport-1050')).toBe(
      'pack-led-antibrouillards-triumph-tiger-sport-1050',
    )
  })
})

describe('skuDuPack', () => {
  it('garde le gabarit maison, en majuscules', () => {
    const sku = skuDuPack('PLATE', 'mercedes-benz', 'classe-c-w203')
    expect(sku).toMatch(/^LUM-PK-PLAT-MERCEDES-BENZ-CLASSE-C-W203-[0-9A-F]{4}$/)
  })

  it('donne toujours le même SKU pour le même pack', () => {
    expect(skuDuPack('PLATE', 'mercedes-benz', 'classe-c-w203')).toBe(
      skuDuPack('PLATE', 'mercedes-benz', 'classe-c-w203'),
    )
  })

  it('sépare deux positions d’un même véhicule', () => {
    // Sans le morceau de position, les packs d'une même voiture entreraient en
    // collision sur la contrainte d'unicité du SKU.
    const a = skuDuPack('PLATE', 'mercedes-benz', 'classe-c-w203')
    const b = skuDuPack('LOW_BEAM', 'mercedes-benz', 'classe-c-w203')
    expect(a).not.toBe(b)
  })

  it('n’utilise pas le début du nom quand la maison en a décidé autrement', () => {
    // « phares » donne HEAD, pas PHAR : c'est le code des packs existants.
    expect(POSITIONS.LOW_BEAM.sku).toBe('HEAD')
    expect(skuDuPack('LOW_BEAM', 'bmw', 'serie-3-e90')).toContain('-HEAD-')
  })
})

describe('nomDuPack', () => {
  it('écrit le nom tel que le catalogue l’écrit déjà', () => {
    expect(nomDuPack('PLATE', 'Peugeot 308 II')).toBe(
      'Pack LED éclairage de plaque pour Peugeot 308 II',
    )
    expect(nomDuPack('INTERIOR_DOME', 'Mercedes-Benz Classe B (W245)')).toBe(
      'Pack LED habitacle pour Mercedes-Benz Classe B (W245)',
    )
  })

  it('reste dans les familles que le rangement par préfixe reconnaît', () => {
    // Le rangement en rubriques lit le début du nom ; un intitulé qui diverge
    // sortirait le pack de sa famille sans rien signaler.
    for (const position of Object.keys(POSITIONS) as Array<keyof typeof POSITIONS>) {
      expect(nomDuPack(position, 'Essai')).toMatch(/^Pack LED /)
    }
  })
})

describe('prixCatalogue', () => {
  const precedents = new Map([
    [1180, 1090],
    [2490, 2390],
  ])

  it('reprend le prix déjà décidé pour ce prix source', () => {
    expect(prixCatalogue(1180, precedents)).toBe(1090)
    expect(prixCatalogue(2490, precedents)).toBe(2390)
  })

  it('applique les quatre décisions prises à part', () => {
    expect(prixCatalogue(10980, precedents)).toBe(10490)
    expect(prixCatalogue(480, precedents)).toBe(390)
  })

  it('préfère le précédent à la décision à part, s’il y en a un', () => {
    expect(prixCatalogue(1180, new Map([[1180, 999]]))).toBe(999)
  })

  it('ne devine jamais un prix', () => {
    // Un prix inventé ne se voit pas à l'écran : il se facture.
    expect(prixCatalogue(777, precedents)).toBeNull()
  })

  it('ne pose que des prix finissant par 90 centimes', () => {
    for (const valeur of Object.values(PRIX_SANS_PRECEDENT)) {
      expect(valeur % 100).toBe(90)
    }
  })
})
