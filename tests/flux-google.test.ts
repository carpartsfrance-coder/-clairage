import { describe, expect, it } from 'vitest'
import { construireFlux, echapperXml, familleCampagne, fraisDePort, texteBrut, tranchePrix } from '../src/lib/flux-google'

const article = {
  slug: 'pack-led-plaque-dacia-duster-2',
  name: 'Pack LED éclairage de plaque pour Dacia Duster 2',
  description: '**Deux LED** blanches & <b>prêtes</b> à poser.',
  brand: null,
  productType: 'Plaque & recul > Éclairage de plaque',
  images: ['https://cdn.exemple/rendu.jpg', '/local.jpg'],
  variants: [{ sku: 'LV-001', name: 'Pack', priceCents: 2590, etat: 'IN_STOCK' as const }],
}

const tarifs = [
  { country: 'FR', modes: [{ label: 'Domicile', priceCents: 590, freeFromCents: 8000 }] },
  { country: 'DE', modes: [{ label: 'Domicile', priceCents: 1290, freeFromCents: null }] },
]

describe('flux Google Merchant Center', () => {
  it('écrit une ligne par conditionnement, avec prix, image, disponibilité et livraison', () => {
    const { xml, lignes } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [article], tarifs })
    expect(lignes).toBe(1)
    expect(xml).toContain('<g:id>LV-001</g:id>')
    expect(xml).toContain('<g:price>25.90 EUR</g:price>')
    expect(xml).toContain('<g:availability>in_stock</g:availability>')
    expect(xml).toContain('<g:link>https://ledvroom.com/p/pack-led-plaque-dacia-duster-2</g:link>')
    expect(xml).toContain('<g:additional_image_link>https://ledvroom.com/local.jpg</g:additional_image_link>')
    expect(xml).toContain('<g:brand>LEDVROOM</g:brand>')
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>')
    expect(xml).toContain('<g:country>FR</g:country><g:price>5.90 EUR</g:price>')
    expect(xml).toContain('<g:country>DE</g:country><g:price>12.90 EUR</g:price>')
    expect(xml).toContain('Plaque &amp; recul &gt; Éclairage de plaque')
    expect(xml).toContain('<g:custom_label_0>20 à 50 €</g:custom_label_0>')
    expect(xml).not.toContain('<b>')
    expect(xml).not.toContain('item_group_id')
  })

  it('regroupe les conditionnements d’une même fiche', () => {
    const deux = { ...article, variants: [...article.variants, { sku: 'LV-002', name: 'Kit complet', priceCents: 9990, etat: 'BACKORDER' as const }] }
    const { xml, lignes } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [deux], tarifs })
    expect(lignes).toBe(2)
    expect(xml.match(/<g:item_group_id>pack-led-plaque-dacia-duster-2<\/g:item_group_id>/g)).toHaveLength(2)
    expect(xml).toContain('— Kit complet</g:title>')
    expect(xml).toContain('<g:availability>backorder</g:availability>')
    // 99,90 € dépasse le seuil français : livraison offerte.
    expect(xml).toContain('<g:country>FR</g:country><g:price>0.00 EUR</g:price>')
  })

  it('annonce un prix barré en prix + prix soldé, port calculé sur le prix payé', () => {
    const promo = { ...article, variants: [{ ...article.variants[0], priceCents: 7600, compareAtCents: 9200 }] }
    const { xml } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [promo], tarifs })
    expect(xml).toContain('<g:price>92.00 EUR</g:price><g:sale_price>76.00 EUR</g:sale_price>')
    // 76 € est sous le seuil de 80 € : le port est dû, même si 92 € le dépasse.
    expect(xml).toContain('<g:country>FR</g:country><g:price>5.90 EUR</g:price>')
    expect(xml).toContain('<g:custom_label_0>50 à 100 €</g:custom_label_0>')
  })

  it('garde la tranche de prix du prix de référence pendant une promotion', () => {
    const promo = { ...article, variants: [{ ...article.variants[0], priceCents: 1871, compareAtCents: 2390 }] }
    const { xml } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [promo], tarifs })
    expect(xml).toContain('<g:sale_price>18.71 EUR</g:sale_price>')
    expect(xml).toContain('<g:custom_label_0>20 à 50 €</g:custom_label_0>')
  })

  it('ignore un prix barré qui ne baisse rien', () => {
    const sansBaisse = { ...article, variants: [{ ...article.variants[0], compareAtCents: 2590 }] }
    const { xml } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [sansBaisse], tarifs })
    expect(xml).toContain('<g:price>25.90 EUR</g:price>')
    expect(xml).not.toContain('sale_price')
  })

  it('écarte un produit sans image', () => {
    const { lignes } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [{ ...article, images: [] }], tarifs })
    expect(lignes).toBe(0)
  })

  it('outils', () => {
    expect(echapperXml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;')
    expect(texteBrut('## Titre\n**gras** [lien](https://x)')).toBe('Titre gras lien')
    expect(fraisDePort({ country: 'FR', modes: [] }, 1000)).toBeNull()
    expect(fraisDePort(tarifs[0], 8000)).toBe(0)
    expect(tranchePrix(5)).toBe('Moins de 20 €')
    expect(tranchePrix(1999)).toBe('Moins de 20 €')
    expect(tranchePrix(2000)).toBe('20 à 50 €')
    expect(tranchePrix(9990)).toBe('50 à 100 €')
    expect(tranchePrix(10000)).toBe('100 € et plus')
  })
})

describe('atouts et caractéristiques dans le flux', () => {
  it('envoie les atouts en product_highlight et les caractéristiques en product_detail', async () => {
    const { lignesDeLArticle } = await import('../src/lib/flux-google')
    const [ligne] = lignesDeLArticle(
      {
        slug: 'pack-led-antibrouillards-audi-a3-8v',
        name: 'Pack LED antibrouillards pour Audi A3 8V',
        description: null,
        brand: 'LEDVROOM',
        productType: null,
        images: ['/a.jpg'],
        atouts: ['Aucune erreur au tableau de bord (OBD)', 'Plug & play'],
        details: [{ label: 'Tension', value: '12 V' }],
        variants: [{ sku: 'X', name: 'Unique', priceCents: 2870, compareAtCents: 3590, etat: 'IN_STOCK' }],
      },
      { siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', tarifs: [] },
    )
    expect(ligne).toContain('<g:product_highlight>Aucune erreur au tableau de bord (OBD)</g:product_highlight>')
    expect(ligne).toContain('<g:product_highlight>Plug &amp; play</g:product_highlight>')
    expect(ligne).toContain(
      '<g:product_detail><g:section_name>Caractéristiques</g:section_name><g:attribute_name>Tension</g:attribute_name><g:attribute_value>12 V</g:attribute_value></g:product_detail>',
    )
  })
  it('range chaque article dans sa campagne : pack véhicule ou générique', () => {
    expect(familleCampagne('LUM-PK-FOG-AUDI-A3-8V-EF8E')).toBe('Pack véhicule')
    expect(familleCampagne('LV-OPTIQUE-ROND-ROYAL-ENFI-BULLET-CLASSIC-B775')).toBe('Pack véhicule')
    expect(familleCampagne('LVA-A8ADB4B4')).toBe('Générique')
    const { xml } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [article], tarifs })
    expect(xml).toContain('<g:custom_label_1>Pack véhicule</g:custom_label_1>')
  })
})
