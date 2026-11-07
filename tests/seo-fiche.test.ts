import { describe, expect, it } from 'vitest'
import {
  accrocheSousLeTitre,
  anneesCourtes,
  corrigerRedactionnelDImport,
  descriptionSeo,
  estUnTitreDImport,
  nomDuVehicule,
  titreSeo,
  type VehiculeDeLaFiche,
} from '../src/lib/seo-fiche'
import { returnPolicy, shippingDetails } from '../src/components/seo/StructuredData'
import { formatPrice } from '../src/lib/identity'

const A1: VehiculeDeLaFiche = {
  marque: { nom: 'Audi', slug: 'audi' },
  modele: { nom: 'A1', slug: 'a1' },
  generation: { nom: 'A1', slug: 'a1', phase: null, anneeDebut: 2010, anneeFin: 2018 },
  chemin: '/packs/auto/audi/a1/a1',
  cheminMarque: '/packs/auto/audi',
}
const A1_II: VehiculeDeLaFiche = {
  ...A1,
  generation: { nom: 'A1 II', slug: 'a1-ii', phase: null, anneeDebut: 2018, anneeFin: null },
  chemin: '/packs/auto/audi/a1/a1-ii',
}

/** Une fiche telle que l'import l'a laissée en production. */
const IMPORT_HISTORIQUE = {
  name: 'Pack LED phares pour Audi A1',
  tagline: 'Pour les phares de votre Audi A1',
  description: 'Pack LED pour les phares de Audi A1. Compatibilité à vérifier avant commande.',
  metaTitle: 'Pack LED phares pour Audi A1 — LUMERA',
  metaDescription: 'Pack LED pour les phares de Audi A1. Compatibilité à vérifier avant commande.',
}
const CONDITIONS = { seuilFranchiseCents: 8000, retourJours: 14 }

describe('titre de référencement', () => {
  it("remplace l'ancien nom de travail par le nom et les années", () => {
    expect(titreSeo(IMPORT_HISTORIQUE, A1)).toBe('Pack LED phares pour Audi A1 (2010–2018)')
  })

  it('dit « depuis » pour une génération toujours produite', () => {
    expect(titreSeo({ ...IMPORT_HISTORIQUE, name: 'Pack LED phares pour Audi A1 II' }, A1_II)).toBe(
      'Pack LED phares pour Audi A1 II (depuis 2018)',
    )
  })

  it('reconnaît aussi le nouveau titre d’import (le nom recopié)', () => {
    expect(estUnTitreDImport('Pack LED phares pour Audi A1', 'Pack LED phares pour Audi A1')).toBe(true)
    expect(titreSeo({ ...IMPORT_HISTORIQUE, metaTitle: IMPORT_HISTORIQUE.name }, A1)).toContain('(2010–2018)')
  })

  it('garde un titre écrit à la main', () => {
    expect(titreSeo({ ...IMPORT_HISTORIQUE, metaTitle: 'Kit LED Audi A1 : le plus vendu' }, A1)).toBe(
      'Kit LED Audi A1 : le plus vendu',
    )
  })

  it('ne répète pas des années déjà dans le nom', () => {
    expect(titreSeo({ ...IMPORT_HISTORIQUE, name: 'Pack LED Audi A1 2010–2018', metaTitle: null }, A1)).toBe(
      'Pack LED Audi A1 2010–2018',
    )
  })

  it('sans véhicule, garde le nom', () => {
    expect(titreSeo({ ...IMPORT_HISTORIQUE, metaTitle: null }, null)).toBe('Pack LED phares pour Audi A1')
  })
})

describe('description de référencement', () => {
  it('remplace la mise en garde par le véhicule, la livraison et le retour', () => {
    const texte = descriptionSeo(IMPORT_HISTORIQUE, A1, CONDITIONS)
    expect(texte).toBe(
      `Pack LED phares pour Audi A1 (2010–2018) : kit plug & play composé pour ce véhicule, sans modifier le câblage. Livraison offerte dès ${formatPrice(8000)}, retours sous 14 jours.`,
    )
    expect(texte).not.toMatch(/vérifier/)
    // Ce que Google affiche sans couper.
    expect(texte!.length).toBeLessThanOrEqual(165)
  })

  it('ne promet pas une franchise qui n’est pas configurée', () => {
    expect(descriptionSeo(IMPORT_HISTORIQUE, A1, { seuilFranchiseCents: null, retourJours: 14 })).toMatch(
      /Retours sous 14 jours\.$/,
    )
    expect(
      descriptionSeo(IMPORT_HISTORIQUE, A1, { seuilFranchiseCents: null, retourJours: null }),
    ).not.toMatch(/Livraison|Retours/)
  })

  it('garde une description écrite à la main', () => {
    expect(
      descriptionSeo({ ...IMPORT_HISTORIQUE, metaDescription: 'Écrite au back-office.' }, A1, CONDITIONS),
    ).toBe('Écrite au back-office.')
  })

  it('ne reprend pas la mise en garde quand la fiche n’a pas de véhicule', () => {
    expect(descriptionSeo(IMPORT_HISTORIQUE, null, CONDITIONS)).toBe('Pour les phares de votre Audi A1')
  })
})

describe('ligne sous le titre', () => {
  it('donne les années au lieu de répéter le titre', () => {
    expect(accrocheSousLeTitre(IMPORT_HISTORIQUE.tagline, A1)).toBe(
      'Pour les Audi A1 produites de 2010 à 2018.',
    )
    expect(accrocheSousLeTitre(IMPORT_HISTORIQUE.tagline, A1_II)).toBe(
      'Pour les Audi A1 II produites depuis 2018.',
    )
  })

  it('garde une accroche écrite à la main, et toute accroche sans véhicule', () => {
    expect(accrocheSousLeTitre('Le blanc le plus pur', A1)).toBe('Le blanc le plus pur')
    expect(accrocheSousLeTitre(IMPORT_HISTORIQUE.tagline, null)).toBe(IMPORT_HISTORIQUE.tagline)
  })
})

describe('petits textes', () => {
  it('ne répète pas la marque déjà dans le nom de la génération', () => {
    expect(nomDuVehicule(A1)).toBe('Audi A1')
    expect(
      nomDuVehicule({
        marque: { nom: 'Subaru', slug: 'subaru' },
        generation: { ...A1.generation, nom: 'Subaru Outback III' },
      }),
    ).toBe('Subaru Outback III')
  })

  it('écrit les années', () => {
    expect(anneesCourtes(2010, 2018)).toBe('2010–2018')
    expect(anneesCourtes(2018, null)).toBe('depuis 2018')
    expect(anneesCourtes(2020, 2020)).toBe('2020')
  })

  it('corrige « pour la Audi » dans le rédactionnel de l’import', () => {
    expect(corrigerRedactionnelDImport("Pack d'éclairage LED composé pour la Audi A1. Les ampoules…")).toBe(
      "Pack d'éclairage LED composé pour votre Audi A1. Les ampoules…",
    )
  })
})

describe('livraison et retour déclarés aux moteurs', () => {
  const offres = [
    { code: 'colissimo', label: 'Colissimo', carrier: null, priceCents: 390, freeFromCents: 8000, minDays: 3, maxDays: 5 },
  ]

  it('déclare le port réellement payé pour ce conditionnement', () => {
    expect(shippingDetails(offres, 2890)?.shippingRate.value).toBe('3.90')
    expect(shippingDetails(offres, 8990)?.shippingRate.value).toBe('0.00')
    expect(shippingDetails(offres, 2890)?.shippingDestination.addressCountry).toBe('FR')
  })

  it('ne déclare rien sans méthode de livraison ni délai de retour', () => {
    expect(shippingDetails([], 2890)).toBeUndefined()
    expect(returnPolicy(null)).toBeUndefined()
    expect(returnPolicy(14)?.merchantReturnDays).toBe(14)
  })
})
