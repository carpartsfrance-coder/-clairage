import { describe, expect, it } from 'vitest'
import {
  FITMENT_STATUSES,
  ROAD_APPROVALS,
  VEHICLE_TYPE_LABELS,
  deletionBlockedReason,
  isValidSlug,
  parseFitment,
  parseISODate,
  parsePeriod,
  periodLabel,
  resolveSlug,
  slugify,
  typePath,
  vehiclePackPath,
} from '../src/lib/admin/vehicles'

/**
 * Règles d'écriture du référentiel véhicule.
 *
 * Ce que ces tests protègent n'est pas du formatage : ce sont les deux
 * promesses que la boutique fait à ses clients.
 *
 *   1. **Une adresse publique ne bouge pas toute seule.** Les slugs sont dans
 *      les URL `/packs/...` ; un renommage qui les déplacerait casserait en
 *      silence des liens partagés et indexés.
 *   2. **Une compatibilité n'est confirmée que si elle a été vérifiée.** Le
 *      statut par défaut est « à vérifier », et `CONFIRMED` sans source ni
 *      date est refusé — rien n'est jamais pré-rempli à la place de la
 *      personne qui saisit.
 *
 * Le reste du back-office véhicule s'appuie sur ces fonctions ; elles sont
 * pures pour pouvoir être vérifiées sans base.
 */

/* -------------------------------------------------------------------------- */
/* Adresses publiques                                                         */
/* -------------------------------------------------------------------------- */

describe('slugify', () => {
  it('retire les accents plutôt que de les remplacer par un trait d’union', () => {
    expect(slugify('Citroën')).toBe('citroen')
    expect(slugify('Škoda')).toBe('skoda')
  })

  it('écrase les séparateurs répétés et les bords', () => {
    expect(slugify('BMW  Série 3')).toBe('bmw-serie-3')
    expect(slugify('  Golf VII  ')).toBe('golf-vii')
    expect(slugify('--Golf--')).toBe('golf')
  })

  it('conserve les chiffres, qui distinguent la plupart des modèles', () => {
    expect(slugify('Peugeot 2008')).toBe('peugeot-2008')
    expect(slugify('MT-07')).toBe('mt-07')
  })

  it('ne rend rien d’utilisable quand le nom n’a ni lettre ni chiffre', () => {
    expect(slugify('—')).toBe('')
    expect(slugify('   ')).toBe('')
  })
})

describe('isValidSlug', () => {
  it('accepte ce que slugify produit', () => {
    for (const nom of ['Citroën C3', 'MT-07', 'Golf VII phase 2']) {
      expect(isValidSlug(slugify(nom))).toBe(true)
    }
  })

  it('refuse les majuscules, les bords et les doublons de tiret', () => {
    expect(isValidSlug('Golf')).toBe(false)
    expect(isValidSlug('-golf')).toBe(false)
    expect(isValidSlug('golf-')).toBe(false)
    expect(isValidSlug('golf--vii')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })
})

describe('resolveSlug', () => {
  it('dérive l’adresse du nom quand le champ est laissé vide', () => {
    expect(resolveSlug({ name: 'Volkswagen', slug: '' })).toEqual({ ok: true, value: 'volkswagen' })
    expect(resolveSlug({ name: 'Volkswagen', slug: null })).toEqual({
      ok: true,
      value: 'volkswagen',
    })
  })

  it('préfère l’adresse demandée au nom', () => {
    // Une boutique peut vouloir /packs/auto/vw plutôt que /volkswagen.
    expect(resolveSlug({ name: 'Volkswagen', slug: 'vw' })).toEqual({ ok: true, value: 'vw' })
  })

  it('normalise ce qui est saisi à la main', () => {
    expect(resolveSlug({ name: 'Peu importe', slug: 'Golf VII' })).toEqual({
      ok: true,
      value: 'golf-vii',
    })
  })

  it('refuse plutôt que d’inventer une adresse vide', () => {
    const resultat = resolveSlug({ name: '???', slug: '' })
    expect(resultat.ok).toBe(false)
  })

  it('refuse une adresse démesurée', () => {
    expect(resolveSlug({ name: 'a'.repeat(81) }).ok).toBe(false)
  })
})

describe('vehiclePackPath', () => {
  it('construit l’adresse publique niveau par niveau', () => {
    expect(vehiclePackPath('auto', 'volkswagen')).toBe('/packs/auto/volkswagen')
    expect(vehiclePackPath('auto', 'volkswagen', 'golf')).toBe('/packs/auto/volkswagen/golf')
    expect(vehiclePackPath('moto', 'yamaha', 'mt-07', 'rm-2021')).toBe(
      '/packs/moto/yamaha/mt-07/rm-2021',
    )
  })

  it('s’arrête au premier niveau manquant, sans laisser de segment vide', () => {
    expect(vehiclePackPath('auto', 'volkswagen', null, 'golf-vii')).toBe('/packs/auto/volkswagen')
  })
})

describe('typePath', () => {
  it('traduit les deux types que les parcours publics servent', () => {
    expect(typePath('CAR')).toBe('auto')
    expect(typePath('MOTORCYCLE')).toBe('moto')
  })

  it('n’invente pas de parcours pour « voiture et moto »', () => {
    // `listPackMakes` filtre sur un type précis : une marque BOTH n'est
    // listée nulle part, et l'écran doit pouvoir le dire.
    expect(typePath('BOTH')).toBeNull()
  })

  it('a un libellé pour chaque type', () => {
    for (const type of ['CAR', 'MOTORCYCLE', 'BOTH'] as const) {
      expect(VEHICLE_TYPE_LABELS[type]).toBeTruthy()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Périodes                                                                   */
/* -------------------------------------------------------------------------- */

const EN_2026 = new Date(Date.UTC(2026, 9, 19))

describe('parsePeriod', () => {
  it('accepte une période fermée', () => {
    expect(parsePeriod('2012', '2019', EN_2026)).toEqual({
      ok: true,
      value: { yearFrom: 2012, yearTo: 2019 },
    })
  })

  it('traite une fin vide comme « toujours produite »', () => {
    expect(parsePeriod('2019', '', EN_2026)).toEqual({
      ok: true,
      value: { yearFrom: 2019, yearTo: null },
    })
  })

  it('refuse une fin antérieure au début au lieu de les inverser', () => {
    // On ne sait pas laquelle des deux est fausse : corriger serait deviner.
    const resultat = parsePeriod('2019', '2012', EN_2026)
    expect(resultat.ok).toBe(false)
  })

  it('exige une année de début', () => {
    expect(parsePeriod('', '2019', EN_2026).ok).toBe(false)
    expect(parsePeriod('bientôt', '', EN_2026).ok).toBe(false)
  })

  it('borne le futur à deux ans, pour les millésimes annoncés', () => {
    expect(parsePeriod('2028', '', EN_2026).ok).toBe(true)
    expect(parsePeriod('2029', '', EN_2026).ok).toBe(false)
    expect(parsePeriod('2020', '2029', EN_2026).ok).toBe(false)
  })

  it('refuse une année antérieure à l’automobile', () => {
    expect(parsePeriod('1899', '', EN_2026).ok).toBe(false)
    expect(parsePeriod('1900', '', EN_2026).ok).toBe(true)
  })
})

describe('periodLabel', () => {
  it('dit « depuis » quand la production continue', () => {
    expect(periodLabel(2019, null)).toBe('depuis 2019')
    expect(periodLabel(2012, 2019)).toBe('2012–2019')
  })
})

/* -------------------------------------------------------------------------- */
/* Dates de vérification                                                      */
/* -------------------------------------------------------------------------- */

describe('parseISODate', () => {
  it('lit la date en UTC, sans dérive de fuseau', () => {
    const date = parseISODate('2026-03-01')
    expect(date?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('refuse un jour qui n’existe pas', () => {
    // `Date.UTC(2026, 1, 31)` donnerait le 3 mars sans broncher.
    expect(parseISODate('2026-02-31')).toBeNull()
  })

  it('n’accepte que le format du champ date', () => {
    expect(parseISODate('01/03/2026')).toBeNull()
    expect(parseISODate('2026-3-1')).toBeNull()
    expect(parseISODate('')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Compatibilités                                                             */
/* -------------------------------------------------------------------------- */

const MAINTENANT = new Date(Date.UTC(2026, 9, 19))

/** Raccourci : la fonction renvoie une union, les tests veulent la valeur. */
function valeur(input: Parameters<typeof parseFitment>[0]) {
  const resultat = parseFitment(input, MAINTENANT)
  if (!resultat.ok) throw new Error(`refusé : ${resultat.error}`)
  return resultat.value
}

describe('parseFitment — statut', () => {
  it('retient « à vérifier » quand rien n’est dit', () => {
    expect(valeur({}).status).toBe('UNKNOWN')
    expect(valeur({ status: '' }).status).toBe('UNKNOWN')
  })

  it('ne promeut jamais un statut illisible en « confirmée »', () => {
    // Le pire cas doit rester le plus prudent : une valeur inconnue venant
    // d'un formulaire trafiqué ne doit pas valoir confirmation.
    expect(valeur({ status: 'OUI' }).status).toBe('UNKNOWN')
    expect(valeur({ status: 'compatible' }).status).toBe('UNKNOWN')
    expect(valeur({ status: 'CONFIRMÉ' }).status).toBe('UNKNOWN')
  })

  it('accepte les trois statuts du schéma', () => {
    expect(valeur({ status: 'incompatible' }).status).toBe('INCOMPATIBLE')
    expect(
      valeur({ status: 'CONFIRMED', source: 'Essai atelier', verifiedAt: '2026-03-01' }).status,
    ).toBe('CONFIRMED')
    expect(FITMENT_STATUSES).toHaveLength(3)
  })
})

describe('parseFitment — une confirmation se justifie', () => {
  it('refuse « confirmée » sans source', () => {
    const resultat = parseFitment(
      { status: 'CONFIRMED', verifiedAt: '2026-03-01' },
      MAINTENANT,
    )
    expect(resultat.ok).toBe(false)
  })

  it('refuse « confirmée » sans date de vérification', () => {
    const resultat = parseFitment({ status: 'CONFIRMED', source: 'Valeo' }, MAINTENANT)
    expect(resultat.ok).toBe(false)
  })

  it('n’invente pas de date quand il n’y en a pas', () => {
    // Le point le plus important du fichier : poser `new Date()` ici
    // inscrirait comme vérifiée une compatibilité que personne n'a vérifiée.
    expect(valeur({ status: 'UNKNOWN' }).verifiedAt).toBeNull()
    expect(valeur({ status: 'INCOMPATIBLE', source: 'Valeo' }).verifiedAt).toBeNull()
  })

  it('conserve source et date sur une incompatibilité', () => {
    // « Vérifié le 1er mars auprès de Valeo, ne convient pas » est une
    // information utile : l'effacer ferait refaire le travail.
    const resultat = valeur({
      status: 'INCOMPATIBLE',
      source: 'Valeo',
      verifiedAt: '2026-03-01',
    })
    expect(resultat.source).toBe('Valeo')
    expect(resultat.verifiedAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('refuse une vérification datée du futur', () => {
    const resultat = parseFitment(
      { status: 'CONFIRMED', source: 'Valeo', verifiedAt: '2026-12-01' },
      MAINTENANT,
    )
    expect(resultat.ok).toBe(false)
  })

  it('accepte une vérification du jour même', () => {
    const resultat = parseFitment(
      { status: 'CONFIRMED', source: 'Valeo', verifiedAt: '2026-10-19' },
      MAINTENANT,
    )
    expect(resultat.ok).toBe(true)
  })

  it('refuse une date impossible plutôt que de la décaler', () => {
    expect(parseFitment({ verifiedAt: '2026-02-31' }, MAINTENANT).ok).toBe(false)
  })
})

describe('parseFitment — quantité, homologation, textes', () => {
  it('vaut 1 par défaut', () => {
    expect(valeur({}).quantity).toBe(1)
    expect(valeur({ quantity: '' }).quantity).toBe(1)
    expect(valeur({ quantity: '2' }).quantity).toBe(2)
  })

  it('refuse une quantité nulle, négative, décimale ou démesurée', () => {
    for (const quantity of ['0', '-1', '1,5', '1.5', '100', 'deux']) {
      expect(parseFitment({ quantity }, MAINTENANT).ok).toBe(false)
    }
  })

  it('ne déduit jamais l’homologation de la compatibilité', () => {
    // Un kit peut se monter sans être homologué : confirmer le montage ne
    // dit rien de la route.
    const resultat = valeur({ status: 'CONFIRMED', source: 'Valeo', verifiedAt: '2026-03-01' })
    expect(resultat.roadApproval).toBe('UNKNOWN')
    expect(ROAD_APPROVALS).toContain('UNKNOWN')
  })

  it('retombe sur « inconnue » pour une homologation illisible', () => {
    expect(valeur({ roadApproval: 'peut-être' }).roadApproval).toBe('UNKNOWN')
    expect(valeur({ roadApproval: 'approved' }).roadApproval).toBe('APPROVED')
  })

  it('retient FR par défaut et met le marché en capitales', () => {
    expect(valeur({}).approvalMarket).toBe('FR')
    expect(valeur({ approvalMarket: 'de' }).approvalMarket).toBe('DE')
    expect(parseFitment({ approvalMarket: 'France' }, MAINTENANT).ok).toBe(false)
  })

  it('ramène les textes vides à null plutôt qu’à une chaîne vide', () => {
    const resultat = valeur({ restrictions: '   ', approvalNote: '', source: '  ' })
    expect(resultat.restrictions).toBeNull()
    expect(resultat.approvalNote).toBeNull()
    expect(resultat.source).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Suppressions                                                               */
/* -------------------------------------------------------------------------- */

describe('deletionBlockedReason', () => {
  it('laisse supprimer une ligne qui ne porte rien', () => {
    expect(deletionBlockedReason('make', { children: 0, fitments: 0 })).toBeNull()
  })

  it('refuse dès qu’une compatibilité est en jeu, et dit de désactiver', () => {
    const raison = deletionBlockedReason('generation', { children: 1, fitments: 3 })
    expect(raison).toContain('3 compatibilités')
    expect(raison).toContain('Désactivez')
  })

  it('refuse aussi une ligne qui porte des enfants sans compatibilité', () => {
    const raison = deletionBlockedReason('make', { children: 2, fitments: 0 })
    expect(raison).toContain('2 modèles')
  })

  it('accorde le singulier', () => {
    expect(deletionBlockedReason('model', { children: 1, fitments: 0 })).toContain('1 génération')
    expect(deletionBlockedReason('model', { children: 0, fitments: 1 })).toContain(
      '1 compatibilité ',
    )
  })

  it('nomme le bon niveau', () => {
    expect(deletionBlockedReason('make', { children: 1, fitments: 0 })).toContain('Cette marque')
    expect(deletionBlockedReason('model', { children: 1, fitments: 0 })).toContain('Ce modèle')
    expect(deletionBlockedReason('generation', { children: 1, fitments: 0 })).toContain(
      'Cette génération',
    )
  })
})
