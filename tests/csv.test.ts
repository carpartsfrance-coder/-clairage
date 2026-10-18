import { describe, expect, it } from 'vitest'
import {
  detectDelimiter,
  mapRow,
  normalizeHeader,
  parseBoolean,
  parseCsv,
  parseNumber,
  parsePriceCents,
  stripBom,
} from '../src/lib/imports/csv'

/**
 * Lecture de CSV.
 *
 * Ce que ces tests protègent : un import qui lit mal un fichier n'échoue pas,
 * il écrit des bêtises. Un prix « 1 234,56 » lu comme 1 par un parseur anglais
 * met le produit à un centime, et personne ne s'en aperçoit avant la première
 * commande.
 */

describe('détection du délimiteur', () => {
  it('reconnaît le point-virgule des exports francophones', () => {
    expect(detectDelimiter('sku;nom;prix\nA;B;1')).toBe(';')
  })

  it('reconnaît la virgule', () => {
    expect(detectDelimiter('sku,nom,prix\nA,B,1')).toBe(',')
  })

  it('reconnaît la tabulation', () => {
    expect(detectDelimiter('sku\tnom\tprix')).toBe('\t')
  })

  it('ne compte pas un délimiteur protégé par des guillemets', () => {
    // Une seule colonne, dont la valeur contient une virgule.
    expect(detectDelimiter('"Durand, Camille";age')).toBe(';')
  })
})

describe('BOM', () => {
  it('retire le BOM qui collerait au premier nom de colonne', () => {
    const avec = '﻿sku;nom'
    expect(stripBom(avec)).toBe('sku;nom')
    expect(parseCsv(avec).headers[0]).toBe('sku')
  })
})

describe('parseCsv', () => {
  it('lit un fichier simple', () => {
    const table = parseCsv('sku;nom;prix\nA-1;Ampoule;9,90\nA-2;Kit;99,90')
    expect(table.headers).toEqual(['sku', 'nom', 'prix'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual(['A-1', 'Ampoule', '9,90'])
  })

  it('gère un délimiteur à l’intérieur de guillemets', () => {
    const table = parseCsv('sku;nom\nA-1;"Ampoule H7, la paire"')
    expect(table.rows[0]).toEqual(['A-1', 'Ampoule H7, la paire'])
  })

  it('gère un saut de ligne à l’intérieur de guillemets', () => {
    const table = parseCsv('sku;description\nA-1;"Première ligne\nSeconde ligne"')
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0][1]).toBe('Première ligne\nSeconde ligne')
  })

  it('gère un guillemet doublé', () => {
    const table = parseCsv('sku;nom\nA-1;"Ampoule ""blanc pur"""')
    expect(table.rows[0][1]).toBe('Ampoule "blanc pur"')
  })

  it('gère les fins de ligne Windows', () => {
    const table = parseCsv('sku;nom\r\nA-1;Ampoule\r\n')
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]).toEqual(['A-1', 'Ampoule'])
  })

  it('ignore les lignes entièrement vides et les compte', () => {
    const table = parseCsv('sku;nom\nA-1;Ampoule\n\n;\nA-2;Kit\n')
    expect(table.rows).toHaveLength(2)
    expect(table.skippedEmpty).toBe(2)
  })

  it('lit la dernière ligne même sans saut de ligne final', () => {
    const table = parseCsv('sku;nom\nA-1;Ampoule')
    expect(table.rows).toHaveLength(1)
  })
})

describe('normalizeHeader', () => {
  it('rapproche les graphies d’un même intitulé', () => {
    expect(normalizeHeader('Prix TTC (€)')).toBe('prixttc')
    expect(normalizeHeader('prix_ttc')).toBe('prixttc')
    expect(normalizeHeader('  PRIX TTC  ')).toBe('prixttc')
  })

  it('retire les accents', () => {
    expect(normalizeHeader('Référence')).toBe('reference')
    expect(normalizeHeader('Température de couleur')).toBe('temperaturedecouleur')
  })
})

describe('mapRow', () => {
  it('applique la correspondance et ignore ce qui est écarté', () => {
    const headers = ['Référence', 'Nom', 'Commentaire']
    const row = ['A-1', 'Ampoule', 'peu importe']
    const mapping = { 'Référence': 'sku', Nom: 'name', Commentaire: '__ignore__' }

    expect(mapRow(headers, row, mapping)).toEqual({ sku: 'A-1', name: 'Ampoule' })
  })

  it('renvoie une chaîne vide pour une colonne absente de la ligne', () => {
    expect(mapRow(['a', 'b'], ['1'], { a: 'x', b: 'y' })).toEqual({ x: '1', y: '' })
  })
})

describe('parseNumber', () => {
  it('lit la graphie française', () => {
    expect(parseNumber('9,90')).toBe(9.9)
    expect(parseNumber('1 234,56')).toBe(1234.56)
    expect(parseNumber('1.234,56')).toBe(1234.56)
  })

  it('lit la graphie anglaise', () => {
    expect(parseNumber('9.90')).toBe(9.9)
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('1,234')).toBe(1234)
  })

  it('tolère les espaces insécables et le symbole monétaire', () => {
    expect(parseNumber('1 234,56 €')).toBe(1234.56)
    expect(parseNumber('99,90€')).toBe(99.9)
  })

  it('distingue « vide » de « zéro »', () => {
    // Une cellule vide n'est pas un prix de zéro : confondre les deux mettrait
    // des produits à zéro euro sans que rien ne le signale.
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('   ')).toBeNull()
    expect(parseNumber('0')).toBe(0)
  })

  it('refuse ce qui n’est pas un nombre', () => {
    expect(parseNumber('sur devis')).toBeNull()
    expect(parseNumber('n/a')).toBeNull()
  })
})

describe('parsePriceCents', () => {
  it('convertit en centimes sans erreur de virgule flottante', () => {
    expect(parsePriceCents('99,90')).toBe(9990)
    expect(parsePriceCents('0,01')).toBe(1)
    expect(parsePriceCents('1 234,56')).toBe(123456)
  })

  it('renvoie null sur une valeur illisible', () => {
    expect(parsePriceCents('gratuit')).toBeNull()
  })
})

describe('parseBoolean', () => {
  it('accepte les graphies courantes', () => {
    for (const vrai of ['1', 'true', 'VRAI', 'oui', 'O', 'x']) {
      expect(parseBoolean(vrai)).toBe(true)
    }
    for (const faux of ['0', 'false', 'FAUX', 'non', 'N']) {
      expect(parseBoolean(faux)).toBe(false)
    }
  })

  it('distingue « vide » de « faux »', () => {
    expect(parseBoolean('')).toBeNull()
    expect(parseBoolean('peut-être')).toBeNull()
  })
})
