import { describe, expect, it } from 'vitest'
import {
  libelleVoirLesPacks,
  phraseDesEmplacements,
  decompteDesPacks,
  groupesTries,
  regrouperLesAlternatives,
  resumeDeGeneration,
  titreDesTechnologies,
} from '@/lib/packs-vue'
import type { PackPositionGroup } from '@/lib/queries/packs'

let compteur = 0
const groupe = (code: string, label: string, n = 1): PackPositionGroup => ({
  code,
  label,
  products: Array.from(
    { length: n },
    () => ({ productSlug: `p${compteur++}` }) as PackPositionGroup['products'][number],
  ),
})

describe('phraseDesEmplacements', () => {
  it('ne promet que ce qui est proposé', () => {
    expect(phraseDesEmplacements([groupe('PLATE', 'Éclairage de plaque')])).toBe(
      'Éclairage de plaque : le pack composé pour ce véhicule.',
    )
    expect(
      phraseDesEmplacements([groupe('LOW_BEAM', 'Feux de croisement'), groupe('PLATE', 'Éclairage de plaque')]),
    ).toBe('Feux de croisement et éclairage de plaque : les packs composés pour ce véhicule.')
  })

  it('nomme les trois premiers emplacements, puis s’arrête', () => {
    const phrase = phraseDesEmplacements([
      groupe('LOW_BEAM', 'Feux de croisement'),
      groupe('SIDELIGHT', 'Veilleuses'),
      groupe('PLATE', 'Éclairage de plaque'),
      groupe('INTERIOR_DOME', 'Plafonnier'),
    ])
    expect(phrase).toBe(
      'Les éclairages proposés pour ce véhicule : feux de croisement, veilleuses, éclairage de plaque…',
    )
  })

  it('accorde au pluriel quand un emplacement a plusieurs solutions', () => {
    expect(phraseDesEmplacements([groupe('PLATE', 'Éclairage de plaque', 2)])).toBe(
      'Éclairage de plaque : les packs composés pour ce véhicule.',
    )
  })

  it('ignore les emplacements vides et les doublons', () => {
    // Le même produit relevé deux fois sous le même emplacement : un seul pack.
    const plaque = groupe('PLATE', 'Éclairage de plaque')
    expect(
      phraseDesEmplacements([groupe('LOW_BEAM', 'Feux de croisement', 0), plaque, { ...plaque }]),
    ).toBe('Éclairage de plaque : le pack composé pour ce véhicule.')
    expect(phraseDesEmplacements([])).toBe('Aucun éclairage n’est encore documenté pour cette génération.')
  })

  it('remplace un code technique par son nom', () => {
    expect(phraseDesEmplacements([groupe('TURN_FRONT', 'TURN_FRONT')])).toBe(
      'Clignotants avant : le pack composé pour ce véhicule.',
    )
  })
})

describe('libelleVoirLesPacks', () => {
  it('accorde au singulier', () => {
    expect(libelleVoirLesPacks(1)).toBe('Voir le pack')
    expect(libelleVoirLesPacks(13)).toBe('Voir les 13 packs')
  })
})


describe('resumeDeGeneration', () => {
  it('annonce les packs, pas les équipements', () => {
    expect(resumeDeGeneration({ packCount: 13, configurationCount: 1, hasFitments: true })).toBe(
      '13 packs disponibles',
    )
    expect(resumeDeGeneration({ packCount: 1, configurationCount: 1, hasFitments: true })).toBe(
      '1 pack disponible',
    )
  })

  it("garde le nombre d'équipements quand il y a un choix à faire", () => {
    expect(resumeDeGeneration({ packCount: 4, configurationCount: 2, hasFitments: true })).toBe(
      "4 packs disponibles · 2 équipements d'origine",
    )
  })

  it('ne promet rien sans compatibilité relevée', () => {
    expect(resumeDeGeneration({ packCount: 0, configurationCount: 1, hasFitments: false })).toBe(
      'Compatibilités non encore relevées',
    )
  })
})


describe('titreDesTechnologies', () => {
  it('garde « LED » et ajoute « xénon » quand la page en propose', () => {
    expect(titreDesTechnologies([{ nom: 'Pack LED plaque' }])).toBe('Éclairage LED')
    expect(
      titreDesTechnologies([
        { nom: 'Pack ampoules effet xénon phares pour Renault Clio 4' },
        { nom: 'Pack LED plaque' },
      ]),
    ).toBe('Éclairage LED et xénon')
    expect(titreDesTechnologies([{ nom: 'Kit xénon HID' }])).toBe('Éclairage xénon')
    expect(titreDesTechnologies([])).toBe('Éclairage LED')
  })
})

describe('regrouperLesAlternatives', () => {
  const carte = (slug: string, label: string, nom = `Pack ${slug}`) =>
    ({ slug, nom, emplacements: [{ code: label, label }] }) as unknown as Parameters<
      typeof regrouperLesAlternatives
    >[0][number]

  it('réunit les solutions d’un même éclairage, à la place de la première', () => {
    const groupes = regrouperLesAlternatives([
      carte('xenon', 'Feux de croisement', 'Pack ampoules effet xénon'),
      carte('plaque', 'Éclairage de plaque'),
      carte('kit-led', 'Feux de croisement', 'Kit LED'),
    ])
    expect(groupes.map((g) => [g.emplacement, g.cartes.map((c) => c.slug)])).toEqual([
      ['Feux de croisement', ['xenon', 'kit-led']],
      ['Éclairage de plaque', ['plaque']],
    ])
  })

  it('sépare feux de jour et veilleuses, comme le total', () => {
    const groupes = regrouperLesAlternatives([
      carte('veilleuses', 'Veilleuses', 'Ampoules LED de veilleuses'),
      carte('jour', 'Veilleuses', 'Ampoules LED de feux de jour'),
    ])
    expect(groupes).toHaveLength(2)
  })
})

describe('groupesTries et decompteDesPacks', () => {
  const carte = (slug: string, label: string, prixCents: number, nom = `Pack ${slug}`) =>
    ({ slug, nom, prixCents, emplacements: [{ code: label, label }] }) as unknown as Parameters<
      typeof groupesTries
    >[0][number]
  const cartes = [
    carte('xenon', 'Feux de croisement', 3690, 'Pack ampoules effet xénon'),
    carte('plaque', 'Éclairage de plaque', 2690),
    carte('kit-led', 'Feux de croisement', 10490, 'Kit LED'),
    carte('hid', 'Feux de croisement', 8090, 'Kit xénon HID'),
  ]

  it('ne coupe jamais un groupe, quel que soit le tri', () => {
    const croissant = groupesTries(cartes, 'prix-croissant')
    expect(croissant.map((g) => g.cartes.map((c) => c.slug))).toEqual([
      ['plaque'],
      ['xenon', 'hid', 'kit-led'],
    ])
    const decroissant = groupesTries(cartes, 'prix-decroissant')
    expect(decroissant.map((g) => g.cartes.map((c) => c.slug))).toEqual([
      ['kit-led', 'hid', 'xenon'],
      ['plaque'],
    ])
  })

  it('dit combien d’éclairages se cachent derrière les packs', () => {
    expect(decompteDesPacks(cartes)).toBe('4 packs pour 2 éclairages')
    expect(decompteDesPacks([cartes[1]])).toBe('1 pack')
    expect(decompteDesPacks([cartes[0], cartes[1]])).toBe('2 packs')
  })
})
