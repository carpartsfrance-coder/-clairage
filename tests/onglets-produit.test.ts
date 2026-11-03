import { describe, expect, it } from 'vitest'
import type { Manque } from '../src/lib/admin/completeness'
import {
  ONGLETS,
  ONGLET_LABELS,
  cibleDuManque,
  isOnglet,
  ongletDemande,
  ongletsAvecManque,
} from '../src/lib/admin/onglets-produit'

/**
 * Découpage de la fiche produit en onglets.
 *
 * Ce que ces tests protègent tient en une phrase : **un manque doit rester
 * atteignable**. Le relevé des manques existe pour qu'on ne découvre pas un
 * trou après la publication ; découper l'écran en six onglets peut cacher ces
 * trous au lieu de les montrer. D'où la pastille sur l'onglet concerné, et le
 * lien qui ouvre l'onglet qui corrige.
 *
 * Les libellés de manques portent un suffixe variable — la référence, le
 * nombre de lignes — et le rapprochement se fait donc sur leur début. Un
 * libellé modifié dans `completeness.ts` sans sa contrepartie ici donnerait un
 * manque sans lien : silencieux, et exactement le genre de chose qu'on ne
 * remarque pas.
 */

const manque = (champ: string): Manque => ({ champ, niveau: 'important', consequence: '—' })

describe('ongletDemande', () => {
  it('retient un onglet connu', () => {
    expect(ongletDemande('medias')).toBe('medias')
  })

  it('retombe sur la fiche quand l’adresse ne dit rien', () => {
    expect(ongletDemande(undefined)).toBe('fiche')
    expect(ongletDemande('')).toBe('fiche')
    expect(ongletDemande('   ')).toBe('fiche')
  })

  it('retombe sur la fiche plutôt que de montrer une page vide', () => {
    expect(ongletDemande('inconnu')).toBe('fiche')
    expect(ongletDemande('MEDIAS')).toBe('fiche')
  })
})

describe('isOnglet', () => {
  it('reconnaît les six onglets, et rien d’autre', () => {
    for (const onglet of ONGLETS) expect(isOnglet(onglet)).toBe(true)
    expect(isOnglet('visuels')).toBe(false)
  })

  it('donne un libellé à chacun', () => {
    for (const onglet of ONGLETS) expect(ONGLET_LABELS[onglet]).toBeTruthy()
  })
})

describe('cibleDuManque', () => {
  /*
    Le test le plus utile du fichier : chaque manque que `completeness.ts` sait
    produire doit trouver sa cible. Les libellés à suffixe sont donnés ici avec
    leur suffixe, tels qu'ils apparaissent à l'écran.
  */
  it('place chaque manque connu', () => {
    const attendus: Array<[string, string | null]> = [
      ['Conditionnement', 'prix'],
      ['Prix — LUM-H7-01', 'prix'],
      ['Taux de TVA — LUM-H7-01', 'prix'],
      ['Rubrique', null],
      ['Visuels', 'medias'],
      ['Texte alternatif — 3 visuels', 'medias'],
      ['Accroche', 'fiche'],
      ['Caractéristiques', 'carac'],
      ['Source de compatibilité — 2 lignes', 'compat'],
      ['Référencement', 'seo'],
      ['Rédactionnel', 'fiche'],
    ]
    for (const [champ, onglet] of attendus) {
      const cible = cibleDuManque(champ)
      expect(cible, champ).not.toBeNull()
      expect(cible?.onglet, champ).toBe(onglet)
      expect(cible?.libelle, champ).toBeTruthy()
    }
  })

  it('n’invente pas de cible pour un libellé inconnu', () => {
    expect(cibleDuManque('Quelque chose de neuf')).toBeNull()
  })

  it('renvoie un verbe, pas le nom de l’onglet', () => {
    expect(cibleDuManque('Texte alternatif — 3 visuels')?.libelle).toContain('Compléter')
    expect(cibleDuManque('Rubrique')?.libelle).toContain('Choisir')
  })

  /*
    « Rubrique » se corrige dans la colonne de droite, visible depuis tous les
    onglets : il n'y a nulle part où envoyer le lecteur.
  */
  it('ne renvoie vers aucun onglet pour ce qui se corrige dans la colonne de droite', () => {
    expect(cibleDuManque('Rubrique')?.onglet).toBeNull()
  })
})

describe('ongletsAvecManque', () => {
  it('ne marque aucun onglet quand rien ne manque', () => {
    expect(ongletsAvecManque([]).size).toBe(0)
  })

  it('marque l’onglet de chaque manque, sans doublon', () => {
    const avec = ongletsAvecManque([
      manque('Visuels'),
      manque('Texte alternatif — 3 visuels'),
      manque('Caractéristiques'),
    ])
    expect([...avec].sort()).toEqual(['carac', 'medias'])
  })

  it('ne marque pas d’onglet pour un manque de la colonne de droite', () => {
    expect(ongletsAvecManque([manque('Rubrique')]).size).toBe(0)
  })

  it('ignore un libellé inconnu au lieu de lever', () => {
    expect(ongletsAvecManque([manque('Inconnu au bataillon')]).size).toBe(0)
  })
})
