import { describe, expect, it } from 'vitest'
import { libelleVoirLesPacks, phraseDesEmplacements, resumeDeGeneration } from '@/lib/packs-vue'
import type { PackPositionGroup } from '@/lib/queries/packs'

const groupe = (code: string, label: string, n = 1): PackPositionGroup => ({
  code,
  label,
  products: Array.from({ length: n }, () => ({}) as PackPositionGroup['products'][number]),
})

describe('phraseDesEmplacements', () => {
  it('ne promet que ce qui est proposé', () => {
    expect(phraseDesEmplacements([groupe('PLATE', 'Éclairage de plaque')])).toBe(
      'Éclairage de plaque : le pack composé pour ce véhicule.',
    )
    expect(
      phraseDesEmplacements([groupe('LOW_BEAM', 'Feux de croisement'), groupe('PLATE', 'Éclairage de plaque')]),
    ).toBe('Feux de croisement et éclairage de plaque : un pack composé pour chacun.')
  })

  it('nomme les trois premiers emplacements, puis s’arrête', () => {
    const phrase = phraseDesEmplacements([
      groupe('LOW_BEAM', 'Feux de croisement'),
      groupe('SIDELIGHT', 'Veilleuses'),
      groupe('PLATE', 'Éclairage de plaque'),
      groupe('INTERIOR_DOME', 'Plafonnier'),
    ])
    expect(phrase).toBe(
      'Un pack composé pour chaque emplacement : feux de croisement, veilleuses, éclairage de plaque…',
    )
  })

  it('ignore les emplacements vides et les doublons', () => {
    expect(
      phraseDesEmplacements([
        groupe('LOW_BEAM', 'Feux de croisement', 0),
        groupe('PLATE', 'Éclairage de plaque'),
        groupe('PLATE', 'Éclairage de plaque'),
      ]),
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
