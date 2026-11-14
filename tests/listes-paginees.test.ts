import { describe, expect, it } from 'vitest'
import { indexationDeListe } from '../src/lib/seo/listes-paginees'

/**
 * Règle d'indexation des listes paginées (rubriques et culots).
 *
 * Elle a déjà été fausse une fois : toute page 2 était renvoyée sur la page 1
 * par une canonique et marquée `noindex`. Google explore de moins en moins les
 * pages qu'on lui dit d'ignorer et finit par ne plus suivre leurs liens — or
 * la pagination est l'un des deux chemins internes vers les 30 000 fiches.
 * Le 14 novembre 2026, la Search Console comptait 12 857 adresses « détectées,
 * actuellement non indexées » : connues de Google, jamais visitées.
 *
 * Ces tests tiennent les quatre cas, dont les deux qu'il ne faut surtout pas
 * confondre : une page 2 n'est pas un doublon, une page filtrée en est un.
 */
describe('indexation des listes paginées', () => {
  it('laisse la première page telle quelle', () => {
    expect(indexationDeListe({ page: 1, dernierePage: 178, filtree: false })).toEqual({
      numerotee: false,
      horsIndex: false,
    })
  })

  it('rend les pages suivantes indexables et canoniques d’elles-mêmes', () => {
    for (const page of [2, 3, 177, 178]) {
      expect(indexationDeListe({ page, dernierePage: 178, filtree: false }), `page ${page}`).toEqual(
        { numerotee: true, horsIndex: false },
      )
    }
  })

  it('ferme les pages au-delà de la dernière', () => {
    /*
      Elles répondent 200 avec un listing vide. Les laisser indexables
      ouvrirait un nombre illimité de pages vides à explorer.
    */
    for (const page of [179, 5000]) {
      expect(indexationDeListe({ page, dernierePage: 178, filtree: false }), `page ${page}`).toEqual(
        { numerotee: false, horsIndex: true },
      )
    }
  })

  it('ferme les pages filtrées, paginées ou non', () => {
    // Autant de pages que de combinaisons de cases : aucune n'a à être indexée.
    expect(indexationDeListe({ page: 1, dernierePage: 178, filtree: true })).toEqual({
      numerotee: false,
      horsIndex: true,
    })
    expect(indexationDeListe({ page: 2, dernierePage: 178, filtree: true })).toEqual({
      numerotee: false,
      horsIndex: true,
    })
  })

  it('ferme une liste sans produit en ligne', () => {
    // La page reste ouverte pour un lien ancien, mais « aucun produit » déçoit
    // le visiteur venu de Google et pèse sur la qualité du site.
    expect(indexationDeListe({ page: 1, dernierePage: 1, filtree: false, vide: true })).toEqual({
      numerotee: false,
      horsIndex: true,
    })
  })
})
