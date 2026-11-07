import { describe, expect, it } from 'vitest'
import { construireFlux, echapperXml, fraisDePort, texteBrut } from '../src/lib/flux-google'

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

  it('écarte un produit sans image', () => {
    const { lignes } = construireFlux({ siteUrl: 'https://ledvroom.com', titre: 'LEDVROOM', articles: [{ ...article, images: [] }], tarifs })
    expect(lignes).toBe(0)
  })

  it('outils', () => {
    expect(echapperXml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;')
    expect(texteBrut('## Titre\n**gras** [lien](https://x)')).toBe('Titre gras lien')
    expect(fraisDePort({ country: 'FR', modes: [] }, 1000)).toBeNull()
    expect(fraisDePort(tarifs[0], 8000)).toBe(0)
  })
})
