import { describe, expect, it } from 'vitest'
import {
  buildPlateDescription,
  formatPlate,
  isPlausiblePlate,
  plateCheckSchema,
} from '../src/lib/support'

/**
 * Vérification par la plaque.
 *
 * Ce que ces tests protègent : une plaque saisie « comme on veut » qui ressort
 * dans un format unique pour l'expert, le refus des saisies qui ne sont pas des
 * plaques, et une demande qui ne reprend du formulaire que ce qui doit l'être.
 * L'action (cookies, compteur de tentatives, base) n'est pas exécutable hors
 * d'une requête : tout ce qui se décide sans elle vit dans `support.ts`.
 */

describe('formatPlate', () => {
  it('réécrit une plaque SIV avec ses tirets, quelle que soit la saisie', () => {
    expect(formatPlate('ab123cd')).toBe('AB-123-CD')
    expect(formatPlate('ab 123 cd')).toBe('AB-123-CD')
    expect(formatPlate(' AB-123-CD ')).toBe('AB-123-CD')
  })

  it('laisse une plaque ancienne bout à bout', () => {
    expect(formatPlate('1234 ab 56')).toBe('1234AB56')
  })
})

describe('isPlausiblePlate', () => {
  it('accepte les plaques françaises, anciennes comprises', () => {
    expect(isPlausiblePlate('AB-123-CD')).toBe(true)
    expect(isPlausiblePlate('1234AB56')).toBe(true)
  })

  it('refuse ce qui n’est pas une plaque', () => {
    expect(isPlausiblePlate('')).toBe(false)
    expect(isPlausiblePlate('abc')).toBe(false)
    expect(isPlausiblePlate('12345')).toBe(false)
    expect(isPlausiblePlate('ABCDE')).toBe(false)
    expect(isPlausiblePlate('AB123CD4567')).toBe(false)
  })
})

describe('plateCheckSchema', () => {
  const valide = { productSlug: 'pack-led-clio-4', plate: 'ab 123 cd', email: 'client@example.com' }

  it('remet la plaque en forme', () => {
    const parsed = plateCheckSchema.parse(valide)
    expect(parsed.plate).toBe('AB-123-CD')
  })

  it('refuse une plaque invalide avec un message lisible', () => {
    const result = plateCheckSchema.safeParse({ ...valide, plate: 'xx' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/Plaque non reconnue/)
  })

  it('refuse une adresse e-mail invalide', () => {
    expect(plateCheckSchema.safeParse({ ...valide, email: 'pas-un-mail' }).success).toBe(false)
  })

  it('refuse une demande sans produit', () => {
    expect(plateCheckSchema.safeParse({ ...valide, productSlug: '' }).success).toBe(false)
  })
})

describe('buildPlateDescription', () => {
  it('annonce la plaque comme une déclaration et nomme le produit relu en base', () => {
    const texte = buildPlateDescription({
      productName: 'Pack LED Clio IV',
      plate: 'AB-123-CD',
      selectedVehicle: null,
      account: null,
    })
    expect(texte).toContain('Produit : Pack LED Clio IV')
    expect(texte).toContain('Plaque indiquée par le client : AB-123-CD')
    expect(texte).toContain('Véhicule choisi sur le site : aucun')
    expect(texte).toContain('Compte : aucun')
  })

  it('reprend le véhicule déjà choisi et le compte connecté', () => {
    const texte = buildPlateDescription({
      productName: 'Pack LED Clio IV',
      plate: 'AB-123-CD',
      selectedVehicle: 'Renault Clio IV (2012–2019)',
      account: { email: 'compte@example.com' },
    })
    expect(texte).toContain('Véhicule choisi sur le site : Renault Clio IV (2012–2019)')
    expect(texte).toContain('Compte : compte@example.com')
  })
})
