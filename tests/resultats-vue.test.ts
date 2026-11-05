import { describe, expect, it } from 'vitest'
import type { GroupeResultat, LigneResultat, ProduitResultat } from '../src/lib/resultats-vue'
import { cartesDesResultats, phaseUtile, provenance } from '../src/lib/resultats-vue'

/**
 * Mise en forme de la page « les éclairages pour votre véhicule ».
 *
 * Ce que ces tests protègent : **rien de ce que l'ancienne page disait ne
 * disparaît en passant à la grille.** Elle réservait sur chaque carte un bloc
 * pour la liste des conditionnements, un pour la réserve de montage et un pour
 * la provenance — trois blocs que cinq compatibilités sur 10 295 remplissent.
 * Les supprimer était juste ; les perdre ne l'aurait pas été.
 */

function ligne(id: string, prix: number, extra: Partial<LigneResultat> = {}): LigneResultat {
  return {
    id,
    variantId: `v-${id}`,
    status: 'CONFIRMED',
    quantity: 1,
    restrictions: null,
    source: null,
    verifiedAt: null,
    variantName: 'Pack LED phares pour Audi A2',
    priceCents: prix,
    isKit: false,
    missingRequired: 0,
    purchasable: true,
    ...extra,
  }
}

function produit(slug: string, lines: LigneResultat[], extra: Partial<ProduitResultat> = {}): ProduitResultat {
  return {
    productSlug: slug,
    productName: 'Pack LED phares pour Audi A2',
    image: null,
    status: lines[0]?.status ?? 'CONFIRMED',
    lines,
    ...extra,
  }
}

function groupe(code: string, label: string, products: ProduitResultat[]): GroupeResultat {
  return { code, label, products }
}

describe('cartesDesResultats', () => {
  it('garde l’ordre des emplacements', () => {
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [produit('phares', [ligne('a', 6990)])]),
      groupe('PLATE', 'Éclairage de plaque', [produit('plaque', [ligne('b', 1180)])]),
    ])
    expect(cartes.map((c) => c.slug)).toEqual(['phares', 'plaque'])
    expect(cartes[0].emplacements).toEqual([{ code: 'LOW_BEAM', label: 'Feux de croisement' }])
  })

  it('ne montre qu’une fois un produit servant deux emplacements', () => {
    // En grille unique il ferait doublon, et le client croirait devoir
    // l'acheter deux fois.
    const partout = produit('veilleuses', [ligne('a', 1090)])
    const cartes = cartesDesResultats([
      groupe('SIDELIGHT', 'Veilleuses', [partout]),
      groupe('TURN_FRONT', 'Clignotants avant', [partout]),
    ])
    expect(cartes).toHaveLength(1)
    expect(cartes[0].emplacements.map((e) => e.label)).toEqual(['Veilleuses', 'Clignotants avant'])
  })

  it('affiche le prix du conditionnement conseillé, pas le moins cher', () => {
    // Le moins cher ne se monte pas seul : le conseiller avec son seul prix
    // annoncerait un montage à 69,90 € qui en coûte 99,90 €.
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [
        produit('phares', [
          ligne('seules', 6990, { variantName: 'Les ampoules seules', missingRequired: 2 }),
          ligne('kit', 9990, { variantName: 'Le kit complet', isKit: true }),
        ]),
      ]),
    ])
    expect(cartes[0].prixCents).toBe(9990)
    expect(cartes[0].variantId).toBe('v-kit')
    expect(cartes[0].conditionnement).toBe('Le kit complet')
    expect(cartes[0].autres).toEqual([{ nom: 'Les ampoules seules', prixCents: 6990 }])
  })

  it('se tait sur le conditionnement quand il répète le nom du produit', () => {
    // 10 320 des 10 327 références du catalogue sont dans ce cas : la carte
    // écrivait deux fois la même phrase.
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [produit('phares', [ligne('a', 6990)])]),
    ])
    expect(cartes[0].conditionnement).toBeNull()
  })

  it('garde la réserve du conditionnement conseillé, et pas celle d’un autre', () => {
    // « Adaptateurs non inclus » est vrai des ampoules seules et faux du kit :
    // mise en commun sous la carte, elle se lirait comme valant pour les deux.
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [
        produit('phares', [
          ligne('seules', 6990, { restrictions: 'Adaptateurs non inclus', missingRequired: 2 }),
          ligne('kit', 9990, { variantName: 'Le kit complet', isKit: true }),
        ]),
      ]),
    ])
    expect(cartes[0].reserve).toBeNull()
  })

  it('dit « tout compris » du conditionnement qui contient les accessoires', () => {
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [
        produit('phares', [
          ligne('seules', 6990, { variantName: 'Les ampoules seules' }),
          ligne('kit', 9990, { variantName: 'Le kit complet', isKit: true }),
        ]),
      ]),
    ])
    // Le moins cher est autonome et confirmé : c'est lui qui est conseillé.
    expect(cartes[0].prixCents).toBe(6990)
    expect(cartes[0].autres).toEqual([{ nom: 'Le kit complet · tout compris', prixCents: 9990 }])
  })

  it('ne parle de quantité que lorsqu’il en faut plus d’une', () => {
    const une = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux', [produit('phares', [ligne('a', 6990)])]),
    ])
    expect(une[0].quantite).toBeNull()

    const deux = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux', [produit('phares', [ligne('a', 6990, { quantity: 2 })])]),
    ])
    expect(deux[0].quantite).toBe(2)
  })

  it('garde une carte dont aucun conditionnement n’est conseillable', () => {
    // Un incompatible n'a pas de conditionnement conseillé : il doit rester
    // visible, parce que savoir ce qui ne convient pas fait partie de la
    // réponse.
    const cartes = cartesDesResultats([
      groupe('LOW_BEAM', 'Feux de croisement', [
        produit('phares', [ligne('a', 6990, { status: 'INCOMPATIBLE' })], {
          status: 'INCOMPATIBLE',
        }),
      ]),
    ])
    expect(cartes).toHaveLength(1)
    expect(cartes[0].status).toBe('INCOMPATIBLE')
    expect(cartes[0].prixCents).toBe(6990)
  })

  it('ne fabrique rien à partir de rien', () => {
    expect(cartesDesResultats([])).toEqual([])
    expect(cartesDesResultats([groupe('LOW_BEAM', 'Feux', [produit('vide', [])])])).toEqual([])
  })
})

describe('provenance', () => {
  const jour = new Date('2025-03-14T12:00:00Z')

  it('distingue une vérification d’une information datée', () => {
    // Confondre les deux ferait passer une absence de réponse pour une
    // réponse vérifiée.
    expect(provenance('CONFIRMED', jour, null)).toBe('Vérifié le 14 mars 2025')
    expect(provenance('UNKNOWN', jour, null)).toBe('Information datée du 14 mars 2025')
  })

  it('nomme la source quand elle est relevée', () => {
    expect(provenance('CONFIRMED', jour, 'Constructeur')).toBe(
      'Vérifié le 14 mars 2025 · Constructeur',
    )
  })

  it('se tait faute de date', () => {
    expect(provenance('CONFIRMED', null, 'Constructeur')).toBeNull()
  })
})

describe('phaseUtile', () => {
  it('se tait quand le nom de la génération dit déjà la phase', () => {
    // Le bandeau annonçait « Éclairage BMW M4 (F82 F83) » puis « (F82 F83) ».
    expect(phaseUtile('(F82 F83)', 'M4 (F82 F83)')).toBeNull()
  })

  it('parle quand elle ajoute quelque chose', () => {
    expect(phaseUtile('Restylage', 'Golf VII')).toBe('Restylage')
  })

  it('ne se trompe pas de vide', () => {
    expect(phaseUtile(null, 'Golf VII')).toBeNull()
  })
})
