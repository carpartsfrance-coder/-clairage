import { NOM_MAX, parseNom, type ParseResult } from './catalogue'
import { VEHICLE_TYPE_LABELS, type VehicleTypeValue } from './vehicles'

/**
 * Règles d'écriture du contenu d'une fiche produit : ce qu'elle raconte.
 *
 * Le bloc achat répondait à « que vend-on, à quel prix ». Tout le reste —
 * le nom, l'adresse publique, la marque, le culot, la teinte, le niveau de
 * montage, le rédactionnel, les caractéristiques, les questions fréquentes et
 * les guides — ne s'écrivait nulle part : la fiche d'administration affichait
 * ces champs en lecture, et la seule façon d'en changer un était une requête à
 * la main. Une fiche créée au back-office naissait donc sans culot, sans
 * caractéristique et sans texte, c'est-à-dire sans rien de ce qui la fait
 * choisir.
 *
 * Comme pour le bloc achat, tout ce qui se décide sans la base vit ici : ces
 * règles se testent alors sans serveur ni jeu de données, là où dans une
 * action elles ne seraient vérifiables qu'en les exécutant contre une vraie
 * base.
 *
 * Quatre décisions structurent ce fichier :
 *
 * 1. **L'adresse publique ne se change plus quand la fiche est en ligne.**
 *    Rien dans l'application ne pose de redirection : déplacer `/p/<slug>`
 *    transforme en 404 chaque lien déjà partagé et chaque résultat de
 *    recherche. Tant que la fiche est un brouillon, personne n'a pu la
 *    partager, et l'adresse s'ajuste librement.
 * 2. **Le culot est une clé de navigation, pas une étiquette.** Il alimente le
 *    menu, la page `/culot/<base>` et une facette de recherche qui compare les
 *    valeurs exactement (`bulbBase: { in: … }`). « h7 », « H7 » et « H 7 »
 *    feraient trois culots dans le menu, chacun avec son propre comptage, et
 *    aucun ne retrouverait les produits des deux autres. D'où la
 *    normalisation.
 * 3. **Un libellé de caractéristique ne se répète pas sur une fiche.** Deux
 *    lignes « Culot » avec deux valeurs différentes sont une contradiction
 *    affichée au client ; accessoirement, la fiche publique indexe ses lignes
 *    par libellé, et deux identiques s'y marcheraient dessus.
 * 4. **Un champ vide s'écrit `null`, jamais une valeur plausible.** Pas de
 *    teinte devinée depuis le nom, pas de niveau de montage par défaut : la
 *    fiche dit ce qu'on lui a dit, et le relevé des manques signale le reste.
 */

export type { ParseResult }

/* -------------------------------------------------------------------------- */
/* Culot                                                                      */
/* -------------------------------------------------------------------------- */

export const CULOT_MAX = 16

/** H7, D1S, W5W, BA15S, HB3, 7440… et les codes à tiret du genre H8-H11. */
export const CULOT_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

/**
 * Met un culot saisi sous la forme qui sert de clé.
 *
 * Capitales et espaces retirés : la valeur est reprise telle quelle dans le
 * menu et dans l'adresse `/culot/<base>`, et c'est elle que la facette de
 * recherche compare. Normaliser à l'écriture est le seul endroit où l'on peut
 * encore empêcher deux orthographes du même culot de coexister.
 */
export function normaliserCulot(valeur: string): string {
  return valeur.replace(/\s+/g, '').toUpperCase()
}

export function parseCulot(valeur: string): ParseResult<string | null> {
  const culot = normaliserCulot(valeur.trim())
  if (culot.length === 0) return { ok: true, value: null }
  if (culot.length > CULOT_MAX) {
    return { ok: false, error: `Le culot dépasse ${CULOT_MAX} caractères.` }
  }
  if (!CULOT_PATTERN.test(culot)) {
    return {
      ok: false,
      error: `« ${culot} » n'est pas un culot : lettres, chiffres et traits d'union simples (H7, D1S, BA15S).`,
    }
  }
  return { ok: true, value: culot }
}

/* -------------------------------------------------------------------------- */
/* Température de couleur                                                     */
/* -------------------------------------------------------------------------- */

/*
  Les bornes ne sont pas une coquetterie : elles attrapent la faute de frappe.
  Un jaune sélectif tourne autour de 2 300 K, un halogène d'origine autour de
  3 200 K, une LED blanche entre 5 000 et 8 000 K, et les teintes bleutées
  vendues « effet xénon » montent à 12 000 K. En dehors, c'est un zéro de trop
  — 60 000 pour 6 000 — et la fiche annoncerait une teinte qui n'existe pas.
*/
export const KELVIN_MIN = 1500
export const KELVIN_MAX = 12000

export function parseTemperature(valeur: string): ParseResult<number | null> {
  /*
    L'unité et les séparateurs de milliers sont tolérés : on recopie souvent
    « 6 000 K » depuis une fiche fournisseur, et refuser la chaîne entière pour
    un « K » de trop n'apprend rien à personne. L'espace insécable est inclus,
    parce que c'est celui qu'un copier-coller apporte.
  */
  const brut = valeur.replace(/[\s kK]/g, '').trim()
  if (brut.length === 0) return { ok: true, value: null }

  if (!/^\d+$/.test(brut)) {
    return {
      ok: false,
      error: `« ${valeur.trim()} » n'est pas une température en kelvins : un nombre entier, par exemple 6000.`,
    }
  }

  const kelvins = Number(brut)
  if (kelvins < KELVIN_MIN || kelvins > KELVIN_MAX) {
    return {
      ok: false,
      error: `Une teinte s'exprime entre ${KELVIN_MIN} et ${KELVIN_MAX} K. « ${brut} » est hors de cette plage.`,
    }
  }
  return { ok: true, value: kelvins }
}

/* -------------------------------------------------------------------------- */
/* Niveau de montage                                                          */
/* -------------------------------------------------------------------------- */

export const DIFFICULTES = ['UNKNOWN', 'EASY', 'MEDIUM', 'HARD'] as const
export type DifficulteValue = (typeof DIFFICULTES)[number]

/**
 * Les intitulés sont ceux que la fiche publique affiche, mot pour mot.
 *
 * Choisir « Montage difficile » dans le back-office pour que le client lise
 * « Niveau confirmé » obligerait à traduire de tête à chaque relecture.
 */
export const DIFFICULTE_LABELS: Record<DifficulteValue, string> = {
  UNKNOWN: 'Non renseigné',
  EASY: 'Niveau accessible',
  MEDIUM: 'Niveau intermédiaire',
  HARD: 'Niveau confirmé',
}

/** Ce que le choix change sur la fiche, pour le dire sous le champ. */
export const DIFFICULTE_NOTES: Record<DifficulteValue, string> = {
  UNKNOWN:
    'La section « Montage » disparaît de la fiche, sauf si un guide y est rattaché.',
  EASY: 'Une barre allumée sur trois, et la section « Montage » apparaît.',
  MEDIUM: 'Deux barres allumées sur trois.',
  HARD: 'Trois barres sur trois : le client est prévenu qu’il faut de l’outillage.',
}

export function isDifficulte(valeur: string): valeur is DifficulteValue {
  return (DIFFICULTES as readonly string[]).includes(valeur)
}

/* -------------------------------------------------------------------------- */
/* Type de véhicule                                                           */
/* -------------------------------------------------------------------------- */

export const TYPES_VEHICULE = ['CAR', 'MOTORCYCLE', 'BOTH'] as const

/* Emprunté aux règles véhicule : un seul vocabulaire pour un seul enum. */
export { VEHICLE_TYPE_LABELS }
export type { VehicleTypeValue }

export function isTypeVehicule(valeur: string): valeur is VehicleTypeValue {
  return (TYPES_VEHICULE as readonly string[]).includes(valeur)
}

/* -------------------------------------------------------------------------- */
/* Identité                                                                   */
/* -------------------------------------------------------------------------- */

export type IdentiteSaisie = {
  name: string
  tagline: string
  brand: string
  bulbBase: string
  temperature: string
  difficulty: string
  vehicleType: string
}

export type IdentiteWriteData = {
  name: string
  tagline: string | null
  brand: string | null
  bulbBase: string | null
  colorTemperature: number | null
  difficulty: DifficulteValue
  vehicleType: VehicleTypeValue
}

export const MARQUE_MAX = 120

/**
 * Accroche : la ligne sous le titre, en haut de la fiche.
 *
 * Elle rejoint l'identité plutôt que le référencement, parce qu'elle est lue
 * par le client et non par un moteur — et parce qu'elle se corrige en même
 * temps que le nom qu'elle prolonge.
 */
export const ACCROCHE_MAX = 160

/* Le nom est la même règle qu'à la création : repris, pas réécrit. */
export { NOM_MAX }

/**
 * Ce qui identifie le produit : son nom et ses attributs de recherche.
 *
 * L'adresse publique n'en fait pas partie, et c'est le point. Renommer
 * « Pack LED H7 » en « Pack LED H7 Pro » est une correction de libellé ;
 * déplacer `/p/pack-led-h7` est une rupture de lien. Les deux gestes ont donc
 * deux formulaires.
 */
export function parseIdentite(saisie: IdentiteSaisie): ParseResult<IdentiteWriteData> {
  const nom = parseNom(saisie.name)
  if (!nom.ok) return nom

  const accroche = saisie.tagline.trim()
  if (accroche.length > ACCROCHE_MAX) {
    return { ok: false, error: `L’accroche dépasse ${ACCROCHE_MAX} caractères.` }
  }

  const marque = saisie.brand.trim()
  if (marque.length > MARQUE_MAX) {
    return { ok: false, error: `La marque dépasse ${MARQUE_MAX} caractères.` }
  }

  const culot = parseCulot(saisie.bulbBase)
  if (!culot.ok) return culot

  const temperature = parseTemperature(saisie.temperature)
  if (!temperature.ok) return temperature

  if (!isDifficulte(saisie.difficulty)) {
    return { ok: false, error: 'Niveau de montage inconnu.' }
  }
  if (!isTypeVehicule(saisie.vehicleType)) {
    return { ok: false, error: 'Type de véhicule inconnu.' }
  }

  return {
    ok: true,
    value: {
      name: nom.value,
      tagline: accroche.length > 0 ? accroche : null,
      brand: marque.length > 0 ? marque : null,
      bulbBase: culot.value,
      colorTemperature: temperature.value,
      difficulty: saisie.difficulty,
      vehicleType: saisie.vehicleType,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Adresse publique                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Pourquoi l'adresse ne se change pas, ou `null` si elle se change.
 *
 * Il n'y a pas de table de redirections dans ce projet : l'ancienne adresse ne
 * devient pas un renvoi vers la nouvelle, elle devient une page introuvable.
 * Un lien envoyé par courriel, un lien partagé, un résultat de recherche
 * indexé — tout cela tombe en 404 sans que rien ne le signale.
 *
 * Un brouillon n'a jamais été servi au public : son adresse est encore libre.
 * Une fiche en ligne ou archivée a pu être partagée, et la repasser en
 * brouillon est alors le geste qui assume la rupture.
 */
export function raisonAdresseFigee(contexte: { statut: string }): string | null {
  if (contexte.statut === 'DRAFT') return null
  if (contexte.statut === 'ARCHIVED') {
    return "La fiche a été en ligne : son adresse a pu être partagée, et rien ici ne pose de redirection. Repassez-la en brouillon pour la changer."
  }
  return "La fiche est en ligne : changer son adresse ferait tomber en 404 les liens déjà partagés, car rien ici ne pose de redirection. Repassez-la en brouillon pour la changer."
}

/* -------------------------------------------------------------------------- */
/* Rédactionnel                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ramène les sauts de ligne à `\n`.
 *
 * Un `<textarea>` envoie ses retours en CRLF. C'est la spécification HTML et
 * non un caprice de navigateur : la valeur lue en JavaScript est en LF, celle
 * qui part dans le formulaire est en CRLF.
 *
 * Stocké tel quel, un rédactionnel ne se découpe plus en paragraphes.
 * `components/ui/Prose.tsx` sépare les blocs sur deux sauts de ligne
 * consécutifs (`\n{2,}`) ; le `\r` glissé entre les deux empêche le motif de
 * correspondre, tout le texte devient un seul bloc, et un `## Titre` en
 * première ligne avale la page entière dans son titre. Constaté au rendu
 * avant correction, sur un texte parfaitement bien écrit.
 */
export function normaliserSauts(texte: string): string {
  return texte.replace(/\r\n?/g, '\n')
}

export const DESCRIPTION_MAX = 400
export const BODY_MAX = 20000

export type RedactionnelSaisie = { description: string; body: string }
export type RedactionnelWriteData = { description: string | null; body: string | null }

/**
 * Les deux textes de la fiche, qui ne jouent pas le même rôle.
 *
 * `description` est une ou deux phrases, affichées en sous-titre du bloc de
 * comparaison des teintes : au-delà de quelques lignes, elles débordent la
 * mise en page. `body` est le rédactionnel long de la section « La
 * référence », rendu par `components/ui/Prose.tsx` — qui reconnaît `## titre`,
 * `**gras**` et les lignes `| libellé | valeur |`, et affiche tout le reste
 * tel quel, y compris une balise HTML, qui s'y voit au lieu de s'exécuter.
 */
export function parseRedactionnel(
  saisie: RedactionnelSaisie,
): ParseResult<RedactionnelWriteData> {
  const description = normaliserSauts(saisie.description).trim()
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `La description dépasse ${DESCRIPTION_MAX} caractères (${description.length}). C'est un sous-titre : une ou deux phrases.`,
    }
  }

  const body = normaliserSauts(saisie.body).trim()
  if (body.length > BODY_MAX) {
    return {
      ok: false,
      error: `Le rédactionnel dépasse ${BODY_MAX} caractères (${body.length}).`,
    }
  }

  return {
    ok: true,
    value: {
      description: description.length > 0 ? description : null,
      body: body.length > 0 ? body : null,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Caractéristiques                                                           */
/* -------------------------------------------------------------------------- */

export const SPECS_MAX = 60
export const SPEC_LABEL_MAX = 80
export const SPEC_VALUE_MAX = 240

export type SpecSaisie = { label: string; value: string }
export type SpecWriteData = { label: string; value: string }

/** Les lignes déjà posées sur la fiche, et celle que l'on modifie le cas échéant. */
export type ContexteSpecs = {
  existantes: Array<{ id: string; label: string }>
  /** Identifiant de la ligne en cours de modification, absent à l'ajout. */
  id?: string
}

/**
 * Une ligne du tableau de caractéristiques.
 *
 * Le libellé et la valeur sont tous deux exigés : une ligne « Culot » sans
 * valeur n'informe de rien, et une valeur sans libellé est illisible.
 *
 * Le groupe (`ProductSpec.group`) n'est pas demandé. La fiche publique affiche
 * toutes les lignes dans une seule grille, sans regarder ce champ : le
 * proposer à la saisie offrirait un réglage sans effet, ce qui est pire qu'une
 * absence.
 */
export function parseSpec(
  saisie: SpecSaisie,
  contexte: ContexteSpecs,
): ParseResult<SpecWriteData> {
  const label = saisie.label.trim()
  if (label.length === 0) {
    return { ok: false, error: 'Le libellé de la caractéristique est obligatoire.' }
  }
  if (label.length > SPEC_LABEL_MAX) {
    return { ok: false, error: `Le libellé dépasse ${SPEC_LABEL_MAX} caractères.` }
  }

  const value = saisie.value.trim()
  if (value.length === 0) {
    return {
      ok: false,
      error: `Donnez une valeur à « ${label} » : une ligne sans valeur n'apprend rien au client.`,
    }
  }
  if (value.length > SPEC_VALUE_MAX) {
    return { ok: false, error: `La valeur dépasse ${SPEC_VALUE_MAX} caractères.` }
  }

  const doublon = contexte.existantes.find(
    (ligne) => ligne.id !== contexte.id && ligne.label.trim().toLowerCase() === label.toLowerCase(),
  )
  if (doublon) {
    return {
      ok: false,
      error: `« ${doublon.label} » est déjà une caractéristique de cette fiche : modifiez la ligne existante plutôt que d'en ajouter une seconde.`,
    }
  }

  if (!contexte.id && contexte.existantes.length >= SPECS_MAX) {
    return {
      ok: false,
      error: `Cette fiche compte déjà ${SPECS_MAX} caractéristiques : au-delà, le tableau n'est plus lu.`,
    }
  }

  return { ok: true, value: { label, value } }
}

/* -------------------------------------------------------------------------- */
/* Questions fréquentes                                                       */
/* -------------------------------------------------------------------------- */

export const FAQ_MAX = 30
export const QUESTION_MAX = 200
export const REPONSE_MAX = 2000

export type FaqSaisie = { question: string; answer: string }
export type FaqWriteData = { question: string; answer: string }

export type ContexteFaq = {
  existantes: Array<{ id: string; question: string }>
  id?: string
}

/**
 * Une question et sa réponse.
 *
 * Les questions partent aussi dans les données structurées de la page
 * (`FaqStructuredData`), que les moteurs peuvent afficher directement dans
 * leurs résultats. Deux fois la même question y serait reprise deux fois, avec
 * deux réponses : d'où le refus du doublon, et non une simple mise en garde.
 */
export function parseFaq(saisie: FaqSaisie, contexte: ContexteFaq): ParseResult<FaqWriteData> {
  const question = saisie.question.trim()
  if (question.length === 0) return { ok: false, error: 'La question est obligatoire.' }
  if (question.length > QUESTION_MAX) {
    return { ok: false, error: `La question dépasse ${QUESTION_MAX} caractères.` }
  }

  const answer = normaliserSauts(saisie.answer).trim()
  if (answer.length === 0) {
    return {
      ok: false,
      error: 'Donnez une réponse : une question sans réponse inquiète au lieu de rassurer.',
    }
  }
  if (answer.length > REPONSE_MAX) {
    return { ok: false, error: `La réponse dépasse ${REPONSE_MAX} caractères.` }
  }

  const doublon = contexte.existantes.find(
    (ligne) =>
      ligne.id !== contexte.id && ligne.question.trim().toLowerCase() === question.toLowerCase(),
  )
  if (doublon) {
    return {
      ok: false,
      error: 'Cette question est déjà posée sur la fiche : complétez la réponse existante.',
    }
  }

  if (!contexte.id && contexte.existantes.length >= FAQ_MAX) {
    return { ok: false, error: `Cette fiche compte déjà ${FAQ_MAX} questions.` }
  }

  return { ok: true, value: { question, answer } }
}

/* -------------------------------------------------------------------------- */
/* Ordre d'une liste                                                          */
/* -------------------------------------------------------------------------- */

export type Sens = 'avant' | 'apres'

export function isSens(valeur: string): valeur is Sens {
  return valeur === 'avant' || valeur === 'apres'
}

/**
 * La liste après avoir échangé un élément avec son voisin, ou `null` quand il
 * n'y a rien à écrire.
 *
 * Renvoyer `null` plutôt que la liste inchangée est volontaire : l'action
 * n'écrit alors rien du tout, au lieu de renuméroter à l'identique et de
 * laisser croire qu'un déplacement a eu lieu. C'est aussi ce que fait
 * `deplacer` pour les visuels (`lib/admin/media-order.ts`), qui doit en plus
 * respecter les groupes de rôle — ici la liste est simple, les
 * caractéristiques et les questions n'ayant pas de groupes.
 */
export function ordreApresDeplacement(ids: string[], id: string, sens: Sens): string[] | null {
  const index = ids.indexOf(id)
  if (index === -1) return null

  const voisin = sens === 'avant' ? index - 1 : index + 1
  if (voisin < 0 || voisin >= ids.length) return null

  const ordre = [...ids]
  ordre[index] = ordre[voisin]
  ordre[voisin] = id
  return ordre
}

/* -------------------------------------------------------------------------- */
/* Guides de montage                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Pourquoi ce guide ne peut pas être rattaché, ou `null` s'il peut l'être.
 *
 * Un guide non publié est accepté — le rattachement se prépare souvent avant
 * la mise en ligne du guide — mais l'écran doit alors dire qu'il n'apparaîtra
 * pas sur la fiche : `getProduct` filtre les guides sur leur date de
 * publication. Un guide déjà rattaché, lui, est refusé : la table
 * `ProductGuide` a une clé primaire composée, et l'erreur de contrainte
 * n'apprendrait rien.
 */
export function raisonGuideNonRattachable(contexte: {
  guideId: string
  dejaRattaches: string[]
}): string | null {
  if (contexte.guideId.length === 0) return 'Choisissez un guide.'
  if (contexte.dejaRattaches.includes(contexte.guideId)) {
    return 'Ce guide est déjà rattaché à la fiche.'
  }
  return null
}

/** Ce que l'écran dit d'un guide rattaché mais invisible. */
export function noteGuideNonPublie(guide: { publie: boolean }): string | null {
  return guide.publie
    ? null
    : "Ce guide n'est pas publié : il reste rattaché, mais la fiche ne l'affiche pas."
}

