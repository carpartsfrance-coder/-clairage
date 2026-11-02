import { describe, expect, it } from 'vitest'
import {
  CULOT_MAX,
  DESCRIPTION_MAX,
  FAQ_MAX,
  KELVIN_MAX,
  KELVIN_MIN,
  SPECS_MAX,
  isDifficulte,
  isTypeVehicule,
  normaliserCulot,
  noteGuideNonPublie,
  ordreApresDeplacement,
  parseCulot,
  parseFaq,
  parseIdentite,
  parseRedactionnel,
  parseSpec,
  normaliserSauts,
  parseTemperature,
  raisonAdresseFigee,
  raisonGuideNonRattachable,
} from '../src/lib/admin/produit-contenu'

/**
 * Règles d'écriture du contenu d'une fiche produit.
 *
 * Ce que ces tests protègent n'est pas un confort de saisie. Trois choses
 * passent par ici et se voient en ligne :
 *
 *   1. **Le culot est une clé de navigation.** Le menu, la page
 *      `/culot/<base>` et la facette de recherche comparent la valeur
 *      exactement. Une normalisation qui lâche et « h7 » devient un second
 *      culot, avec son propre comptage, invisible depuis le premier.
 *   2. **La teinte est un nombre affiché au client.** « 60000 K » tapé pour
 *      6 000 annoncerait une couleur qui n'existe pas.
 *   3. **Deux lignes identiques se contredisent.** Une caractéristique ou une
 *      question en double s'affiche deux fois, et pour la FAQ part en double
 *      dans les données structurées que les moteurs reprennent.
 *
 * Et une quatrième, qui n'est pas une validation mais une interdiction :
 * l'adresse publique d'une fiche en ligne ne bouge pas, faute de redirection.
 */

/* -------------------------------------------------------------------------- */
/* Culot                                                                      */
/* -------------------------------------------------------------------------- */

describe('normaliserCulot', () => {
  it('met en capitales et retire les espaces', () => {
    expect(normaliserCulot('h7')).toBe('H7')
    expect(normaliserCulot('ba 15 s')).toBe('BA15S')
    expect(normaliserCulot(' d1s ')).toBe('D1S')
  })
})

describe('parseCulot', () => {
  it('accepte les culots courants', () => {
    for (const culot of ['H7', 'D1S', 'W5W', 'BA15S', 'HB3', '7440', 'PY21W']) {
      expect(parseCulot(culot)).toEqual({ ok: true, value: culot })
    }
  })

  it('accepte un code à tiret', () => {
    expect(parseCulot('h8-h11')).toEqual({ ok: true, value: 'H8-H11' })
  })

  it('normalise avant d’écrire', () => {
    // Le cas qui compte : sans cette normalisation, le menu afficherait deux
    // culots « H7 » distincts selon la casse de la saisie.
    expect(parseCulot(' h7 ')).toEqual({ ok: true, value: 'H7' })
  })

  it('traite l’absence de culot comme une absence, pas comme une erreur', () => {
    // Tous les produits n'ont pas de culot : un nettoyant, un kit d'outillage.
    expect(parseCulot('')).toEqual({ ok: true, value: null })
    expect(parseCulot('   ')).toEqual({ ok: true, value: null })
  })

  it('refuse ce qui n’est pas un code', () => {
    const resultat = parseCulot('H7 ou équivalent')
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain("n'est pas un culot")
  })

  it('refuse un tiret en bord ou doublé', () => {
    expect(parseCulot('-H7').ok).toBe(false)
    expect(parseCulot('H7-').ok).toBe(false)
    expect(parseCulot('H7--H11').ok).toBe(false)
  })

  it('refuse au-delà de la longueur d’un code', () => {
    expect(parseCulot('A'.repeat(CULOT_MAX)).ok).toBe(true)
    expect(parseCulot('A'.repeat(CULOT_MAX + 1)).ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Température de couleur                                                     */
/* -------------------------------------------------------------------------- */

describe('parseTemperature', () => {
  it('lit un nombre simple', () => {
    expect(parseTemperature('6000')).toEqual({ ok: true, value: 6000 })
  })

  it('tolère l’unité et les séparateurs d’un copier-coller', () => {
    expect(parseTemperature('6 000 K')).toEqual({ ok: true, value: 6000 })
    expect(parseTemperature('6 000 k')).toEqual({ ok: true, value: 6000 })
  })

  it('traite le champ vide comme « non applicable »', () => {
    expect(parseTemperature('')).toEqual({ ok: true, value: null })
  })

  it('refuse une décimale plutôt que de l’arrondir', () => {
    const resultat = parseTemperature('6000,5')
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('nombre entier')
  })

  it('refuse le zéro de trop', () => {
    // Le cas réel : 6000 tapé 60000. La fiche annoncerait une teinte qui
    // n'existe pas, et la facette de recherche gagnerait une valeur absurde.
    const resultat = parseTemperature('60000')
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain(`${KELVIN_MAX}`)
  })

  it('tient ses bornes aux extrémités', () => {
    expect(parseTemperature(String(KELVIN_MIN)).ok).toBe(true)
    expect(parseTemperature(String(KELVIN_MAX)).ok).toBe(true)
    expect(parseTemperature(String(KELVIN_MIN - 1)).ok).toBe(false)
    expect(parseTemperature(String(KELVIN_MAX + 1)).ok).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Identité                                                                   */
/* -------------------------------------------------------------------------- */

const IDENTITE = {
  name: 'Pack LED H7 Golf 7',
  brand: 'Lumera',
  bulbBase: 'h7',
  temperature: '6000 K',
  difficulty: 'EASY',
  vehicleType: 'CAR',
}

describe('parseIdentite', () => {
  it('normalise ce qui sert de clé et laisse le reste tel quel', () => {
    const resultat = parseIdentite(IDENTITE)
    expect(resultat).toEqual({
      ok: true,
      value: {
        name: 'Pack LED H7 Golf 7',
        brand: 'Lumera',
        bulbBase: 'H7',
        colorTemperature: 6000,
        difficulty: 'EASY',
        vehicleType: 'CAR',
      },
    })
  })

  it('écrit null plutôt qu’une chaîne vide pour la marque', () => {
    const resultat = parseIdentite({ ...IDENTITE, brand: '  ' })
    expect(resultat.ok && resultat.value.brand).toBeNull()
  })

  it('exige un nom : c’est l’intitulé des lignes de commande', () => {
    const resultat = parseIdentite({ ...IDENTITE, name: '   ' })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('nom du produit est obligatoire')
  })

  it('refuse un niveau de montage ou un type inconnu', () => {
    expect(parseIdentite({ ...IDENTITE, difficulty: 'TRES_DUR' }).ok).toBe(false)
    expect(parseIdentite({ ...IDENTITE, vehicleType: 'CAMION' }).ok).toBe(false)
  })

  it('rend la première raison de refus, et non la dernière', () => {
    // Un formulaire qui signalerait la teinte en gardant un culot invalide
    // ferait corriger deux fois de suite.
    const resultat = parseIdentite({ ...IDENTITE, bulbBase: 'H 7 ?', temperature: '99999' })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain("n'est pas un culot")
  })

  it('reconnaît les valeurs des deux énumérations', () => {
    expect(isDifficulte('UNKNOWN')).toBe(true)
    expect(isDifficulte('EASY')).toBe(true)
    expect(isDifficulte('')).toBe(false)
    expect(isTypeVehicule('BOTH')).toBe(true)
    expect(isTypeVehicule('TRUCK')).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Adresse publique                                                           */
/* -------------------------------------------------------------------------- */

describe('raisonAdresseFigee', () => {
  it('laisse changer l’adresse d’un brouillon', () => {
    // Personne n'a pu partager un lien vers une fiche jamais servie.
    expect(raisonAdresseFigee({ statut: 'DRAFT' })).toBeNull()
  })

  it('refuse de déplacer une fiche en ligne, et dit pourquoi', () => {
    const raison = raisonAdresseFigee({ statut: 'PUBLISHED' })
    expect(raison).toContain('404')
    expect(raison).toContain('brouillon')
  })

  it('refuse aussi sur une fiche archivée', () => {
    // Elle a été en ligne : ses liens existent toujours.
    expect(raisonAdresseFigee({ statut: 'ARCHIVED' })).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Rédactionnel                                                               */
/* -------------------------------------------------------------------------- */

describe('parseRedactionnel', () => {
  it('écrit null pour un texte vide', () => {
    expect(parseRedactionnel({ description: '', body: '   ' })).toEqual({
      ok: true,
      value: { description: null, body: null },
    })
  })

  it('conserve le rédactionnel tel qu’il a été écrit', () => {
    const body = '## Pourquoi ce pack\n\nUn **gain** net.\n\n| Culot | H7 |'
    const resultat = parseRedactionnel({ description: 'Deux fois plus de lumière.', body })
    expect(resultat.ok && resultat.value.body).toBe(body)
  })

  it('ramène les sauts de ligne d’un textarea à \\n', () => {
    /*
      Le cas qui a été vu au rendu : un `<textarea>` envoie ses retours en
      CRLF, et `Prose` découpe les paragraphes sur `\n{2,}`. Stocké tel quel,
      le rédactionnel entier devenait un seul bloc — donc un seul titre, qui
      avalait le texte.
    */
    const resultat = parseRedactionnel({
      description: 'Deux lignes\r\nen une phrase.',
      body: '## Titre\r\n\r\nUn paragraphe.\r\n\r\n| Culot | H7 |',
    })
    expect(resultat.ok && resultat.value.body).toBe('## Titre\n\nUn paragraphe.\n\n| Culot | H7 |')
    expect(resultat.ok && resultat.value.description).toBe('Deux lignes\nen une phrase.')
  })

  it('refuse une description qui déborderait le sous-titre', () => {
    const resultat = parseRedactionnel({ description: 'a'.repeat(DESCRIPTION_MAX + 1), body: '' })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('sous-titre')
  })
})

/* -------------------------------------------------------------------------- */
/* Caractéristiques                                                           */
/* -------------------------------------------------------------------------- */

const SPECS = [
  { id: 'a', label: 'Culot' },
  { id: 'b', label: 'Température de couleur' },
]

describe('parseSpec', () => {
  it('nettoie les bords et accepte une ligne complète', () => {
    expect(parseSpec({ label: '  Tension  ', value: ' 12 V ' }, { existantes: SPECS })).toEqual({
      ok: true,
      value: { label: 'Tension', value: '12 V' },
    })
  })

  it('exige une valeur, en nommant la ligne concernée', () => {
    const resultat = parseSpec({ label: 'Tension', value: '' }, { existantes: SPECS })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('« Tension »')
  })

  it('refuse un libellé déjà posé, quelle que soit la casse', () => {
    const resultat = parseSpec({ label: 'culot', value: 'H11' }, { existantes: SPECS })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('déjà une caractéristique')
  })

  it('laisse une ligne garder son propre libellé quand on la modifie', () => {
    // Sans l'exclusion de la ligne en cours, corriger la valeur de « Culot »
    // serait refusé au motif que « Culot » existe déjà — à savoir elle-même.
    expect(parseSpec({ label: 'Culot', value: 'H11' }, { existantes: SPECS, id: 'a' })).toEqual({
      ok: true,
      value: { label: 'Culot', value: 'H11' },
    })
  })

  it('refuse d’ajouter au-delà du plafond, mais laisse corriger', () => {
    const pleine = Array.from({ length: SPECS_MAX }, (_, index) => ({
      id: `s${index}`,
      label: `Ligne ${index}`,
    }))
    expect(parseSpec({ label: 'Encore', value: 'x' }, { existantes: pleine }).ok).toBe(false)
    expect(
      parseSpec({ label: 'Ligne 0 corrigée', value: 'x' }, { existantes: pleine, id: 's0' }).ok,
    ).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Questions fréquentes                                                       */
/* -------------------------------------------------------------------------- */

const FAQ = [{ id: 'q1', question: 'Faut-il démonter le pare-chocs ?' }]

describe('parseFaq', () => {
  it('accepte une question et sa réponse', () => {
    const resultat = parseFaq(
      { question: '  Sont-elles homologuées ?  ', answer: ' Oui, marquage E. ' },
      { existantes: FAQ },
    )
    expect(resultat).toEqual({
      ok: true,
      value: { question: 'Sont-elles homologuées ?', answer: 'Oui, marquage E.' },
    })
  })

  it('normalise les sauts de ligne de la réponse', () => {
    const resultat = parseFaq(
      { question: 'Et le montage ?', answer: 'Deux étapes :\r\n\r\nd’abord le capot.' },
      { existantes: [] },
    )
    expect(resultat.ok && resultat.value.answer).toBe('Deux étapes :\n\nd’abord le capot.')
  })

  it('refuse une question sans réponse', () => {
    const resultat = parseFaq({ question: 'Et la garantie ?', answer: '' }, { existantes: FAQ })
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('inquiète')
  })

  it('refuse un doublon, à cause des données structurées', () => {
    const resultat = parseFaq(
      { question: 'faut-il démonter le pare-chocs ?', answer: 'Non.' },
      { existantes: FAQ },
    )
    expect(resultat.ok).toBe(false)
    if (!resultat.ok) expect(resultat.error).toContain('déjà posée')
  })

  it('laisse une question garder son libellé quand on la modifie', () => {
    expect(
      parseFaq(
        { question: 'Faut-il démonter le pare-chocs ?', answer: 'Non, sur ce modèle.' },
        { existantes: FAQ, id: 'q1' },
      ).ok,
    ).toBe(true)
  })

  it('plafonne le nombre de questions', () => {
    const pleine = Array.from({ length: FAQ_MAX }, (_, index) => ({
      id: `q${index}`,
      question: `Question ${index} ?`,
    }))
    expect(parseFaq({ question: 'Une de plus ?', answer: 'Non.' }, { existantes: pleine }).ok).toBe(
      false,
    )
  })
})

/* -------------------------------------------------------------------------- */
/* Ordre                                                                      */
/* -------------------------------------------------------------------------- */

describe('normaliserSauts', () => {
  it('convertit CRLF et CR isolés', () => {
    expect(normaliserSauts('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
  })

  it('laisse un texte déjà propre intact', () => {
    expect(normaliserSauts('a\n\nb')).toBe('a\n\nb')
  })
})

describe('ordreApresDeplacement', () => {
  const liste = ['a', 'b', 'c']

  it('échange avec le voisin précédent', () => {
    expect(ordreApresDeplacement(liste, 'c', 'avant')).toEqual(['a', 'c', 'b'])
  })

  it('échange avec le voisin suivant', () => {
    expect(ordreApresDeplacement(liste, 'a', 'apres')).toEqual(['b', 'a', 'c'])
  })

  it('ne renvoie rien à écrire aux extrémités', () => {
    // L'action n'écrit alors rien, au lieu de renuméroter à l'identique et de
    // laisser croire qu'un déplacement a eu lieu.
    expect(ordreApresDeplacement(liste, 'a', 'avant')).toBeNull()
    expect(ordreApresDeplacement(liste, 'c', 'apres')).toBeNull()
  })

  it('refuse un identifiant absent de la liste', () => {
    expect(ordreApresDeplacement(liste, 'z', 'avant')).toBeNull()
  })

  it('ne modifie pas la liste reçue', () => {
    ordreApresDeplacement(liste, 'a', 'apres')
    expect(liste).toEqual(['a', 'b', 'c'])
  })
})

/* -------------------------------------------------------------------------- */
/* Guides                                                                     */
/* -------------------------------------------------------------------------- */

describe('raisonGuideNonRattachable', () => {
  it('accepte un guide non encore rattaché', () => {
    expect(raisonGuideNonRattachable({ guideId: 'g2', dejaRattaches: ['g1'] })).toBeNull()
  })

  it('refuse un guide déjà rattaché', () => {
    // La clé primaire de ProductGuide est composée : la base refuserait, avec
    // une erreur de contrainte qui n'apprend rien.
    expect(raisonGuideNonRattachable({ guideId: 'g1', dejaRattaches: ['g1'] })).toContain('déjà')
  })

  it('refuse un choix vide', () => {
    expect(raisonGuideNonRattachable({ guideId: '', dejaRattaches: [] })).not.toBeNull()
  })
})

describe('noteGuideNonPublie', () => {
  it('prévient qu’un guide non publié n’apparaîtra pas', () => {
    // `getProduct` filtre les guides sur leur date de publication : le
    // rattachement est bien enregistré, mais la fiche n'en montre rien.
    expect(noteGuideNonPublie({ publie: false })).toContain("n'est pas publié")
  })

  it('ne dit rien d’un guide publié', () => {
    expect(noteGuideNonPublie({ publie: true })).toBeNull()
  })
})
