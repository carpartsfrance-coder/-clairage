import { describe, expect, it } from 'vitest'
import { deplacer, ordreAffichage } from '../src/lib/admin/media-order'

/**
 * Ordre des visuels d'une fiche produit.
 *
 * Ce que ces tests protègent n'est pas un confort d'écran : c'est **ce que le
 * client voit en premier**. Le premier visuel de rôle « Produit » est la
 * vignette du produit dans tout le catalogue et ouvre la galerie ; la galerie
 * publique regroupe par rôle, dans l'ordre `PRODUCT`, `RESULT`, `KIT_CONTENT`,
 * `INSTALL`, et classe par position à l'intérieur d'un groupe.
 *
 * Deux promesses, donc :
 *
 *   1. **Le back-office montre la séquence que la boutique affichera.** Trier
 *      autrement rendrait les flèches de déplacement indéchiffrables : on
 *      cliquerait sur « avancer » sans savoir devant quoi.
 *   2. **Une flèche ne change jamais le rôle d'un visuel.** Faire sortir une
 *      photo de son groupe en la montant d'un cran transformerait un rendu en
 *      packshot — la fiche affirmerait autre chose que ce qu'elle montre.
 */

type Element = { id: string; role: string; position: number }

/** Raccourci de lecture : « a:PRODUCT:0 » → l'élément correspondant. */
function elements(...descriptions: string[]): Element[] {
  return descriptions.map((description) => {
    const [id, role, position] = description.split(':')
    return { id, role, position: Number(position) }
  })
}

describe('ordreAffichage', () => {
  it('groupe par rôle dans l’ordre de la galerie, et non par position', () => {
    const items = elements('montage:INSTALL:0', 'rendu:RESULT:1', 'produit:PRODUCT:2')
    expect(ordreAffichage(items).map((item) => item.id)).toEqual(['produit', 'rendu', 'montage'])
  })

  it('classe par position à l’intérieur d’un groupe', () => {
    const items = elements('b:PRODUCT:2', 'a:PRODUCT:1', 'c:PRODUCT:3')
    expect(ordreAffichage(items).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('conserve l’ordre reçu quand les positions sont égales', () => {
    // Le cas des fiches importées : l'import laisse toutes les positions à 0.
    // Un tri instable ferait changer la vignette du catalogue d'un affichage à
    // l'autre, sans que personne n'ait rien modifié.
    const items = elements('a:PRODUCT:0', 'b:PRODUCT:0', 'c:PRODUCT:0')
    expect(ordreAffichage(items).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('range en fin les rôles inconnus plutôt que de les perdre', () => {
    const items = elements('bizarre:AUTRE:0', 'produit:PRODUCT:1')
    expect(ordreAffichage(items).map((item) => item.id)).toEqual(['produit', 'bizarre'])
  })

  it('ne modifie pas la liste reçue', () => {
    const items = elements('rendu:RESULT:0', 'produit:PRODUCT:1')
    ordreAffichage(items)
    expect(items.map((item) => item.id)).toEqual(['rendu', 'produit'])
  })
})

describe('deplacer', () => {
  const galerie = elements(
    'p1:PRODUCT:0',
    'p2:PRODUCT:1',
    'p3:PRODUCT:2',
    'r1:RESULT:3',
    'r2:RESULT:4',
  )

  it('échange avec le voisin précédent du même rôle', () => {
    expect(deplacer(galerie, 'p3', 'avant')).toEqual(['p1', 'p3', 'p2', 'r1', 'r2'])
  })

  it('échange avec le voisin suivant du même rôle', () => {
    expect(deplacer(galerie, 'p1', 'apres')).toEqual(['p2', 'p1', 'p3', 'r1', 'r2'])
  })

  it('met en tête de son groupe, et pas en tête de la fiche', () => {
    // « En tête » sur un rendu ne doit pas le faire passer devant les
    // packshots : il resterait un rendu, mais deviendrait le premier visuel de
    // la fiche sans l'être dans la galerie.
    expect(deplacer(galerie, 'r2', 'premier')).toEqual(['p1', 'p2', 'p3', 'r2', 'r1'])
  })

  it('met en tête du catalogue le visuel produit promu', () => {
    expect(deplacer(galerie, 'p3', 'premier')).toEqual(['p3', 'p1', 'p2', 'r1', 'r2'])
  })

  it('ne franchit pas la frontière de rôle en montant', () => {
    // r1 est juste après p3 dans la séquence affichée : le monter d'un cran
    // n'a aucun voisin du même rôle devant lui.
    expect(deplacer(galerie, 'r1', 'avant')).toBeNull()
  })

  it('ne franchit pas la frontière de rôle en descendant', () => {
    expect(deplacer(galerie, 'p3', 'apres')).toBeNull()
  })

  it('ne renvoie rien à écrire quand le visuel est déjà en tête', () => {
    expect(deplacer(galerie, 'p1', 'avant')).toBeNull()
    expect(deplacer(galerie, 'p1', 'premier')).toBeNull()
  })

  it('refuse un identifiant absent de la fiche', () => {
    expect(deplacer(galerie, 'inconnu', 'avant')).toBeNull()
  })

  it('travaille sur l’ordre d’affichage, pas sur l’ordre reçu', () => {
    // Les lignes arrivent de la base triées par position : un rendu peut
    // précéder un packshot. Le déplacement doit raisonner sur la séquence que
    // la boutique affiche, sinon « avancer » saute un visuel.
    const brut = elements('r1:RESULT:0', 'p1:PRODUCT:1', 'p2:PRODUCT:2')
    expect(deplacer(brut, 'p2', 'avant')).toEqual(['p2', 'p1', 'r1'])
  })

  it('renvoie une séquence complète, prête à être numérotée', () => {
    const ordre = deplacer(galerie, 'p2', 'apres')
    expect(ordre).toHaveLength(galerie.length)
    expect(new Set(ordre)).toEqual(new Set(galerie.map((item) => item.id)))
  })
})
