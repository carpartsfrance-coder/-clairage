import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { mapRow, parseCsv } from './csv'
import { IMPORT_DEFINITIONS, missingRequiredFields, suggestMapping } from './definitions'
import { applyRow, dedupKey, validateRow, type WriteMode } from './handlers'

/**
 * Moteur d'import.
 *
 * Le déroulé en quatre temps, et chacun existe pour une raison :
 *
 *   1. **Analyse** — on lit le fichier, on devine la correspondance des
 *      colonnes et on la PROPOSE. Rien n'est écrit.
 *   2. **Prévisualisation** — chaque ligne est validée et stockée avec son
 *      verdict. On voit les erreurs, les doublons et les avertissements avant
 *      d'avoir touché au catalogue.
 *   3. **Exécution par lots** — les lignes valides sont écrites par paquets,
 *      avec un curseur. Un import de 3 000 lignes interrompu reprend où il en
 *      était au lieu de tout rejouer.
 *   4. **Rapport** — chaque ligne garde son verdict et son motif. « 412 lignes
 *      mises à jour » ne permet de rien vérifier ; « prix 9,90 → 12,50 » si.
 *
 * Chaque lot est écrit dans sa propre transaction. Une ligne fautive annule son
 * lot, pas l'import : le but est de passer le fichier en entier et de rapporter
 * ce qui coince, pas de s'arrêter à la première anomalie.
 */

const CHUNK_SIZE = 50

export type PreparedImport = {
  jobId: string
  headers: string[]
  delimiter: string
  mapping: Record<string, string>
  totalRows: number
  skippedEmpty: number
  missingRequired: string[]
}

/**
 * Plafond en nombre de lignes.
 *
 * La limite de 5 Mo annoncée à l'écran est tenable côté requête, pas côté
 * temps d'exécution : un CSV de 5 Mo porte environ 100 000 lignes, lues en
 * mémoire puis insérées en un seul `createMany` dans une action de serveur.
 * Mieux vaut un refus chiffré, qui dit comment découper, qu'une action qui
 * dépasse son temps imparti et laisse un import à moitié créé.
 */
const MAX_IMPORT_ROWS = 20_000

/** Étape 1 : lit le fichier, crée le travail, propose une correspondance. */
export async function prepareImport(options: {
  kind: string
  filename: string
  content: string
  createdBy: string
}): Promise<PreparedImport | { error: string }> {
  const definition = IMPORT_DEFINITIONS[options.kind]
  if (!definition) return { error: "Format d'import inconnu." }

  const table = parseCsv(options.content)
  if (table.headers.length === 0) {
    return { error: 'Le fichier ne contient aucune colonne lisible.' }
  }
  if (table.rows.length === 0) {
    return { error: 'Le fichier ne contient aucune ligne de données.' }
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return {
      error:
        `Le fichier contient ${table.rows.length.toLocaleString('fr-FR')} lignes, au-delà des ` +
        `${MAX_IMPORT_ROWS.toLocaleString('fr-FR')} traitées en un seul import. Découpez-le : ` +
        'plusieurs imports successifs donnent le même résultat et chacun reste vérifiable ligne à ligne.',
    }
  }

  const mapping = suggestMapping(table.headers, definition)
  const missing = missingRequiredFields(mapping, definition)

  const job = await prisma.importJob.create({
    data: {
      kind: definition.kind,
      filename: options.filename,
      columnMapping: mapping,
      status: 'DRAFT',
      totalRows: table.rows.length,
      createdBy: options.createdBy,
    },
  })

  // Les lignes brutes sont conservées : la prévisualisation, la reprise et le
  // rapport s'appuient dessus, et on peut rejouer un diagnostic après coup.
  // Insertion par paquets de 1 000 : un seul `createMany` de 20 000 lignes
  // produit une requête que PostgreSQL accepte mal, et la mémoire du paquet
  // reste bornée.
  const INSERT_CHUNK = 1_000
  for (let offset = 0; offset < table.rows.length; offset += INSERT_CHUNK) {
    const slice = table.rows.slice(offset, offset + INSERT_CHUNK)
    await prisma.importRow.createMany({
      data: slice.map((row, index) => ({
        jobId: job.id,
        // +2 : l'en-tête est la ligne 1 du fichier.
        rowNumber: offset + index + 2,
        raw: Object.fromEntries(table.headers.map((header, i) => [header, row[i] ?? ''])),
        outcome: 'pending',
      })),
    })
  }

  return {
    jobId: job.id,
    headers: table.headers,
    delimiter: table.delimiter,
    mapping,
    totalRows: table.rows.length,
    skippedEmpty: table.skippedEmpty,
    missingRequired: missing.map((field) => field.label),
  }
}

/** Enregistre une correspondance corrigée à la main. */
/**
 * Étape 1 bis : la correspondance des colonnes est corrigée à la main.
 *
 * Changer la correspondance invalide tout ce qui en découlait. On efface donc
 * le chiffrage ET les verdicts de ligne, au lieu de laisser l'écran afficher
 * « 1 240 lignes valides, 3 erreurs » à propos d'une association qui n'existe
 * plus. Un rapport périmé qui se présente comme courant est pire qu'un rapport
 * absent : il se lit comme une vérification.
 */
export async function updateMapping(jobId: string, mapping: Record<string, string>) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Import introuvable.' }

  // On ne réécrit pas la correspondance d'un import en cours d'écriture, ni
  // d'un import terminé : les lignes déjà écrites l'ont été avec l'ancienne.
  if (job.status === 'RUNNING') {
    return { error: 'Écriture en cours : la correspondance ne peut pas être modifiée.' }
  }
  if (job.status === 'DONE') {
    return {
      error:
        'Cet import est terminé. Déposez un nouveau fichier plutôt que de modifier ' +
        'la correspondance d’un import déjà écrit.',
    }
  }

  await prisma.$transaction([
    prisma.importJob.update({
      where: { id: jobId },
      data: {
        columnMapping: mapping,
        status: 'DRAFT',
        // Le chiffrage et les compteurs décrivaient l'ancienne association.
        // `JsonNull` et non `null` : sur une colonne Json, Prisma distingue
        // « champ absent de la mise à jour » de « valeur JSON nulle ».
        summary: Prisma.JsonNull,
        errorRows: 0,
        skippedRows: 0,
      },
    }),
    prisma.importRow.updateMany({
      where: { jobId },
      data: { outcome: 'pending', message: null },
    }),
  ])

  return { ok: true as const }
}

export type PreviewResult = {
  valid: number
  errors: number
  duplicates: number
  warnings: number
  missingRequired: string[]
}

/**
 * Étape 2 : valide toutes les lignes sans rien écrire.
 *
 * Les doublons sont cherchés DANS le fichier : deux lignes de même clé ne
 * peuvent pas être écrites toutes les deux, la seconde écraserait la première
 * en silence. La première passe, les suivantes sont signalées.
 */
export async function previewImport(jobId: string): Promise<PreviewResult | { error: string }> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Import introuvable.' }

  const definition = IMPORT_DEFINITIONS[job.kind]
  if (!definition) return { error: "Format d'import inconnu." }

  const mapping = job.columnMapping as Record<string, string>
  const missing = missingRequiredFields(mapping, definition)
  if (missing.length > 0) {
    return {
      error: `Colonnes obligatoires non associées : ${missing.map((f) => f.label).join(', ')}.`,
    }
  }

  await prisma.importJob.update({ where: { id: jobId }, data: { status: 'VALIDATING' } })

  const rows = await prisma.importRow.findMany({
    where: { jobId },
    orderBy: { rowNumber: 'asc' },
  })

  const seen = new Map<string, number>()
  let valid = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0

  for (const row of rows) {
    const raw = row.raw as Record<string, string>
    const headers = Object.keys(raw)
    const mapped = mapRow(headers, headers.map((header) => raw[header]), mapping)

    const { errors: rowErrors, warnings: rowWarnings } = validateRow(job.kind, mapped)

    if (rowErrors.length > 0) {
      errors += 1
      await prisma.importRow.update({
        where: { id: row.id },
        data: { outcome: 'error', message: rowErrors.join(' ') },
      })
      continue
    }

    const key = dedupKey(job.kind, mapped)
    if (key && seen.has(key)) {
      duplicates += 1
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          outcome: 'duplicate',
          message: `Déjà présent ligne ${seen.get(key)} du fichier (${key}). Ligne ignorée.`,
        },
      })
      continue
    }
    if (key) seen.set(key, row.rowNumber)

    if (rowWarnings.length > 0) warnings += 1
    valid += 1
    await prisma.importRow.update({
      where: { id: row.id },
      data: { outcome: 'ready', message: rowWarnings.join(' ') || null },
    })
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: 'PREVIEW',
      errorRows: errors,
      skippedRows: duplicates,
      cursor: 0,
      createdRows: 0,
      updatedRows: 0,
      processedRows: 0,
      summary: { valid, errors, duplicates, warnings },
    },
  })

  return { valid, errors, duplicates, warnings, missingRequired: [] }
}

export type RunResult = {
  done: boolean
  processed: number
  created: number
  updated: number
  skipped: number
  errors: number
  cursor: number
  total: number
}

/**
 * Étape 3 : écrit un lot, puis rend la main.
 *
 * Appelée en boucle par l'écran, ou par le cron pour un gros fichier. Le
 * curseur est enregistré après chaque lot : une interruption ne coûte que le
 * lot en cours.
 */
export async function runImportChunk(jobId: string): Promise<RunResult | { error: string }> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) return { error: 'Import introuvable.' }
  if (job.status === 'DONE') {
    return {
      done: true,
      processed: job.processedRows,
      created: job.createdRows,
      updated: job.updatedRows,
      skipped: job.skippedRows,
      errors: job.errorRows,
      cursor: job.cursor,
      total: job.totalRows,
    }
  }
  if (job.status !== 'PREVIEW' && job.status !== 'RUNNING' && job.status !== 'PAUSED') {
    return { error: 'Cet import doit d’abord être prévisualisé.' }
  }

  const mapping = job.columnMapping as Record<string, string>
  const mode = job.writeMode as WriteMode

  /*
    Verrou d'écriture.

    Sans lui, deux appels concurrents — deux onglets, deux membres de l'équipe,
    un double-clic — lisaient le même lot de lignes au-delà du curseur et
    l'écrivaient deux fois, en comptant deux fois. `updateMany` avec une
    condition sur le statut est atomique : un seul appel obtient le passage de
    PREVIEW/PAUSED à RUNNING, les autres repartent avec un refus explicite.

    Le verrou porte aussi une empreinte temporelle : un processus tué en cours
    de lot laisserait l'import bloqué en RUNNING pour toujours, sans personne
    pour le débloquer.
  */
  const STALE_LOCK_MS = 10 * 60 * 1000
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS)

  const claimed = await prisma.importJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ['PREVIEW', 'PAUSED'] } },
        // Verrou orphelin : repris au bout de dix minutes sans progression.
        { status: 'RUNNING', lockedAt: { lt: staleBefore } },
        { status: 'RUNNING', lockedAt: null },
      ],
    },
    data: { status: 'RUNNING', lockedAt: new Date(), startedAt: job.startedAt ?? new Date() },
  })

  if (claimed.count === 0) {
    return {
      error:
        'Un lot est déjà en cours d’écriture pour cet import. Attendez qu’il se termine ' +
        'avant de relancer — sans quoi les mêmes lignes seraient écrites deux fois.',
    }
  }

  // Seules les lignes validées sont écrites, et seulement au-delà du curseur.
  const chunk = await prisma.importRow.findMany({
    where: { jobId, outcome: 'ready', rowNumber: { gt: job.cursor } },
    orderBy: { rowNumber: 'asc' },
    take: CHUNK_SIZE,
  })

  if (chunk.length === 0) {
    const finished = await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'DONE', finishedAt: new Date() },
    })
    return {
      done: true,
      processed: finished.processedRows,
      created: finished.createdRows,
      updated: finished.updatedRows,
      skipped: finished.skippedRows,
      errors: finished.errorRows,
      cursor: finished.cursor,
      total: finished.totalRows,
    }
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let cursor = job.cursor

  for (const row of chunk) {
    const raw = row.raw as Record<string, string>
    const headers = Object.keys(raw)
    const mapped = mapRow(headers, headers.map((header) => raw[header]), mapping)

    try {
      // Une transaction par ligne : une ligne fautive n'annule pas les autres.
      const result = await prisma.$transaction((tx) => applyRow(tx, job.kind, mapped, mode))
      if (result.outcome === 'created') created += 1
      else if (result.outcome === 'updated') updated += 1
      else if (result.outcome === 'skipped') skipped += 1
      else if (result.outcome === 'error') errors += 1

      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          outcome: result.outcome,
          message: result.message ?? null,
          targetId: result.targetId ?? null,
        },
      })
    } catch (error) {
      errors += 1
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[import] ligne ${row.rowNumber}`, error)
      await prisma.importRow.update({
        where: { id: row.id },
        data: { outcome: 'error', message: message.slice(0, 500) },
      })
    }

    cursor = row.rowNumber
  }

  const updatedJob = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      cursor,
      processedRows: { increment: chunk.length },
      createdRows: { increment: created },
      updatedRows: { increment: updated },
      skippedRows: { increment: skipped },
      errorRows: { increment: errors },
    },
  })

  const remaining = await prisma.importRow.count({
    where: { jobId, outcome: 'ready', rowNumber: { gt: cursor } },
  })

  // Fin de lot : le verrou est relâché dans les deux cas. Sans cela, le lot
  // suivant se heurterait au verrou de celui qui vient de finir, et l'import
  // resterait coincé dix minutes à chaque paquet.
  if (remaining === 0) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'DONE', finishedAt: new Date(), lockedAt: null },
    })
  } else {
    // PAUSED, pas RUNNING : l'écriture avance lot par lot, à la demande. C'est
    // aussi ce qui rend cet état atteignable — les deux écrans l'affichaient
    // sans qu'aucun code ne le pose jamais.
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'PAUSED', lockedAt: null },
    })
  }

  return {
    done: remaining === 0,
    processed: updatedJob.processedRows,
    created: updatedJob.createdRows,
    updated: updatedJob.updatedRows,
    skipped: updatedJob.skippedRows,
    errors: updatedJob.errorRows,
    cursor,
    total: updatedJob.totalRows,
  }
}

/** Rapport détaillé, ligne par ligne. */
export async function getImportReport(jobId: string, outcome?: string) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) return null

  const rows = await prisma.importRow.findMany({
    where: { jobId, ...(outcome ? { outcome } : {}) },
    orderBy: { rowNumber: 'asc' },
    take: 500,
  })

  const counts = await prisma.importRow.groupBy({
    by: ['outcome'],
    where: { jobId },
    _count: true,
  })

  return {
    job,
    rows,
    counts: Object.fromEntries(counts.map((entry) => [entry.outcome, entry._count])),
  }
}

/**
 * Historique.
 *
 * L'erreur est PROPAGÉE, volontairement. Renvoyer un tableau vide faisait
 * afficher « Aucun import » : une affirmation que l'écran n'est pas en mesure
 * de faire quand la requête a échoué. Mieux vaut une page en erreur, qui se
 * voit, qu'une page qui prétend savoir.
 */
export async function listImportJobs(limit = 30) {
  return prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
}
