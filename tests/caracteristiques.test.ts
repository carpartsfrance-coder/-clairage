import { describe, expect, it } from 'vitest'
import { lireCaracteristiques, phraseDesAtouts } from '../src/lib/caracteristiques'

/**
 * Ce que ces tests protègent : la fiche dit les atouts relevés chez LedPerf
 * avec nos mots, et jamais ce que l'exploitant interdit — une référence
 * d'ampoule sur un pack véhicule, une homologation, une marque, une promesse
 * de service qui serait la leur.
 */

const antibrouillardsA38V = {
  v: 1 as const,
  atouts: ['BLANC_PUR', 'PLUG_PLAY', 'SANS_ERREUR', 'TENSION_12', 'HAUTE_QUALITE'],
  specs: [
    ['Couleur', 'Blanc Xenon'],
    ['Tension', '12V'],
    ['Angle de rayonnement', '360°'],
    ['Marque', 'LEDPerf'],
    ["Equivalence d'éclairage", '20W'],
    ['Homologue route', 'Non'],
    ['Certification CE', 'Oui'],
  ] as Array<[string, string]>,
  montage: 10,
  notice: true,
}

describe('lireCaracteristiques', () => {
  it('met en tête ce qui rassure : erreur OBD, plug & play, temps de montage, notice', () => {
    const c = lireCaracteristiques(antibrouillardsA38V, { sansReference: true })!
    expect(c.atouts.map((a) => a.badge).slice(0, 4)).toEqual([
      'Sans erreur OBD',
      'Plug & play',
      'Montage 10 min',
      'Notice PDF personnalisée',
    ])
    expect(c.sansErreur).toBe(true)
    expect(c.plugAndPlay).toBe(true)
    expect(c.notice).toBe(true)
  })

  it("n'affiche ni la marque, ni leurs lignes d'homologation brutes, ni un libellé inconnu", () => {
    const c = lireCaracteristiques(antibrouillardsA38V, { sansReference: true })!
    const libelles = c.specs.map((s) => s.label)
    expect(libelles).not.toContain('Marque')
    expect(libelles.join(' ')).not.toMatch(/homolog/i)
    expect(libelles).not.toContain("Equivalence d'éclairage")
    expect(c.specs.map((s) => s.value).join(' ')).not.toMatch(/led ?perf/i)
    expect(c.specs).toContainEqual({ label: 'Tension', value: '12 V' })
    expect(c.specs).toContainEqual({ label: 'Angle d’éclairage', value: '360°' })
  })

  it("ne montre ni culot ni désignation d'ampoule sur un pack véhicule", () => {
    const donnees = { v: 1, specs: [['Culot', 'H7'], ['Connectique', 'Connecteur H7 plug and play'], ['Puissance', '35w']] }
    const pack = lireCaracteristiques(donnees, { sansReference: true })!
    expect(pack.specs).toEqual([{ label: 'Puissance', value: '35 W' }])
    const ampoule = lireCaracteristiques(donnees, { sansReference: false })!
    expect(ampoule.specs.map((s) => s.label)).toContain('Culot')
  })

  it("laisse la main au back-office : un libellé déjà saisi n'est pas doublé", () => {
    const c = lireCaracteristiques(antibrouillardsA38V, { sansReference: true, libellesExistants: ['Tension'] })!
    expect(c.specs.map((s) => s.label)).not.toContain('Tension')
  })

  it("transforme « Anti-erreur ODB : Oui » en atout, pas en ligne « Oui »", () => {
    const c = lireCaracteristiques({ v: 1, specs: [['Anti-erreur ODB', 'Oui'], ['Etanchéité', 'IP 67']] }, { sansReference: false })!
    expect(c.sansErreur).toBe(true)
    expect(c.specs).toEqual([{ label: 'Étanchéité', value: 'IP67' }])
    expect(c.atouts.map((a) => a.code)).toEqual(['SANS_ERREUR', 'ETANCHE'])
  })

  it('dit les durées longues en heures', () => {
    const c = lireCaracteristiques({ v: 1, montage: 90 }, { sansReference: false })!
    expect(c.atouts[0]).toMatchObject({ badge: 'Montage 1 h 30', texte: 'Montage en 1 h 30 environ' })
  })

  it('écarte de la composition les marques, les promesses et les références', () => {
    const c = lireCaracteristiques(
      {
        v: 1,
        composition: ['- 2 feux additionnels LED.', '1 faisceau avec relais 40A', 'Garantie LEDPerf', 'Ampoules H7'],
      },
      { sansReference: true },
    )!
    expect(c.composition).toEqual(['2 feux additionnels LED', '1 faisceau avec relais 40A'])
  })

  it("ne renvoie rien quand le relevé n'a rien d'utile ou n'est pas lisible", () => {
    expect(lireCaracteristiques(null)).toBeNull()
    expect(lireCaracteristiques({ v: 2, atouts: ['SANS_ERREUR'] })).toBeNull()
    expect(lireCaracteristiques({ v: 1, atouts: ['INCONNU'], specs: [['Marque', 'LEDPerf']] })).toBeNull()
  })

  it('garde un seul « 12 V » et préfère le temps chiffré à « montage facile »', () => {
    const c = lireCaracteristiques(
      { v: 1, atouts: ['TENSION_12', 'TENSION_12_24', 'MONTAGE_FACILE'], montage: 20 },
      { sansReference: false },
    )!
    expect(c.atouts.map((a) => a.code)).toEqual(['MONTAGE', 'TENSION_12_24'])
  })
  it('met les valeurs au propre, sans doubler une ligne', () => {
    const c = lireCaracteristiques(
      {
        v: 1,
        specs: [
          ['Dimensions', '42.5x30x63 mm mm'],
          ['Flux lumineux', '3800 Lumens'],
          ['Température de fonctionnement', '- 40°C à 300°C'],
          ['Connectique', 'Connecteur plug and play'],
          ['Raccordement', 'Connecteur plug and play'],
          ['Etanchéité', 'IP 67'],
        ],
      },
      { sansReference: false },
    )!
    expect(c.specs).toEqual([
      { label: 'Dimensions', value: '42.5x30x63 mm' },
      { label: 'Flux lumineux', value: '3 800 lm' },
      { label: 'Température de fonctionnement', value: '−40°C à 300°C' },
      { label: 'Branchement', value: 'Connecteur plug and play' },
      { label: 'Étanchéité', value: 'IP67' },
    ])
    expect(c.atouts.map((a) => a.code)).toContain('ETANCHE')
  })
  it('écrit « xénon » avec son accent', () => {
    const c = lireCaracteristiques(
      { v: 1, specs: [['Couleur', 'Blanc Xenon'], ['Technologie', 'Xenon HID']] },
      { sansReference: false },
    )!
    expect(c.specs).toEqual([
      { label: 'Couleur', value: 'Blanc xénon' },
      { label: 'Technologie', value: 'Xénon HID' },
    ])
  })
  it('met « Homologué route » en premier badge quand le relevé le dit', () => {
    const c = lireCaracteristiques({ ...antibrouillardsA38V, homologue: true }, { sansReference: true })!
    expect(c.atouts[0]).toMatchObject({ code: 'HOMOLOGUE', badge: 'Homologué route' })
    expect(c.homologue).toBe(true)
    expect(c.specs).toContainEqual({ label: 'Homologation route', value: 'Oui' })
  })

  it('dit « non homologué » et l’usage limité, sans en faire des atouts', () => {
    const non = lireCaracteristiques({ ...antibrouillardsA38V, homologue: false }, { sansReference: true })!
    expect(non.atouts.map((a) => a.code)).not.toContain('HOMOLOGUE')
    expect(non.specs).toContainEqual({ label: 'Homologation route', value: 'Non' })
    expect(non.usage).toBeNull()

    const circuit = lireCaracteristiques(
      { v: 1, homologue: false, usage: 'circuit', specs: [['Tension', '12V']] },
      { sansReference: false },
    )!
    expect(circuit.usage).toBe('circuit')
    expect(circuit.specs).toContainEqual({
      label: 'Usage autorisé',
      value: 'Circuit uniquement, pas sur la voie publique',
    })
  })

  it('ne dit jamais « homologué » d’un article déclaré non homologué au back-office', () => {
    const c = lireCaracteristiques(
      { ...antibrouillardsA38V, homologue: true },
      { sansReference: true, nonHomologueDeclare: true },
    )!
    expect(c.atouts.map((a) => a.code)).not.toContain('HOMOLOGUE')
    expect(c.homologue).toBe(false)
    expect(c.specs).toContainEqual({ label: 'Homologation route', value: 'Non' })
  })
  it('écrit les premiers atouts en une phrase pour Google', () => {
    const c = lireCaracteristiques(antibrouillardsA38V, { sansReference: true })!
    expect(phraseDesAtouts(c.atouts)).toBe('sans erreur OBD, plug & play et montage 10 min')
    expect(phraseDesAtouts([])).toBeNull()
  })
})
