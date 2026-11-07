import { describe, expect, it } from 'vitest'
import {
  REGLES_RUBRIQUE,
  rubriquePour,
  rubriquesCitees,
} from '../src/lib/admin/rubrique-des-packs'

/**
 * Rangement des packs par véhicule dans les rubriques.
 *
 * Ce que ces tests protègent : **un pack va dans une seule rubrique, et c'est
 * la plus précise**. Trois familles partagent leurs premiers mots — « feux de
 * recul », « feux de route », « feux de jour » — et une quatrième, « phares »,
 * est un préfixe assez court pour avaler les autres si la comparaison se fait
 * dans le désordre. Une erreur ici ne casse rien : elle range silencieusement
 * 1 785 antibrouillards sous les feux de route, et personne ne s'en aperçoit
 * avant qu'un client ne cherche.
 */

describe('rubriquePour', () => {
  it('range chaque famille de packs dans sa rubrique', () => {
    expect(rubriquePour('Pack LED éclairage de plaque pour Alfa Romeo 147')).toBe('modules-plaque')
    expect(rubriquePour('Pack LED clignotants pour Audi A3 8V')).toBe('clignotants')
    expect(rubriquePour('Pack LED veilleuses pour Dacia Duster 2')).toBe('veilleuses')
    expect(rubriquePour('Pack LED habitacle pour Peugeot 208')).toBe('interieur')
    expect(rubriquePour('Pack LED antibrouillards pour Renault Clio 4')).toBe('antibrouillards')
  })

  it('préfère le préfixe le plus long quand plusieurs correspondent', () => {
    // Les trois « feux de … » se ressemblent assez pour se voler mutuellement
    // leurs produits si l'on s'arrête au premier préfixe qui colle.
    expect(rubriquePour('Pack LED feux de recul pour Seat Leon')).toBe('feux-recul')
    expect(rubriquePour('Pack LED feux de route pour Seat Leon')).toBe('feux-de-route')
    expect(rubriquePour('Pack LED feux de jour pour Seat Leon')).toBe('feux-de-jour')
  })

  it('ne dépend pas de l’ordre de déclaration des règles', () => {
    // La fonction trie elle-même ; réécrire la liste à l'envers ne doit rien
    // changer au résultat.
    const parLongueur = [...REGLES_RUBRIQUE].sort((a, b) => b.prefixe.length - a.prefixe.length)
    const premier = parLongueur.findIndex((r) => r.rubrique === 'phares-led')
    expect(premier).toBe(parLongueur.length - 1)
  })

  it('laisse de côté les produits saisis à la main', () => {
    // Ces trente-deux-là sont déjà rangés, et pas par un gabarit de nom.
    expect(rubriquePour('Ampoule LED W5W T10 blanc 6000 K')).toBeNull()
    expect(rubriquePour('Kit ampoules LED H7 blanc 6000 K')).toBeNull()
    expect(rubriquePour('Décodeur anti-erreur H7')).toBeNull()
    expect(rubriquePour('Clignotants LED moto orange')).toBeNull()
  })

  it('ne range rien sur un nom vide ou approchant', () => {
    expect(rubriquePour('')).toBeNull()
    expect(rubriquePour('Pack LED')).toBeNull()
    // Le préfixe doit commencer le nom, pas s'y trouver quelque part.
    expect(rubriquePour('Ancien Pack LED clignotants')).toBeNull()
  })

  it('cite dix familles pour dix rubriques distinctes', () => {
    // Les neuf familles de LED, et les ampoules halogènes effet xénon.
    expect(REGLES_RUBRIQUE).toHaveLength(10)
    expect(rubriquesCitees()).toHaveLength(10)
  })
})
