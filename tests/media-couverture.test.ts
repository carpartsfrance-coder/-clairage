import { describe, expect, it } from 'vitest'
import { ARGS_COUVERTURE, couverture, visuelsDeLaFiche } from '../src/lib/media-couverture'

/**
 * Choix du visuel de couverture.
 *
 * Ce que ces tests protègent : **la carte montre le feu allumé, pas le culot**.
 * C'est le seul visuel que voit un client qui parcourt le catalogue, et il
 * décide s'il ouvre la fiche. Une erreur ici ne casse rien — elle remet
 * simplement partout le packshot que l'on vient d'écarter.
 */

const rendu = { role: 'RESULT', media: { url: 'rendu.jpg' } }
const produit = { role: 'PRODUCT', media: { url: 'produit.jpg' } }
const kit = { role: 'KIT_CONTENT', media: { url: 'kit.jpg' } }

describe('couverture', () => {
  it('préfère le rendu au visuel produit', () => {
    expect(couverture([produit, rendu])).toBe(rendu)
  })

  it('ne dépend pas de l’ordre d’arrivée', () => {
    expect(couverture([rendu, produit])).toBe(rendu)
  })

  it('reprend le visuel produit quand il n’y a pas de rendu', () => {
    expect(couverture([produit])).toBe(produit)
  })

  it('garde le premier de son rôle, donc la position la plus basse', () => {
    const premier = { role: 'RESULT', media: { url: 'gros-plan.jpg' } }
    const second = { role: 'RESULT', media: { url: 'comparatif.jpg' } }
    expect(couverture([premier, second])).toBe(premier)
  })

  it('ignore les rôles qui ne représentent pas le produit', () => {
    // Le contenu d'un kit et une photo de montage ne sont pas des couvertures.
    expect(couverture([kit])).toBeUndefined()
  })

  it('ne renvoie rien sur une fiche sans visuel', () => {
    expect(couverture([])).toBeUndefined()
  })
})

describe('ARGS_COUVERTURE', () => {
  it('ne ramène que les deux rôles de couverture', () => {
    expect([...ARGS_COUVERTURE.where.role.in].sort()).toEqual(['PRODUCT', 'RESULT'])
  })

  it('en ramène assez pour que le rendu puisse l’emporter', () => {
    // Avec take: 1 trié par position, un visuel produit en position 0 sortirait
    // seul et le rendu ne serait jamais vu.
    expect(ARGS_COUVERTURE.take).toBeGreaterThan(1)
  })
})

describe('visuelsDeLaFiche', () => {
  const rendu = (caption: string) => ({ role: 'RESULT', media: { caption } })
  const produit = () => ({ role: 'PRODUCT', media: { caption: null } })

  it('écarte les visuels du fournisseur quand la fiche a ses rendus', () => {
    // Les visuels « produit » encore rattachés sont les vignettes reprises du
    // fournisseur, 219 × 183 à côté de rendus en 1024 × 1024. Elles partaient
    // aussi dans les données structurées, donc vers Google Shopping.
    const vus = visuelsDeLaFiche([
      rendu('Gros plan'),
      rendu('Avant et après'),
      rendu('Véhicule entier'),
      produit(),
      produit(),
    ])
    expect(vus).toHaveLength(3)
    expect(vus.every((entree) => entree.role === 'RESULT')).toBe(true)
  })

  it('garde les visuels produit quand la fiche n’a pas de rendu', () => {
    // Sans cette réserve, une fiche sans rendu n'aurait plus aucune image.
    const vus = visuelsDeLaFiche([produit(), produit()])
    expect(vus).toHaveLength(2)
  })

  it('ne montre qu’une image par vue', () => {
    // Deux fiches portaient deux jeux complets, l'ancienne série n'ayant pas
    // été détachée à la repose. La fiche racontait deux fois la même histoire.
    const vus = visuelsDeLaFiche([
      rendu('Gros plan'),
      rendu('Avant et après'),
      rendu('Véhicule entier'),
      rendu('Gros plan'),
      rendu('Avant et après'),
      rendu('Véhicule entier'),
    ])
    expect(vus.map((entree) => entree.media.caption)).toEqual([
      'Gros plan',
      'Avant et après',
      'Véhicule entier',
    ])
  })

  it('n’écarte jamais un visuel sans légende', () => {
    // Une légende absente ne dit rien de la vue : on ne peut pas en conclure
    // que c'est un doublon.
    const sansLegende = { role: 'RESULT', media: { caption: null } }
    const vus = visuelsDeLaFiche([rendu('Gros plan'), sansLegende, sansLegende])
    expect(vus).toHaveLength(3)
  })

  it('garde le contenu du kit et le montage : ils disent autre chose', () => {
    const vus = visuelsDeLaFiche([
      rendu('Gros plan'),
      { role: 'KIT_CONTENT', media: { caption: 'Le kit' } },
      { role: 'INSTALL', media: { caption: 'Le montage' } },
      produit(),
    ])
    expect(vus.map((entree) => entree.role)).toEqual(['RESULT', 'KIT_CONTENT', 'INSTALL'])
  })
})
