/**
 * Règles d'écriture du référentiel véhicule.
 *
 * Tout ce qui est décidable sans la base est ici, et c'est délibéré : ce sont
 * ces règles qui empêchent le back-office de créer des liens morts ou
 * d'inscrire une vérification qui n'a pas eu lieu. Les mettre dans les actions
 * de serveur les rendrait invérifiables autrement qu'en les exécutant contre
 * une vraie base.
 *
 * Trois décisions structurent ce fichier :
 *
 * 1. **Le slug est une adresse publique, pas un libellé.** Il se fabrique à la
 *    création puis ne bouge plus tout seul : renommer « Golf » en « Golf VII »
 *    ne doit pas déplacer `/packs/auto/volkswagen/golf`. Le changer reste
 *    possible, mais c'est une opération distincte, qui s'annonce.
 * 2. **Une compatibilité n'est confirmée que si quelqu'un l'a vérifiée.**
 *    `source` et `verifiedAt` ne sont jamais remplis par le code : sans eux,
 *    `CONFIRMED` est refusé. Un statut illisible retombe sur `UNKNOWN`, jamais
 *    l'inverse.
 * 3. **On ne supprime pas ce qui porte des compatibilités.** Désactiver retire
 *    du site sans rien perdre ; supprimer effacerait un travail de
 *    documentation et les adresses déjà partagées.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Adresses publiques                                                         */
/* -------------------------------------------------------------------------- */

/** Un slug : minuscules, chiffres, traits d'union simples, sans bord. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

/**
 * Fabrique un slug à partir d'un nom saisi.
 *
 * Les accents sont décomposés puis retirés plutôt que remplacés par une table :
 * « Citroën » donne `citroen`, « Peugeot 2008 » donne `peugeot-2008`. Les
 * caractères que l'URL ne tolère pas deviennent des traits d'union, et les
 * répétitions sont écrasées — sans quoi « BMW  Série 3 » donnerait
 * `bmw--serie-3`.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Slug demandé, ou dérivé du nom quand le champ est laissé vide.
 *
 * Le formulaire pré-remplit le slug, mais rien n'oblige l'administrateur à le
 * garder : « Volkswagen » peut viser `vw` si c'est l'adresse voulue.
 */
export function resolveSlug(nameOrSlug: { name: string; slug?: string | null }): ParseResult<string> {
  const demandé = (nameOrSlug.slug ?? '').trim()
  const slug = demandé ? slugify(demandé) : slugify(nameOrSlug.name)

  if (!slug) {
    return {
      ok: false,
      error:
        "Le nom ne donne aucune adresse utilisable (il faut au moins une lettre ou un chiffre). Saisissez l'adresse à la main.",
    }
  }
  if (slug.length > 80) {
    return { ok: false, error: "L'adresse ne peut pas dépasser 80 caractères." }
  }
  return { ok: true, value: slug }
}

/**
 * Adresse publique d'une marque, d'un modèle ou d'une génération.
 *
 * L'arrêt au premier niveau manquant n'est pas un détail : filtrer les valeurs
 * vides ferait remonter la génération à la place du modèle, et produirait une
 * adresse plausible qui ne mène nulle part.
 */
export function vehiclePackPath(
  typePath: string,
  makeSlug: string,
  modelSlug?: string | null,
  generationSlug?: string | null,
): string {
  const parts = ['/packs', typePath, makeSlug]

  for (const niveau of [modelSlug, generationSlug]) {
    if (!niveau) break
    parts.push(niveau)
  }
  return parts.join('/')
}

/* -------------------------------------------------------------------------- */
/* Types de véhicule                                                          */
/* -------------------------------------------------------------------------- */

export type VehicleTypeValue = 'CAR' | 'MOTORCYCLE' | 'BOTH'

export const VEHICLE_TYPE_LABELS: Record<VehicleTypeValue, string> = {
  CAR: 'Voiture',
  MOTORCYCLE: 'Moto',
  BOTH: 'Voiture et moto',
}

/** Chemin public d'un type, ou `null` quand aucun parcours ne le liste. */
export function typePath(type: VehicleTypeValue): string | null {
  if (type === 'CAR') return 'auto'
  if (type === 'MOTORCYCLE') return 'moto'
  return null
}

/* -------------------------------------------------------------------------- */
/* Périodes de production                                                     */
/* -------------------------------------------------------------------------- */

/** Première automobile de série : rien d'antérieur n'a de phare à équiper. */
const PREMIERE_ANNEE = 1900

/**
 * Années d'une génération.
 *
 * `yearTo` vide signifie « toujours produite », et c'est ce que le schéma
 * attend (`yearTo` nul). Une année de fin antérieure au début n'est pas une
 * coquille rattrapable : on refuse plutôt que d'inverser, parce qu'on ne sait
 * pas laquelle des deux est fausse.
 */
export function parsePeriod(
  yearFrom: string,
  yearTo: string,
  /** Pour borner le futur. Injectable afin que le test ne dépende pas du jour. */
  now: Date = new Date(),
): ParseResult<{ yearFrom: number; yearTo: number | null }> {
  const maximum = now.getUTCFullYear() + 2

  const début = Number(yearFrom.trim())
  if (!Number.isInteger(début)) {
    return { ok: false, error: "L'année de début est obligatoire, en quatre chiffres." }
  }
  if (début < PREMIERE_ANNEE || début > maximum) {
    return { ok: false, error: `L'année de début doit être comprise entre ${PREMIERE_ANNEE} et ${maximum}.` }
  }

  const brut = yearTo.trim()
  if (!brut) return { ok: true, value: { yearFrom: début, yearTo: null } }

  const fin = Number(brut)
  if (!Number.isInteger(fin)) {
    return { ok: false, error: "L'année de fin doit être en quatre chiffres, ou laissée vide." }
  }
  if (fin < début) {
    return { ok: false, error: "L'année de fin ne peut pas précéder l'année de début." }
  }
  if (fin > maximum) {
    return { ok: false, error: `L'année de fin ne peut pas dépasser ${maximum}.` }
  }

  return { ok: true, value: { yearFrom: début, yearTo: fin } }
}

/** « 2012–2019 » si la génération est arrêtée, « depuis 2019 » sinon. */
export function periodLabel(yearFrom: number, yearTo: number | null): string {
  return yearTo ? `${yearFrom}–${yearTo}` : `depuis ${yearFrom}`
}

/* -------------------------------------------------------------------------- */
/* Compatibilités                                                             */
/* -------------------------------------------------------------------------- */

export const FITMENT_STATUSES = ['CONFIRMED', 'UNKNOWN', 'INCOMPATIBLE'] as const
export type FitmentStatusValue = (typeof FITMENT_STATUSES)[number]

export const ROAD_APPROVALS = ['APPROVED', 'NOT_APPROVED', 'UNKNOWN'] as const
export type RoadApprovalValue = (typeof ROAD_APPROVALS)[number]

export const FITMENT_STATUS_LABELS: Record<FitmentStatusValue, string> = {
  CONFIRMED: 'Compatibilité confirmée',
  UNKNOWN: 'À vérifier',
  INCOMPATIBLE: 'Incompatible',
}

export const ROAD_APPROVAL_LABELS: Record<RoadApprovalValue, string> = {
  APPROVED: 'Homologué route',
  NOT_APPROVED: 'Non homologué route',
  UNKNOWN: 'Homologation inconnue',
}

export type FitmentFormInput = {
  status?: string | null
  quantity?: string | null
  restrictions?: string | null
  roadApproval?: string | null
  approvalMarket?: string | null
  approvalNote?: string | null
  source?: string | null
  verifiedAt?: string | null
}

export type FitmentWriteData = {
  status: FitmentStatusValue
  quantity: number
  restrictions: string | null
  roadApproval: RoadApprovalValue
  approvalMarket: string
  approvalNote: string | null
  source: string | null
  verifiedAt: Date | null
}

function texteOuNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Date d'un champ `<input type="date">`, lue en UTC.
 *
 * `new Date('2026-03-01')` fonctionnerait, mais `new Date('01/03/2026')` aussi,
 * avec un mois et un jour inversés selon le navigateur. On n'accepte que le
 * format ISO que le champ produit, et on construit la date en UTC pour qu'un
 * serveur à Paris et un serveur en UTC n'enregistrent pas deux jours
 * différents.
 */
export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null

  const [, année, mois, jour] = match
  const date = new Date(Date.UTC(Number(année), Number(mois) - 1, Number(jour)))

  // Rejette le 31 février, que `Date.UTC` reporterait silencieusement au 3 mars.
  if (
    date.getUTCFullYear() !== Number(année) ||
    date.getUTCMonth() !== Number(mois) - 1 ||
    date.getUTCDate() !== Number(jour)
  ) {
    return null
  }
  return date
}

/**
 * Valeurs d'une compatibilité, telles qu'elles seront écrites.
 *
 * Le cœur des garde-fous du projet tient dans cette fonction :
 *
 * - **Le statut par défaut est `UNKNOWN`.** Un champ vide, absent ou illisible
 *   ne peut jamais produire `CONFIRMED` ; au pire on retombe sur « à
 *   vérifier », ce qui est la vérité quand on ne sait pas.
 * - **`CONFIRMED` exige une source et une date.** Le schéma définit ce statut
 *   comme « vérifiée et datée » : l'accepter sans l'une des deux reviendrait à
 *   publier une confirmation que personne ne peut recouper. Rien n'est
 *   pré-rempli à la place de l'administrateur — pas de `new Date()` implicite,
 *   qui inscrirait comme faite une vérification jamais faite.
 * - **La source et la date survivent aux autres statuts.** « Vérifié le 3 mars
 *   auprès de Valeo, incompatible » est une information utile ; l'effacer
 *   ferait perdre la trace du travail déjà fait.
 */
export function parseFitment(
  input: FitmentFormInput,
  now: Date = new Date(),
): ParseResult<FitmentWriteData> {
  const statutBrut = (input.status ?? '').trim().toUpperCase()
  const status: FitmentStatusValue = (FITMENT_STATUSES as readonly string[]).includes(statutBrut)
    ? (statutBrut as FitmentStatusValue)
    : 'UNKNOWN'

  const quantitéBrute = (input.quantity ?? '').trim()
  const quantity = quantitéBrute === '' ? 1 : Number(quantitéBrute)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return {
      ok: false,
      error: 'La quantité doit être un nombre entier compris entre 1 et 99.',
    }
  }

  const approbationBrute = (input.roadApproval ?? '').trim().toUpperCase()
  const roadApproval: RoadApprovalValue = (ROAD_APPROVALS as readonly string[]).includes(
    approbationBrute,
  )
    ? (approbationBrute as RoadApprovalValue)
    : 'UNKNOWN'

  const marchéBrut = (input.approvalMarket ?? '').trim().toUpperCase()
  if (marchéBrut && !/^[A-Z]{2}$/.test(marchéBrut)) {
    return { ok: false, error: 'Le marché d’homologation s’écrit en deux lettres (FR, DE, EU…).' }
  }
  const approvalMarket = marchéBrut || 'FR'

  const source = texteOuNull(input.source)

  const dateBrute = (input.verifiedAt ?? '').trim()
  let verifiedAt: Date | null = null
  if (dateBrute) {
    verifiedAt = parseISODate(dateBrute)
    if (!verifiedAt) {
      return { ok: false, error: 'La date de vérification doit être une date réelle (JJ/MM/AAAA).' }
    }
    if (verifiedAt.getTime() > now.getTime()) {
      return { ok: false, error: 'La date de vérification ne peut pas être dans le futur.' }
    }
  }

  if (status === 'CONFIRMED' && (!source || !verifiedAt)) {
    return {
      ok: false,
      error:
        'Une compatibilité confirmée demande sa source et sa date de vérification : sans elles, elle reste « à vérifier ».',
    }
  }

  return {
    ok: true,
    value: {
      status,
      quantity,
      restrictions: texteOuNull(input.restrictions),
      roadApproval,
      approvalMarket,
      approvalNote: texteOuNull(input.approvalNote),
      source,
      verifiedAt,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Suppressions                                                               */
/* -------------------------------------------------------------------------- */

export type VehicleLevel = 'make' | 'model' | 'generation'

const NIVEAUX: Record<VehicleLevel, { nom: string; enfant: string; enfants: string }> = {
  make: { nom: 'Cette marque', enfant: 'modèle', enfants: 'modèles' },
  model: { nom: 'Ce modèle', enfant: 'génération', enfants: 'générations' },
  generation: { nom: 'Cette génération', enfant: 'configuration', enfants: 'configurations' },
}

export type VehicleDependencies = {
  /** Modèles, générations ou configurations rattachés, selon le niveau. */
  children: number
  /** Compatibilités portées, enfants compris. */
  fitments: number
}

/**
 * Pourquoi une suppression est refusée, ou `null` si elle est sans danger.
 *
 * On ne supprime que ce qui ne porte rien : une ligne créée par erreur il y a
 * trente secondes. Dès qu'une compatibilité ou un enfant existe, la
 * suppression détruirait un travail de documentation et des adresses déjà
 * indexées — la désactivation fait le même effet côté client, et se défait.
 */
export function deletionBlockedReason(
  level: VehicleLevel,
  dependencies: VehicleDependencies,
): string | null {
  const niveau = NIVEAUX[level]

  if (dependencies.fitments > 0) {
    const s = dependencies.fitments > 1 ? 's' : ''
    return `${niveau.nom} porte ${dependencies.fitments} compatibilité${s} : la supprimer les effacerait. Désactivez-la — elle disparaît du site et reste rétablissable.`
  }
  if (dependencies.children > 0) {
    const pluriel = dependencies.children > 1 ? niveau.enfants : niveau.enfant
    return `${niveau.nom} contient ${dependencies.children} ${pluriel} : videz-la d'abord, ou désactivez-la.`
  }
  return null
}
