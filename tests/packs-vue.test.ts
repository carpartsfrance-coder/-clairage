import { describe, expect, it } from 'vitest'
import type { PackPositionGroup, PackProduct } from '../src/lib/queries/packs'
import {
  cartesDesPacks,
  libelleDeLaZone,
  nomDuConditionnement,
  produitsSitues,
  totalDesCartes,
  totalVehicule,
  zoneDeLEmplacement,
  zonesPresentes,
} from '../src/lib/packs-vue'
import { nomUtileDuConditionnement } from '../src/lib/nom-conditionnement'

/**
 * Mise en forme de la page véhicule.
 *
 * Ce que ces tests protègent : **le total doit être celui des prix affichés**.
 * Un client qui additionne les cartes doit retomber sur le chiffre annoncé ; un
 * écart, même d'un euro, fait douter de tout le reste de la page. D'où le
 * dédoublonnage — un produit servant deux emplacements n'est acheté qu'une
 * fois — et l'exclusion des incompatibles, qu'on vient de déconseiller.
 */

function produit(slug: string, prix: number, extra: Partial<PackProduct> = {}): PackProduct {
  return {
    productSlug: slug,
    productName: `Pack ${slug}`,
    tagline: null,
    image: null,
    status: 'CONFIRMED',
    recommended: { name: `Pack ${slug}`, priceCents: prix },
    fromPriceCents: prix,
    contents: [],
    ...extra,
  }
}

function groupe(code: string, label: string, products: PackProduct[]): PackPositionGroup {
  return { code, label, products }
}

describe('produitsSitues', () => {
  it('garde l’ordre des emplacements', () => {
    const situes = produitsSitues([
      groupe('LOW', 'Feux de croisement', [produit('phares', 2890)]),
      groupe('PLATE', 'Éclairage de plaque', [produit('plaque', 1490)]),
    ])
    expect(situes.map((s) => s.produit.productSlug)).toEqual(['phares', 'plaque'])
  })

  it('ne montre qu’une fois un produit servant deux emplacements', () => {
    // Il apparaissait dans les deux sections ; en grille unique ce serait un
    // doublon, et le client croirait devoir l'acheter deux fois.
    const partout = produit('veilleuses', 1090)
    const situes = produitsSitues([
      groupe('SIDE', 'Veilleuses', [partout]),
      groupe('DAY', 'Feux de jour', [partout]),
    ])
    expect(situes).toHaveLength(1)
    expect(situes[0].emplacements.map((e) => e.label)).toEqual(['Veilleuses', 'Feux de jour'])
  })

  it('ne répète pas un emplacement portant le même nom', () => {
    const partout = produit('veilleuses', 1090)
    const situes = produitsSitues([
      groupe('SIDE', 'Veilleuses', [partout]),
      groupe('SIDE2', 'Veilleuses', [partout]),
    ])
    expect(situes[0].emplacements.map((e) => e.label)).toEqual(['Veilleuses'])
  })
})

describe('totalVehicule', () => {
  const groupes = [
    groupe('LOW', 'Feux de croisement', [produit('phares', 10390)]),
    groupe('DOME', 'Plafonnier', [produit('habitacle', 7090)]),
    groupe('PLATE', 'Éclairage de plaque', [produit('plaque', 1490)]),
    groupe('SIDE', 'Veilleuses', [produit('veilleuses', 1090)]),
    groupe('TURN', 'Clignotants avant', [produit('clignotants', 2890)]),
  ]

  it('additionne les prix affichés', () => {
    // Les cinq prix de l'Audi A8 D2, tels que la page les montre.
    expect(totalVehicule(groupes)).toEqual({
      produits: 5,
      emplacements: 5,
      totalCents: 22950,
    })
  })

  it('ne compte qu’une fois un produit servant deux emplacements', () => {
    const partout = produit('veilleuses', 1090)
    expect(
      totalVehicule([
        groupe('SIDE', 'Veilleuses', [partout]),
        groupe('DAY', 'Feux de jour', [partout]),
      ]).totalCents,
    ).toBe(1090)
  })

  it('écarte les incompatibles', () => {
    // Les inclure reviendrait à vendre ce que la carte vient de déconseiller.
    const total = totalVehicule([
      groupe('LOW', 'Feux de croisement', [produit('phares', 10390)]),
      groupe('FOG', 'Antibrouillards', [produit('brouillard', 2790, { status: 'INCOMPATIBLE' })]),
    ])
    expect(total).toEqual({ produits: 1, emplacements: 1, totalCents: 10390 })
  })

  it('garde les « à vérifier », qui restent achetables', () => {
    const total = totalVehicule([
      groupe('LOW', 'Feux de croisement', [produit('phares', 10390, { status: 'UNKNOWN' })]),
    ])
    expect(total.produits).toBe(1)
  })

  it('retombe sur le prix d’entrée faute de conditionnement conseillé', () => {
    const total = totalVehicule([
      groupe('LOW', 'Feux de croisement', [
        produit('phares', 10390, { recommended: null, fromPriceCents: 9990 }),
      ]),
    ])
    expect(total.totalCents).toBe(9990)
  })

  it('ne fabrique pas de total sur une page vide', () => {
    expect(totalVehicule([])).toEqual({ produits: 0, emplacements: 0, totalCents: 0 })
  })
})

describe('nomDuConditionnement', () => {
  it('se tait quand il répète le nom du produit', () => {
    expect(
      nomDuConditionnement({
        productName: 'Pack LED phares pour Peugeot 207',
        recommended: { name: 'Pack LED phares pour Peugeot 207', priceCents: 2890 },
      }),
    ).toBeNull()
  })

  it('parle quand il distingue deux conditionnements', () => {
    expect(
      nomDuConditionnement({
        productName: 'Pack LED phares pour Peugeot 207',
        recommended: { name: 'Le kit complet', priceCents: 4890 },
      }),
    ).toBe('Le kit complet')
  })

  it('se tait faute de conditionnement conseillé', () => {
    expect(nomDuConditionnement({ productName: 'Pack', recommended: null })).toBeNull()
  })
})

describe('nomUtileDuConditionnement', () => {
  it('se tait quand il répète le titre, y compris sur la fiche', () => {
    // La fiche annonçait « TTC · pack led éclairage de plaque pour
    // mercedes-benz classe c (w203) » sous un titre disant déjà la même chose.
    expect(
      nomUtileDuConditionnement(
        'Pack LED éclairage de plaque pour Mercedes-Benz Classe C (W203)',
        'Pack LED éclairage de plaque pour Mercedes-Benz Classe C (W203)',
      ),
    ).toBeNull()
  })

  it('parle dès que les deux diffèrent', () => {
    expect(nomUtileDuConditionnement('Les ampoules seules', 'Pack LED phares')).toBe(
      'Les ampoules seules',
    )
  })

  it('ne se trompe pas de vide', () => {
    expect(nomUtileDuConditionnement(null, 'Pack')).toBeNull()
    expect(nomUtileDuConditionnement(undefined, 'Pack')).toBeNull()
    expect(nomUtileDuConditionnement('', 'Pack')).toBeNull()
  })
})

describe('zones', () => {
  it('place chaque emplacement là où sa lumière se voit', () => {
    expect(zoneDeLEmplacement('LOW_BEAM')).toBe('avant')
    expect(zoneDeLEmplacement('FOG')).toBe('avant')
    expect(zoneDeLEmplacement('TURN_FRONT')).toBe('avant')
    // Des veilleuses relèvent de l'avant, même si le schéma les range dans
    // leur propre famille de pièces.
    expect(zoneDeLEmplacement('SIDELIGHT')).toBe('avant')
    expect(zoneDeLEmplacement('PLATE')).toBe('arriere')
    expect(zoneDeLEmplacement('REVERSE')).toBe('arriere')
    expect(zoneDeLEmplacement('INTERIOR_DOME')).toBe('interieur')
  })

  it('range un emplacement inconnu à l’avant plutôt que nulle part', () => {
    // Un nouvel emplacement ne doit pas disparaître de la liste filtrée.
    expect(zoneDeLEmplacement('REPEATER')).toBe('avant')
  })

  it('n’offre que les zones réellement présentes', () => {
    expect(zonesPresentes(['PLATE', 'REVERSE']).map((z) => z.cle)).toEqual(['tout', 'arriere'])
    expect(zonesPresentes(['LOW_BEAM', 'PLATE', 'INTERIOR_DOME']).map((z) => z.cle)).toEqual([
      'tout',
      'avant',
      'arriere',
      'interieur',
    ])
  })

  it('n’offre rien à filtrer sur une page vide', () => {
    expect(zonesPresentes([]).map((z) => z.cle)).toEqual(['tout'])
  })

  it('nomme la zone comme la carte l’écrit', () => {
    expect(libelleDeLaZone('avant')).toBe('Éclairage avant')
    expect(libelleDeLaZone('arriere')).toBe('Éclairage arrière')
    expect(libelleDeLaZone('interieur')).toBe('Éclairage intérieur')
  })
})

describe('cartesDesPacks', () => {
  it('porte le prix du conditionnement conseillé', () => {
    const cartes = cartesDesPacks([
      groupe('LOW', 'Feux de croisement', [
        produit('phares', 10390, {
          recommended: { name: 'Le kit complet', priceCents: 10390 },
          fromPriceCents: 6990,
        }),
      ]),
    ])
    expect(cartes[0].prixCents).toBe(10390)
    expect(cartes[0].conditionnement).toBe('Le kit complet')
  })

  it('retombe sur le prix d’entrée faute de conseil', () => {
    const cartes = cartesDesPacks([
      groupe('LOW', 'Feux de croisement', [
        produit('phares', 10390, { recommended: null, fromPriceCents: 9990 }),
      ]),
    ])
    expect(cartes[0].prixCents).toBe(9990)
    expect(cartes[0].conditionnement).toBeNull()
  })

  it('laisse vides les mentions que la page d’une génération ne connaît pas', () => {
    // Réserve, provenance et quantité sont propres aux résultats véhicule :
    // la carte doit les porter sans que cette page ait à les inventer.
    const [carte] = cartesDesPacks([
      groupe('LOW', 'Feux de croisement', [produit('phares', 2890)]),
    ])
    expect(carte.autres).toEqual([])
    expect(carte.reserve).toBeNull()
    expect(carte.verifie).toBeNull()
    expect(carte.quantite).toBeNull()
  })
})

describe('totalDesCartes', () => {
  it('additionne les prix que les cartes affichent', () => {
    // Les deux pages véhicule appellent ce calcul : c'est la seule façon que
    // le chiffre annoncé soit celui qu'on obtient en additionnant les
    // vignettes du dessous.
    const cartes = cartesDesPacks([
      groupe('LOW', 'Feux de croisement', [produit('phares', 10390)]),
      groupe('PLATE', 'Éclairage de plaque', [produit('plaque', 1490)]),
    ])
    expect(totalDesCartes(cartes)).toEqual({ produits: 2, emplacements: 2, totalCents: 11880 })
  })

  it('écarte les incompatibles, quelle que soit la page', () => {
    const cartes = cartesDesPacks([
      groupe('LOW', 'Feux de croisement', [produit('phares', 10390)]),
      groupe('FOG', 'Antibrouillards', [produit('brouillard', 2790, { status: 'INCOMPATIBLE' })]),
    ])
    expect(totalDesCartes(cartes)).toEqual({ produits: 1, emplacements: 1, totalCents: 10390 })
  })
})
