'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { IMPORT_DEFINITIONS } from '../imports/definitions'
import { prepareImport, previewImport, runImportChunk, updateMapping } from '../imports/runner'
import type { WriteMode } from '../imports/handlers'

/**
 * Actions d'import du back-office.
 *
 * Trois règles, les mêmes que pour les commandes :
 *
 * 1. **Chaque action revérifie le droit.** La page qui affiche le bouton l'a
 *    déjà fait, mais une action de serveur est un point d'entrée public : elle
 *    est atteignable sans jamais voir l'écran.
 * 2. **Rien n'est écrit sans l'avoir demandé.** Déposer un fichier l'analyse
 *    et le valide ; l'écriture est une action distincte, lot par lot.
 * 3. **Tout est tracé** dans `AuditLog` : qui a déposé quel fichier, qui a
 *    corrigé la correspondance, qui a lancé l'écriture.
 *
 * Le découpage en lots appartient au moteur (`lib/imports/runner`) : ici on ne
 * fait que lire le formulaire, appeler, journaliser et rendre un message.
 */

export type ImportState = { error?: string; notice?: string; jobId?: string }

/** Pluriel simple : « 1 ligne valide », « 12 lignes valides ». */
const s = (count: number) => (count > 1 ? 's' : '')

/** 5 Mo : au-delà, le fichier est lu en mémoire par l'action et la requête échoue. */
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.csv', '.txt']

const WRITE_MODES: WriteMode[] = ['create_only', 'update_only', 'upsert']

function readId(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/* -------------------------------------------------------------------------- */
/* Étape 1 — dépôt et analyse du fichier                                      */
/* -------------------------------------------------------------------------- */

export async function startImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const staff = await requireStaff('imports.run')

  const kind = readId(formData, 'kind')
  const definition = IMPORT_DEFINITIONS[kind]
  if (!definition) return { error: "Choisissez un format d'import." }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choisissez un fichier à analyser.' }
  }

  // Les deux refus sont dits avec le chiffre ou l'extension en cause : « fichier
  // invalide » n'apprend rien à la personne qui doit corriger.
  if (file.size > MAX_BYTES) {
    const mo = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',')
    return {
      error: `Fichier trop volumineux : ${mo} Mo pour 5 Mo au maximum. Découpez-le en plusieurs fichiers.`,
    }
  }

  const name = file.name
  const dot = name.lastIndexOf('.')
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      error: `Extension refusée${extension ? ` (${extension})` : ''} : seuls les fichiers .csv et .txt sont acceptés. Depuis un tableur, enregistrez en CSV.`,
    }
  }

  let jobId: string
  try {
    const content = await file.text()
    const prepared = await prepareImport({
      kind,
      filename: name,
      content,
      createdBy: staff.id,
    })
    if ('error' in prepared) return { error: prepared.error }

    jobId = prepared.jobId
    await audit(staff, 'import.start', 'ImportJob', jobId, null, {
      kind,
      filename: name,
      bytes: file.size,
      delimiter: prepared.delimiter,
      totalRows: prepared.totalRows,
      skippedEmpty: prepared.skippedEmpty,
      missingRequired: prepared.missingRequired,
    })
  } catch (error) {
    console.error('[admin] import.start', error)
    return { error: "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un CSV." }
  }

  revalidatePath('/admin/imports')
  // `redirect` lève : il reste hors du `try`, sinon il serait intercepté.
  redirect(`/admin/imports/${jobId}`)
}

/* -------------------------------------------------------------------------- */
/* Étape 1 bis — correspondance des colonnes                                  */
/* -------------------------------------------------------------------------- */

export async function saveMapping(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const staff = await requireStaff('imports.run')

  const jobId = readId(formData, 'jobId')
  if (!jobId) return { error: 'Import introuvable.' }

  try {
    const job = await prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) return { error: 'Import introuvable.' }

    const definition = IMPORT_DEFINITIONS[job.kind]
    if (!definition) return { error: "Format d'import inconnu." }

    // Un lot est peut-être en train de s'écrire avec l'ancienne correspondance :
    // la changer maintenant rendrait le rapport incompréhensible.
    if (job.status === 'RUNNING') {
      return { error: "L'écriture est en cours : la correspondance ne peut pas changer maintenant." }
    }

    const fieldKeys = new Set(definition.fields.map((field) => field.key))
    const mapping: Record<string, string> = {}
    let mapped = 0

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('col:')) continue
      const header = key.slice(4)
      const target = typeof value === 'string' ? value : ''
      // Une valeur inconnue est traitée comme « ignorer » : le formulaire est
      // un point d'entrée public, il peut porter n'importe quelle chaîne.
      if (fieldKeys.has(target)) {
        mapping[header] = target
        mapped += 1
      } else {
        mapping[header] = '__ignore__'
      }
    }

    if (Object.keys(mapping).length === 0) {
      return { error: 'Aucune colonne reçue : la correspondance est inchangée.' }
    }

    const before = job.columnMapping as Prisma.InputJsonValue
    await updateMapping(jobId, mapping)
    await audit(staff, 'import.mapping', 'ImportJob', jobId, before, mapping)

    revalidatePath(`/admin/imports/${jobId}`)
    revalidatePath('/admin/imports')

    const ignored = Object.keys(mapping).length - mapped
    return {
      jobId,
      notice: `Correspondance enregistrée : ${mapped} colonne${s(mapped)} associée${s(mapped)}, ${ignored} ignorée${s(ignored)}. L'import repasse en brouillon : relancez la validation.`,
    }
  } catch (error) {
    console.error('[admin] import.mapping', error)
    return { error: "La correspondance n'a pas pu être enregistrée." }
  }
}

/* -------------------------------------------------------------------------- */
/* Mode d'écriture                                                            */
/* -------------------------------------------------------------------------- */

export async function setWriteMode(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const staff = await requireStaff('imports.run')

  const jobId = readId(formData, 'jobId')
  if (!jobId) return { error: 'Import introuvable.' }

  const writeMode = readId(formData, 'writeMode') as WriteMode
  if (!WRITE_MODES.includes(writeMode)) {
    return { error: "Mode d'écriture inconnu." }
  }

  try {
    const job = await prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) return { error: 'Import introuvable.' }

    if (job.status === 'RUNNING') {
      return { error: "L'écriture est en cours : le mode ne peut pas changer maintenant." }
    }
    if (job.status === 'DONE') {
      return { error: 'Cet import est terminé : plus rien ne sera écrit.' }
    }
    if (job.writeMode === writeMode) {
      return { jobId, notice: "Ce mode d'écriture était déjà celui de l'import." }
    }

    await prisma.importJob.update({ where: { id: jobId }, data: { writeMode } })
    await audit(
      staff,
      'import.writeMode',
      'ImportJob',
      jobId,
      { writeMode: job.writeMode },
      { writeMode },
    )

    revalidatePath(`/admin/imports/${jobId}`)
    return { jobId, notice: "Mode d'écriture enregistré." }
  } catch (error) {
    console.error('[admin] import.writeMode', error)
    return { error: "Le mode d'écriture n'a pas pu être enregistré." }
  }
}

/* -------------------------------------------------------------------------- */
/* Étape 2 — prévisualisation                                                 */
/* -------------------------------------------------------------------------- */

export async function runPreview(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const staff = await requireStaff('imports.run')

  const jobId = readId(formData, 'jobId')
  if (!jobId) return { error: 'Import introuvable.' }

  try {
    const result = await previewImport(jobId)
    if ('error' in result) return { error: result.error }

    await audit(staff, 'import.preview', 'ImportJob', jobId, null, {
      valid: result.valid,
      errors: result.errors,
      duplicates: result.duplicates,
      warnings: result.warnings,
    })

    revalidatePath(`/admin/imports/${jobId}`)
    revalidatePath('/admin/imports')

    return {
      jobId,
      notice:
        `${result.valid} ligne${s(result.valid)} valide${s(result.valid)}, ` +
        `${result.errors} en erreur, ` +
        `${result.duplicates} doublon${s(result.duplicates)}, ` +
        `${result.warnings} avertissement${s(result.warnings)}. Rien n'a été écrit.`,
    }
  } catch (error) {
    console.error('[admin] import.preview', error)
    return { error: "Le fichier n'a pas pu être validé." }
  }
}

/* -------------------------------------------------------------------------- */
/* Étape 3 — écriture, un lot à la fois                                       */
/* -------------------------------------------------------------------------- */

export async function runChunk(_previous: ImportState, formData: FormData): Promise<ImportState> {
  const staff = await requireStaff('imports.run')

  const jobId = readId(formData, 'jobId')
  if (!jobId) return { error: 'Import introuvable.' }

  try {
    const result = await runImportChunk(jobId)
    if ('error' in result) return { error: result.error }

    await audit(staff, 'import.chunk', 'ImportJob', jobId, null, {
      done: result.done,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      cursor: result.cursor,
    })

    revalidatePath(`/admin/imports/${jobId}`)
    revalidatePath('/admin/imports')

    // Les compteurs sont ceux du moteur, pas une estimation : `processed` ne
    // compte que les lignes écrites, les erreurs et les doublons du fichier
    // n'étant jamais repris.
    const notice = result.done
      ? `Import terminé : ${result.created} créée${s(result.created)}, ${result.updated} mise${s(result.updated)} à jour, ${result.skipped} ignorée${s(result.skipped)}, ${result.errors} en erreur.`
      : `${result.processed} sur ${result.total} ligne${s(result.total)} traitée${s(result.total)}. Relancez pour le lot suivant.`

    return { jobId, notice }
  } catch (error) {
    console.error('[admin] import.chunk', error)
    return { error: "Le lot n'a pas pu être écrit. L'import reprendra au même endroit." }
  }
}
