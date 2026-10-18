/**
 * Lecture de CSV.
 *
 * Écrit à la main plutôt qu'installé, pour trois raisons qui tiennent au
 * terrain français :
 *
 *   - les exports de tableurs francophones utilisent le **point-virgule**,
 *     parce que la virgule est déjà le séparateur décimal ;
 *   - Excel ajoute un **BOM** en tête de fichier, qui colle au premier nom de
 *     colonne et fait échouer toute correspondance (« ﻿sku » ≠ « sku ») ;
 *   - les champs entre guillemets peuvent contenir le délimiteur, des sauts de
 *     ligne et des guillemets doublés.
 *
 * Un `split(';')` échoue sur chacun de ces points, et les trois arrivent dès le
 * premier fichier réel.
 */

export type CsvTable = {
  headers: string[]
  rows: string[][]
  delimiter: string
  /** Lignes ignorées parce qu'entièrement vides. */
  skippedEmpty: number
}

const CANDIDATE_DELIMITERS = [';', ',', '\t', '|'] as const

/**
 * Devine le délimiteur à partir de la première ligne non vide.
 * On retient celui qui découpe en le plus de colonnes, à égalité le premier
 * de la liste — le point-virgule, le plus courant ici.
 */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  let best: string = CANDIDATE_DELIMITERS[0]
  let bestCount = 0

  for (const delimiter of CANDIDATE_DELIMITERS) {
    // On compte hors guillemets : « Nom; prénom » ne doit pas faire croire
    // qu'une ligne a deux colonnes si elle n'en a qu'une.
    let count = 0
    let inQuotes = false
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i]
      if (char === '"') {
        if (inQuotes && firstLine[i + 1] === '"') i += 1
        else inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        count += 1
      }
    }
    if (count > bestCount) {
      bestCount = count
      best = delimiter
    }
  }

  return best
}

/** Retire le BOM, qui sinon se colle au premier nom de colonne. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function parseCsv(input: string, forcedDelimiter?: string): CsvTable {
  const text = stripBom(input)
  const delimiter = forcedDelimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let skippedEmpty = 0

  const pushField = () => {
    row.push(field.trim())
    field = ''
  }

  const pushRow = () => {
    pushField()
    // Une ligne entièrement vide n'est pas une donnée : les tableurs en
    // ajoutent volontiers à la fin du fichier.
    if (row.every((value) => value === '')) skippedEmpty += 1
    else rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Guillemet doublé : un guillemet littéral.
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      pushField()
    } else if (char === '\r') {
      // Ignoré : le \n qui suit termine la ligne (fins de ligne Windows).
    } else if (char === '\n') {
      pushRow()
    } else {
      field += char
    }
  }

  // Dernière ligne sans saut de ligne final.
  if (field.length > 0 || row.length > 0) pushRow()

  const headers = (rows.shift() ?? []).map((header) => header.trim())
  return { headers, rows, delimiter, skippedEmpty }
}

/**
 * Normalise un nom de colonne pour la correspondance automatique :
 * minuscules, sans accent, sans ponctuation. « Prix TTC (€) » et
 * « prix_ttc » deviennent « prixttc ».
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Convertit une ligne en objet, selon une correspondance colonne → champ. */
export function mapRow(
  headers: string[],
  row: string[],
  mapping: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((header, index) => {
    const field = mapping[header]
    if (!field || field === '__ignore__') return
    result[field] = row[index] ?? ''
  })
  return result
}

/**
 * Lit un nombre dans la graphie française comme dans l'anglaise.
 * « 1 234,56 », « 1.234,56 » et « 1234.56 » donnent tous 1234.56.
 * Renvoie null si la valeur n'est pas un nombre — ce n'est pas la même chose
 * que zéro, et un import ne doit jamais confondre les deux.
 */
export function parseNumber(raw: string): number | null {
  const value = raw.trim()
  if (value === '') return null

  // Espaces (y compris insécables) et symboles monétaires.
  let cleaned = value.replace(/[\s  €$]/g, '')

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    // Le séparateur décimal est le dernier des deux ; l'autre groupe les milliers.
    if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    else cleaned = cleaned.replace(/,/g, '')
  } else if (lastComma > -1) {
    // Une virgule seule : décimale si elle précède 1 ou 2 chiffres, sinon
    // séparateur de milliers (« 1,234 » vaut 1234 dans un export anglais).
    const decimals = cleaned.length - lastComma - 1
    cleaned = decimals <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** Lit un booléen tolérant : oui/non, true/false, 1/0, x, vrai/faux. */
export function parseBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase()
  if (value === '') return null
  if (['1', 'true', 'vrai', 'oui', 'o', 'yes', 'y', 'x'].includes(value)) return true
  if (['0', 'false', 'faux', 'non', 'n', 'no'].includes(value)) return false
  return null
}

/** Montant en centimes à partir d'un prix écrit en euros. */
export function parsePriceCents(raw: string): number | null {
  const value = parseNumber(raw)
  if (value === null) return null
  return Math.round(value * 100)
}
