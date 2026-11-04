import { describe, expect, it } from 'vitest'
import {
  POSITION_PAR_TYPE,
  VUES,
  cleDuDossier,
  meilleurRang,
  sansAnnees,
} from '../src/lib/admin/photos-suivi'

/**
 * Rapprochement photos ↔ fiches.
 *
 * Ce que ces tests protègent : **une photo ne doit jamais atterrir sur la
 * mauvaise voiture**. Le rapprochement tient à deux gestes — enlever les années
 * du dossier, traduire la famille en position — et chacun peut se tromper en
 * silence. Un segment mal coupé rapproche deux véhicules différents ; une
 * famille mal traduite montre des antibrouillards sur une fiche de plaque. Le
 * client ne verrait pas l'erreur, il verrait l'éclairage d'une autre voiture.
 */

describe('sansAnnees', () => {
  it('retire une plage ou une année seule', () => {
    expect(sansAnnees('duster-2010-2017')).toBe('duster')
    expect(sansAnnees('polo-5-6r-6c1-2009-2017')).toBe('polo-5-6r-6c1')
    expect(sansAnnees('500-2007-2026')).toBe('500')
    expect(sansAnnees('clio-4-2012')).toBe('clio-4')
  })

  it('ne prend pas une cylindrée pour un millésime', () => {
    // Sans le bornage, « tiger-sport-1050 » deviendrait « tiger-sport » et
    // irait chercher une génération qui n'existe pas.
    expect(sansAnnees('tiger-sport-1050')).toBe('tiger-sport-1050')
    expect(sansAnnees('zforce-800')).toBe('zforce-800')
    expect(sansAnnees('mazda3-mk4')).toBe('mazda3-mk4')
    expect(sansAnnees('206-plus')).toBe('206-plus')
  })

  it('laisse intact ce qui ne finit pas par des chiffres', () => {
    expect(sansAnnees('expert')).toBe('expert')
    expect(sansAnnees('')).toBe('')
  })
})

describe('cleDuDossier', () => {
  it('lit la marque et la génération', () => {
    expect(cleDuDossier('dacia/duster-2010-2017/pack-plaque-p5287')).toEqual({
      marque: 'dacia',
      generation: 'duster',
    })
  })

  it('traduit les marques que les deux côtés n’écrivent pas pareil', () => {
    // « mercedes » d'un côté, « mercedes-benz » de l'autre : sans la table,
    // 759 lignes de suivi ne retombent sur rien et la marque paraît absente.
    expect(cleDuDossier('mercedes/classe-c-w203-2000-2007/pack-p1')).toEqual({
      marque: 'mercedes-benz',
      generation: 'classe-c-w203',
    })
  })

  it('laisse intactes les marques qui s’écrivent pareil', () => {
    expect(cleDuDossier('land-rover/range-rover-l322-2002-2012/pack-p2')?.marque).toBe('land-rover')
  })

  it('refuse un chemin incomplet plutôt que d’en inventer un', () => {
    expect(cleDuDossier('dacia/duster-2010-2017')).toBeNull()
    expect(cleDuDossier('dacia')).toBeNull()
    expect(cleDuDossier('')).toBeNull()
  })
})

describe('POSITION_PAR_TYPE', () => {
  it('traduit les familles que le catalogue connaît', () => {
    expect(POSITION_PAR_TYPE.plaque).toBe('PLATE')
    expect(POSITION_PAR_TYPE['veilleuses-feux-de-jour']).toBe('SIDELIGHT')
    expect(POSITION_PAR_TYPE.interieur).toBe('INTERIOR_DOME')
  })

  it('ignore les familles que le catalogue ne vend pas', () => {
    // Clignotants arrière, répétiteurs, antibrouillards arrière, tableau de
    // bord : aucun pack ne leur correspond. Les traduire au jugé poserait ces
    // photos sur une fiche voisine.
    for (const absent of [
      'clignotants-arriere',
      'repetiteurs',
      'antibrouillard-arriere',
      'tableau-de-bord',
      'autre',
    ]) {
      expect(POSITION_PAR_TYPE[absent]).toBeUndefined()
    }
  })
})

describe('meilleurRang', () => {
  it('garde le rang le plus petit, donc le plus vendu', () => {
    const lignes = [
      { rang: '412', type: 'phares', dossier: 'a/b/c', statut: 'fait' },
      { rang: '37', type: 'phares', dossier: 'a/b/d', statut: 'fait' },
      { rang: '208', type: 'phares', dossier: 'a/b/e', statut: 'fait' },
    ]
    expect(meilleurRang(lignes)?.rang).toBe('37')
  })

  it('compare des nombres, pas des textes', () => {
    // En comparaison de chaînes, « 1000 » passe avant « 99 ».
    const lignes = [
      { rang: '1000', type: 'plaque', dossier: 'a/b/c', statut: 'fait' },
      { rang: '99', type: 'plaque', dossier: 'a/b/d', statut: 'fait' },
    ]
    expect(meilleurRang(lignes)?.rang).toBe('99')
  })

  it('ne renvoie rien sur une liste vide ou illisible', () => {
    expect(meilleurRang([])).toBeNull()
    expect(meilleurRang([{ rang: 'x', type: 'plaque', dossier: 'a/b/c', statut: 'fait' }])).toBeNull()
  })
})

describe('VUES', () => {
  it('met le comparatif en tête', () => {
    expect(VUES.map((v) => v.fichier)).toEqual([
      '01-avant-apres.jpg',
      '03-gros-plan.jpg',
      '02-vehicule-complet.jpg',
    ])
  })

  it('écrit un alt qui nomme la voiture et la position', () => {
    const alt = VUES[0].alt('éclairage de plaque', 'Peugeot 308 II')
    expect(alt).toContain('éclairage de plaque')
    expect(alt).toContain('Peugeot 308 II')
  })

  it('n’accorde jamais la position, qui est tantôt au singulier', () => {
    // « éclairage de plaque » et « veilleuses » passent dans la même phrase :
    // un article ou un participe accordé en rendrait une des deux fautive.
    for (const vue of VUES) {
      for (const position of ['éclairage de plaque', 'veilleuses', 'habitacle']) {
        const alt = vue.alt(position, 'Renault Clio 4')
        expect(alt).toContain(`— ${position} `)
        expect(alt).not.toMatch(new RegExp(`(le|la|les|du|des) ${position}`))
      }
    }
  })

  it('garde des légendes courtes : elles s’affichent sur la photo', () => {
    // Une légende longue se replie en travers de l'image, le cartouche ne fait
    // que 75 % de la largeur.
    for (const vue of VUES) expect(vue.legende.length).toBeLessThanOrEqual(16)
  })
})
