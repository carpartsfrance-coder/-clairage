import { describe, expect, it } from 'vitest'
import {
  adresseProduit,
  normaliserSku,
  parsePoidsGrammes,
  parsePrixBarreCents,
  parsePrixCents,
  parseProduit,
  parseQuantite,
  parseSku,
  parseStock,
  parseVariante,
  raisonDerniereVariante,
  raisonStockNonEditable,
  raisonSuppressionBloquee,
  type VarianteSaisie,
} from '../src/lib/admin/catalogue'

/**
 * Règles d'écriture du bloc achat.
 *
 * Ce que ces tests protègent est de l'argent et des engagements, pas du
 * confort d'écran :
 *
 *   - un prix mal converti se facture au client ;
 *   - un taux de TVA absent fait partir une commande à 0 % de TVA, puisque
 *     `vatRate?.rateBp ?? 0` retombe sur zéro sans rien signaler ;
 *   - un prix barré inférieur au prix affiche une remise négative ;
 *   - un stock écrit sur un kit contredit le calcul fait depuis ses
 *     composants, et c'est la valeur écrite que le tableau montrerait.
 *
 * Tout cela se vérifie sans base, et doit le rester : ces règles sont le seul
 * endroit où le back-office refuse d'écrire une fiche fausse.
 */

const varianteValide: VarianteSaisie = {
  sku: 'LUM-H7-LED',
  name: 'La paire',
  packaging: 'PAIR',
  prix: '49,90',
  prixBarre: '',
  vatRateId: 'tva-20',
  seuil: '2',
  poids: '180',
  backorder: false,
  active: true,
}

describe('parsePrixCents', () => {
  it('convertit la virgule française en centimes entiers', () => {
    expect(parsePrixCents('19,90')).toEqual({ ok: true, value: 1990 })
  })

  it('accepte le point, le symbole et les espaces d’un copier-coller de tableur', () => {
    // 19.90 × 100 vaut 1989.9999999999998 en flottant : le test garde la
    // conversion par chaîne, pas la multiplication.
    expect(parsePrixCents('19.90')).toEqual({ ok: true, value: 1990 })
    expect(parsePrixCents('1 299,00 €')).toEqual({ ok: true, value: 129900 })
    expect(parsePrixCents('1 299,5')).toEqual({ ok: true, value: 129950 })
  })

  it('complète une décimale seule', () => {
    expect(parsePrixCents('19,9')).toEqual({ ok: true, value: 1990 })
  })

  it('refuse une troisième décimale au lieu de l’arrondir', () => {
    // Arrondir « 19,999 » à 20,00 € changerait le prix de vente en silence.
    const resultat = parsePrixCents('19,999')
    expect(resultat.ok).toBe(false)
  })

  it('refuse zéro, qui serait vendu gratuitement', () => {
    expect(parsePrixCents('0')).toEqual({
      ok: false,
      error: 'Un prix à 0 € serait vendu gratuitement.',
    })
  })

  it('refuse un prix absent en le nommant', () => {
    expect(parsePrixCents('   ')).toEqual({ ok: false, error: 'Le prix est obligatoire.' })
  })

  it('refuse un montant négatif ou non numérique', () => {
    expect(parsePrixCents('-5').ok).toBe(false)
    expect(parsePrixCents('cher').ok).toBe(false)
  })
})

describe('parsePrixBarreCents', () => {
  it('est facultatif', () => {
    expect(parsePrixBarreCents('', 1990)).toEqual({ ok: true, value: null })
  })

  it('accepte un montant supérieur au prix de vente', () => {
    expect(parsePrixBarreCents('29,90', 1990)).toEqual({ ok: true, value: 2990 })
  })

  it('refuse un montant égal : la remise affichée serait de 0 %', () => {
    expect(parsePrixBarreCents('19,90', 1990).ok).toBe(false)
  })

  it('refuse un montant inférieur : la « réduction » serait une augmentation', () => {
    expect(parsePrixBarreCents('9,90', 1990).ok).toBe(false)
  })
})

describe('parseSku', () => {
  it('relève la casse et remplace les espaces', () => {
    expect(normaliserSku(' lum h7 led ')).toBe('LUM-H7-LED')
  })

  it('accepte les traits d’union doubles déjà présents au catalogue', () => {
    // `LUM-PK-HEAD-HARLEY-DAVIDSON-FAT-BOB--D5D8` existe en base : refuser une
    // référence qu'on peut lire à l'écran serait incompréhensible.
    expect(parseSku('LUM-PK-HEAD-HARLEY-DAVIDSON-FAT-BOB--D5D8').ok).toBe(true)
  })

  it('refuse un trait d’union au bord', () => {
    expect(parseSku('-LUM-H7').ok).toBe(false)
    expect(parseSku('LUM-H7-').ok).toBe(false)
  })

  it('refuse une référence vide ou ponctuée', () => {
    expect(parseSku('').ok).toBe(false)
    expect(parseSku('LUM/H7').ok).toBe(false)
  })
})

describe('parseQuantite', () => {
  it('retombe sur le défaut quand le champ est vide', () => {
    expect(parseQuantite('', "Le seuil d'alerte", { defaut: 0 })).toEqual({ ok: true, value: 0 })
  })

  it('exige une valeur quand il n’y a pas de défaut', () => {
    expect(parseQuantite('', 'Le stock détenu')).toEqual({
      ok: false,
      error: 'Le stock détenu est obligatoire.',
    })
  })

  it('nomme le champ en cause dans le refus', () => {
    const resultat = parseQuantite('3,5', 'Le stock détenu')
    expect(resultat).toEqual({
      ok: false,
      error: 'Le stock détenu doit être un nombre entier, sans décimale ni signe.',
    })
  })

  it('refuse un négatif', () => {
    expect(parseQuantite('-1', 'Le stock détenu').ok).toBe(false)
  })
})

describe('parsePoidsGrammes', () => {
  it('est facultatif', () => {
    expect(parsePoidsGrammes('')).toEqual({ ok: true, value: null })
  })

  it('refuse zéro plutôt que de l’enregistrer', () => {
    expect(parsePoidsGrammes('0').ok).toBe(false)
  })
})

describe('parseVariante', () => {
  it('rend les données d’écriture quand tout est là', () => {
    const resultat = parseVariante(varianteValide)
    expect(resultat).toEqual({
      ok: true,
      value: {
        sku: 'LUM-H7-LED',
        name: 'La paire',
        packaging: 'PAIR',
        priceCents: 4990,
        compareAtCents: null,
        costCents: null,
        vatRateId: 'tva-20',
        lowStockThreshold: 2,
        weightGrams: 180,
        backorder: false,
        active: true,
      },
    })
  })

  it('exige un taux de TVA, et pas seulement à la publication', () => {
    // Sans taux, `vatRate?.rateBp ?? 0` facture la commande à 0 % de TVA. Le
    // refus de publication ne protège que la mise en ligne, pas la commande
    // passée sur une fiche déjà publiée dont on aurait retiré le taux.
    const resultat = parseVariante({ ...varianteValide, vatRateId: '' })
    expect(resultat.ok).toBe(false)
    expect(resultat.ok === false && resultat.error).toContain('taux de TVA')
  })

  it('exige un nom de conditionnement', () => {
    expect(parseVariante({ ...varianteValide, name: '  ' }).ok).toBe(false)
  })

  it('refuse un conditionnement inconnu', () => {
    expect(parseVariante({ ...varianteValide, packaging: 'CARTON' }).ok).toBe(false)
  })

  it('s’arrête au premier manque, dans l’ordre du formulaire', () => {
    // Référence et prix sont tous deux fautifs : c'est la référence, en haut du
    // formulaire, que le message doit désigner.
    const resultat = parseVariante({ ...varianteValide, sku: '', prix: '0' })
    expect(resultat.ok === false && resultat.error).toContain('référence')
  })
})

describe('raisonStockNonEditable', () => {
  it('laisse écrire le stock d’une variante simple', () => {
    expect(raisonStockNonEditable({ composants: 0 })).toBeNull()
  })

  it('refuse le stock d’un kit, qui se calcule', () => {
    expect(raisonStockNonEditable({ composants: 2 })).toContain('se calcule')
  })
})

describe('parseStock', () => {
  it('déduit le mouvement du stock constaté', () => {
    // On saisit ce qu'on a compté, pas l'écart : compter douze pièces est sûr,
    // calculer de tête qu'il en faut ajouter trois ne l'est pas.
    expect(parseStock({ stock: '12', motif: 'inventaire' }, 9)).toEqual({
      ok: true,
      value: { stockOnHand: 12, delta: 3, motif: 'inventaire' },
    })
  })

  it('déduit un mouvement négatif', () => {
    expect(parseStock({ stock: '2', motif: 'casse' }, 5)).toEqual({
      ok: true,
      value: { stockOnHand: 2, delta: -3, motif: 'casse' },
    })
  })

  it('n’écrit rien quand le stock est déjà celui enregistré', () => {
    // Sans ce refus, chaque enregistrement ajouterait un mouvement de zéro et
    // l'historique d'inventaire deviendrait illisible.
    expect(parseStock({ stock: '9', motif: 'inventaire' }, 9).ok).toBe(false)
  })

  it('exige un motif', () => {
    expect(parseStock({ stock: '12', motif: '' }, 9).ok).toBe(false)
    expect(parseStock({ stock: '12', motif: 'parce que' }, 9).ok).toBe(false)
  })
})

describe('adresseProduit', () => {
  it('dérive l’adresse du nom quand le champ est vide', () => {
    expect(adresseProduit({ name: 'Pack LED Golf 7', slug: '' })).toEqual({
      ok: true,
      value: 'pack-led-golf-7',
    })
  })

  it('garde l’adresse saisie, même éloignée du nom', () => {
    expect(adresseProduit({ name: 'Pack LED Golf 7', slug: 'pack-golf-7' })).toEqual({
      ok: true,
      value: 'pack-golf-7',
    })
  })

  it('relève une adresse saisie en majuscules', () => {
    expect(adresseProduit({ name: 'x', slug: 'PACK-GOLF' })).toEqual({
      ok: true,
      value: 'pack-golf',
    })
  })

  it('refuse une adresse ponctuée plutôt que de la corriger en silence', () => {
    expect(adresseProduit({ name: 'x', slug: 'pack golf/7' }).ok).toBe(false)
  })

  it('refuse un nom qui ne donne aucune adresse', () => {
    expect(adresseProduit({ name: '!!!', slug: '' }).ok).toBe(false)
  })
})

describe('parseProduit', () => {
  it('exige une rubrique, qui est bloquante à la publication', () => {
    const resultat = parseProduit({ name: 'Pack LED', slug: '', brand: '', categoryId: '' })
    expect(resultat.ok).toBe(false)
    expect(resultat.ok === false && resultat.error).toContain('rubrique')
  })

  it('laisse la marque facultative, à null plutôt qu’à chaîne vide', () => {
    const resultat = parseProduit({ name: 'Pack LED', slug: '', brand: '  ', categoryId: 'cat' })
    expect(resultat).toEqual({
      ok: true,
      value: { name: 'Pack LED', slug: 'pack-led', brand: null, categoryId: 'cat' },
    })
  })

  it('conserve la marque saisie', () => {
    const resultat = parseProduit({ name: 'Pack', slug: '', brand: ' Osram ', categoryId: 'cat' })
    expect(resultat.ok === true && resultat.value.brand).toBe('Osram')
  })
})

describe('raisonSuppressionBloquee', () => {
  const rien = { commandes: 0, paniers: 0, kits: 0, compatibilites: 0 }

  it('laisse supprimer une variante que rien ne rattache', () => {
    expect(raisonSuppressionBloquee(rien)).toBeNull()
  })

  it('refuse une variante déjà commandée, pour ne pas détacher la vente', () => {
    // `OrderLine.variantId` est en `SetNull` : la suppression passerait sans
    // erreur et la ligne de commande perdrait sa référence en silence.
    expect(raisonSuppressionBloquee({ ...rien, commandes: 3 })).toContain('commandé')
  })

  it('refuse une variante portant des compatibilités, effacées en cascade', () => {
    expect(raisonSuppressionBloquee({ ...rien, compatibilites: 12 })).toContain('compatibilité')
  })

  it('nomme la raison la plus grave quand il y en a plusieurs', () => {
    // Une vente passée primait sur un panier en cours : c'est elle qu'on ne
    // peut pas défaire.
    expect(raisonSuppressionBloquee({ commandes: 1, paniers: 4, kits: 2, compatibilites: 9 })).toContain(
      'commandé',
    )
  })
})

describe('raisonDerniereVariante', () => {
  it('laisse désactiver quand un autre conditionnement reste actif', () => {
    expect(raisonDerniereVariante({ statutProduit: 'PUBLISHED', autresActives: 1 })).toBeNull()
  })

  it('laisse désactiver le dernier conditionnement d’un brouillon', () => {
    expect(raisonDerniereVariante({ statutProduit: 'DRAFT', autresActives: 0 })).toBeNull()
  })

  it('refuse de vider une fiche en ligne', () => {
    // Elle resterait affichée, sans rien à acheter, et rien n'avertirait le
    // client arrivé dessus.
    expect(raisonDerniereVariante({ statutProduit: 'PUBLISHED', autresActives: 0 })).toContain(
      'brouillon',
    )
  })
})
