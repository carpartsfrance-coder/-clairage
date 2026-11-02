import { describe, expect, it } from 'vitest'
import {
  COMPLEMENTS_MAX,
  COMPOSANT_QUANTITE_MAX,
  RAISON_TERME_COURT,
  TERME_MIN,
  avertissementComposition,
  libelleVehicule,
  noteComplementInvisible,
  noteConfigurationInactive,
  normaliserTerme,
  parseComposant,
  raisonComplementRefuse,
  raisonCompatibiliteRefusee,
  raisonCompositionImpossible,
  termeSuffisant,
} from '../src/lib/admin/produit-liens'

/**
 * Règles des liens d'une fiche produit.
 *
 * Ces règles ne protègent pas une saisie, elles protègent trois choses qui se
 * voient en caisse :
 *
 *   1. **La composition d'un kit décide d'un stock.**
 *      `availabilityForKit` divise le stock vendable de chaque composant
 *      obligatoire par la quantité inscrite dans le kit. Une quantité fausse
 *      vend ce qu'on ne peut pas expédier ; un kit dans un kit lit un stock
 *      physique nul et met le parent en rupture définitive ; une composition
 *      sans composant obligatoire fait de même, sans rien dire.
 *   2. **Un complément est un lien vers une autre fiche.** Vers un brouillon
 *      ou un produit archivé, il mène à une page que la boutique ne sert pas.
 *   3. **Une compatibilité n'a qu'une ligne** par référence, emplacement et
 *      configuration. Écraser un doublon en silence effacerait une
 *      vérification datée — c'est-à-dire du travail.
 */

/* -------------------------------------------------------------------------- */
/* Recherche                                                                  */
/* -------------------------------------------------------------------------- */

describe('normaliserTerme', () => {
  it('retire les espaces autour et réduit ceux du milieu', () => {
    expect(normaliserTerme('  osram   night  breaker ')).toBe('osram night breaker')
  })

  it('conserve la casse : la requête compare sans elle, mais l’écran réaffiche la saisie', () => {
    expect(normaliserTerme('H7 Philips')).toBe('H7 Philips')
  })
})

describe('termeSuffisant', () => {
  it('refuse une lettre seule, qui ramènerait presque tout le catalogue', () => {
    expect(termeSuffisant('h')).toBe(false)
    expect(termeSuffisant('   h  ')).toBe(false)
  })

  it('accepte dès deux caractères', () => {
    expect(TERME_MIN).toBe(2)
    expect(termeSuffisant('h7')).toBe(true)
  })

  it('refuse un terme vide', () => {
    expect(termeSuffisant('')).toBe(false)
    expect(termeSuffisant('    ')).toBe(false)
  })

  it('dit le nombre de caractères attendu dans son message', () => {
    expect(RAISON_TERME_COURT).toContain(`${TERME_MIN} caractères`)
  })
})

/* -------------------------------------------------------------------------- */
/* Compléments                                                                */
/* -------------------------------------------------------------------------- */

describe('raisonComplementRefuse', () => {
  const base = { produitId: 'prod-1', dejaLies: [] as string[], nombreActuel: 0 }

  it('accepte un autre produit non encore rattaché', () => {
    expect(raisonComplementRefuse({ ...base, cibleId: 'prod-2' })).toBeNull()
  })

  it('refuse un choix vide', () => {
    expect(raisonComplementRefuse({ ...base, cibleId: '' })).toContain('Choisissez')
  })

  it('refuse le produit lui-même, et dit ce que la fiche proposerait', () => {
    const raison = raisonComplementRefuse({ ...base, cibleId: 'prod-1' })
    expect(raison).toContain('son propre complément')
    expect(raison).toContain('panier')
  })

  it('refuse un complément déjà rattaché', () => {
    const raison = raisonComplementRefuse({
      ...base,
      cibleId: 'prod-2',
      dejaLies: ['prod-9', 'prod-2'],
    })
    expect(raison).toContain('déjà rattaché')
  })

  it('refuse au-delà du plafond, en nommant le nombre atteint', () => {
    const raison = raisonComplementRefuse({
      ...base,
      cibleId: 'prod-2',
      nombreActuel: COMPLEMENTS_MAX,
    })
    expect(raison).toContain(String(COMPLEMENTS_MAX))
    expect(raison).toContain('Détachez')
  })

  it('laisse passer juste sous le plafond', () => {
    expect(
      raisonComplementRefuse({ ...base, cibleId: 'prod-2', nombreActuel: COMPLEMENTS_MAX - 1 }),
    ).toBeNull()
  })

  /*
    L'ordre compte : un exploitant qui se rattache lui-même alors que la fiche
    est pleine doit lire « son propre complément », pas « plafond atteint ».
    Le premier refus est celui qu'il peut comprendre.
  */
  it('annonce d’abord le refus le plus parlant', () => {
    const raison = raisonComplementRefuse({
      produitId: 'prod-1',
      cibleId: 'prod-1',
      dejaLies: ['prod-1'],
      nombreActuel: COMPLEMENTS_MAX,
    })
    expect(raison).toContain('son propre complément')
  })
})

describe('noteComplementInvisible', () => {
  it('ne dit rien d’un produit publié qui a une référence active', () => {
    expect(noteComplementInvisible({ statut: 'PUBLISHED', referencesActives: 2 })).toBeNull()
  })

  it('signale un brouillon, et dit à quelle condition il apparaîtra', () => {
    const note = noteComplementInvisible({ statut: 'DRAFT', referencesActives: 1 })
    expect(note).toContain('brouillon')
    expect(note).toContain('publié')
  })

  it('signale un produit archivé', () => {
    expect(noteComplementInvisible({ statut: 'ARCHIVED', referencesActives: 1 })).toContain(
      'archivé',
    )
  })

  it('signale un produit publié sans référence active : rien à mettre au panier', () => {
    const note = noteComplementInvisible({ statut: 'PUBLISHED', referencesActives: 0 })
    expect(note).toContain('aucune référence active')
  })
})

/* -------------------------------------------------------------------------- */
/* Composition d'un kit                                                       */
/* -------------------------------------------------------------------------- */

describe('parseComposant', () => {
  const contexte = {
    varianteId: 'var-kit',
    composantId: 'var-ampoule',
    dejaComposants: [] as { composantId: string; libelle: string }[],
    composantEstKit: false,
  }

  it('retient la quantité saisie et le caractère indispensable', () => {
    const result = parseComposant({ quantity: '2', required: true }, contexte)
    expect(result).toEqual({ ok: true, value: { quantity: 2, required: true } })
  })

  it('vaut 1 quand la quantité est laissée vide', () => {
    const result = parseComposant({ quantity: '', required: false }, contexte)
    expect(result.ok && result.value).toEqual({ quantity: 1, required: false })
  })

  it('refuse une référence qui se contiendrait elle-même', () => {
    const result = parseComposant(
      { quantity: '1', required: true },
      { ...contexte, composantId: 'var-kit' },
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('elle-même')
  })

  /*
    Le refus le plus important du fichier : il n'est pas déductible de
    l'interface, seulement de `availabilityForKit`.
  */
  it('refuse un composant qui est lui-même un kit, et dit pourquoi le stock serait faux', () => {
    const result = parseComposant(
      { quantity: '1', required: true },
      { ...contexte, composantEstKit: true },
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('rupture')
  })

  it('refuse un composant déjà présent, en le nommant', () => {
    const result = parseComposant(
      { quantity: '1', required: true },
      {
        ...contexte,
        dejaComposants: [{ composantId: 'var-ampoule', libelle: 'Osram H7 · à l’unité' }],
      },
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Osram H7')
  })

  it('refuse une quantité nulle, négative ou décimale', () => {
    for (const quantity of ['0', '-1', '1,5', '1.5', 'deux']) {
      expect(parseComposant({ quantity, required: true }, contexte).ok).toBe(false)
    }
  })

  it('refuse une quantité au-delà du plafond, et accepte le plafond lui-même', () => {
    expect(
      parseComposant({ quantity: String(COMPOSANT_QUANTITE_MAX), required: true }, contexte).ok,
    ).toBe(true)
    expect(
      parseComposant({ quantity: String(COMPOSANT_QUANTITE_MAX + 1), required: true }, contexte)
        .ok,
    ).toBe(false)
  })

  it('refuse un composant non choisi', () => {
    const result = parseComposant(
      { quantity: '1', required: true },
      { ...contexte, composantId: '' },
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Choisissez')
  })
})

describe('raisonCompositionImpossible', () => {
  it('laisse composer une référence qui n’entre dans aucun kit', () => {
    expect(raisonCompositionImpossible({ dansDesKits: 0 })).toBeNull()
  })

  /*
    Le même refus que « pas de kit dans un kit », pris par l'autre bout : sans
    lui, on obtiendrait l'imbrication en ajoutant d'abord la référence simple
    au kit parent, puis en lui donnant une composition.
  */
  it('refuse une référence déjà incluse dans un kit, et dit ce qui tomberait à zéro', () => {
    const raison = raisonCompositionImpossible({ dansDesKits: 1 })
    expect(raison).toContain('kit dans un kit')
    expect(raison).toContain('zéro')
  })

  it('accorde le pluriel au nombre de kits', () => {
    expect(raisonCompositionImpossible({ dansDesKits: 1 })).toContain('1 kit :')
    expect(raisonCompositionImpossible({ dansDesKits: 3 })).toContain('3 kits :')
  })
})

describe('avertissementComposition', () => {
  it('ne dit rien d’une composition vide : elle n’est pas encore un kit', () => {
    expect(avertissementComposition([])).toBeNull()
  })

  it('ne dit rien dès qu’un composant est indispensable', () => {
    expect(avertissementComposition([{ required: false }, { required: true }])).toBeNull()
  })

  it('avertit quand tout est facultatif : la boutique déclarerait une rupture', () => {
    const note = avertissementComposition([{ required: false }, { required: false }])
    expect(note).toContain('rupture')
  })
})

/* -------------------------------------------------------------------------- */
/* Compatibilités                                                             */
/* -------------------------------------------------------------------------- */

describe('libelleVehicule', () => {
  it('n’écrit pas deux fois le modèle quand la génération le porte déjà', () => {
    expect(
      libelleVehicule({ marque: 'Volkswagen', modele: 'Golf', generation: 'Golf VII' }),
    ).toBe('Volkswagen Golf VII')
    expect(libelleVehicule({ marque: 'Volkswagen', modele: 'Golf 2', generation: 'Golf 2' })).toBe(
      'Volkswagen Golf 2',
    )
  })

  it('écrit le modèle quand la génération ne le porte pas', () => {
    expect(libelleVehicule({ marque: 'Peugeot', modele: '208', generation: 'II' })).toBe(
      'Peugeot 208 II',
    )
  })

  /*
    « 208 » n'est pas une génération du modèle « 20 » : sans coupure après le
    nom du modèle, le libellé désignerait un autre véhicule.
  */
  it('ne confond pas un modèle avec le début du nom d’un autre', () => {
    expect(libelleVehicule({ marque: 'Peugeot', modele: '20', generation: '208' })).toBe(
      'Peugeot 20 208',
    )
  })

  it('accepte une parenthèse ou un tiret juste après le nom du modèle', () => {
    expect(
      libelleVehicule({ marque: 'Mercedes-Benz', modele: '190', generation: '190 (W201)' }),
    ).toBe('Mercedes-Benz 190 (W201)')
  })

  it('ignore la casse et les espaces en trop', () => {
    expect(libelleVehicule({ marque: ' Audi ', modele: 'A3 ', generation: ' a3 8V' })).toBe(
      'Audi a3 8V',
    )
  })

  it('se passe d’un modèle vide', () => {
    expect(libelleVehicule({ marque: 'Ducati', modele: '', generation: '1098' })).toBe(
      'Ducati 1098',
    )
  })
})

describe('raisonCompatibiliteRefusee', () => {
  const ligne = {
    configurationId: 'conf-1',
    positionId: 'pos-croisement',
    variantId: 'var-1',
    libelle: 'Peugeot 208 II · Feu de croisement · OSR-H7',
  }
  const base = {
    configurationId: 'conf-1',
    positionId: 'pos-croisement',
    variantId: 'var-1',
    existantes: [] as (typeof ligne)[],
  }

  it('accepte une combinaison nouvelle', () => {
    expect(raisonCompatibiliteRefusee(base)).toBeNull()
  })

  it('refuse le doublon exact, en nommant la ligne à modifier', () => {
    const raison = raisonCompatibiliteRefusee({ ...base, existantes: [ligne] })
    expect(raison).toContain('déjà documentée')
    expect(raison).toContain('Peugeot 208 II')
  })

  it('accepte la même référence sur un autre emplacement', () => {
    expect(
      raisonCompatibiliteRefusee({ ...base, positionId: 'pos-route', existantes: [ligne] }),
    ).toBeNull()
  })

  it('accepte une autre référence sur le même emplacement', () => {
    expect(
      raisonCompatibiliteRefusee({ ...base, variantId: 'var-2', existantes: [ligne] }),
    ).toBeNull()
  })

  it('accepte la même référence sur une autre configuration', () => {
    expect(
      raisonCompatibiliteRefusee({ ...base, configurationId: 'conf-2', existantes: [ligne] }),
    ).toBeNull()
  })

  it('refuse un formulaire incomplet, quel que soit le champ manquant', () => {
    for (const manquant of ['configurationId', 'positionId', 'variantId'] as const) {
      const raison = raisonCompatibiliteRefusee({ ...base, [manquant]: '' })
      expect(raison).toContain('Choisissez')
    }
  })
})

describe('noteConfigurationInactive', () => {
  it('ne dit rien d’une configuration active', () => {
    expect(noteConfigurationInactive({ active: true })).toBeNull()
  })

  it('signale une configuration désactivée : le parcours véhicule l’ignore', () => {
    expect(noteConfigurationInactive({ active: false })).toContain('désactivée')
  })
})
