import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStaffUser, requireStaff } from '@/lib/admin/guard'
import { prisma } from '@/lib/db'
import { IMPORT_DEFINITIONS, missingRequiredFields } from '@/lib/imports/definitions'
import { getImportReport } from '@/lib/imports/runner'
import { runChunk, runPreview } from '@/lib/actions/admin-imports'
import { ActionForm, MappingForm, WriteModeForm } from '@/components/admin/ImportForms'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Alert, Card } from '@/components/ui/Surface'

/**
 * Déroulé d'un import.
 *
 * L'écran suit les quatre temps du moteur : correspondance, validation,
 * écriture par lots, rapport. Deux choses y sont dites noir sur blanc, parce
 * qu'elles décident de la confiance qu'on peut accorder au reste :
 *
 *   - rien n'est écrit avant que l'écriture ait été lancée, explicitement ;
 *   - le message de chaque ligne est affiché en entier. C'est la valeur la plus
 *     utile de la page : « 412 lignes mises à jour » ne permet de rien
 *     vérifier, « prix 9,90 → 12,50 » si. Un motif tronqué ne sert à rien.
 */

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  VALIDATING: 'Validation',
  PREVIEW: 'Prévisualisé',
  RUNNING: 'En cours',
  PAUSED: 'En pause',
  DONE: 'Terminé',
  FAILED: 'Échoué',
}

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  VALIDATING: 'neutral',
  PREVIEW: 'info',
  RUNNING: 'info',
  PAUSED: 'warn',
  DONE: 'ok',
  FAILED: 'danger',
}

const WRITE_MODE_LABELS: Record<string, string> = {
  upsert: 'Créer et mettre à jour',
  create_only: 'Créer seulement',
  update_only: 'Mettre à jour seulement',
}

/** Verdict d'une ligne. L'état est écrit, la couleur seule ne dit rien. */
const OUTCOME_COPY: Record<string, { label: string; tone: BadgeTone }> = {
  created: { label: 'Créée', tone: 'ok' },
  updated: { label: 'Mise à jour', tone: 'ok' },
  skipped: { label: 'Ignorée', tone: 'neutral' },
  duplicate: { label: 'Doublon', tone: 'warn' },
  error: { label: 'Erreur', tone: 'danger' },
  ready: { label: 'À écrire', tone: 'neutral' },
  pending: { label: 'En attente', tone: 'neutral' },
}

/** Ordre d'affichage des compteurs : ce qui a été écrit, puis ce qui coince. */
const OUTCOME_ORDER = ['created', 'updated', 'ready', 'pending', 'skipped', 'duplicate', 'error']

const STEPS = ['Correspondance', 'Prévisualisation', 'Écriture', 'Rapport']

/**
 * Étape courante déduite du statut. `PAUSED` est une écriture interrompue,
 * `FAILED` se lit dans le rapport : les deux cas que le moteur peut produire
 * en dehors du déroulé nominal.
 */
const STEP_BY_STATUS: Record<string, number> = {
  DRAFT: 1,
  VALIDATING: 2,
  PREVIEW: 2,
  RUNNING: 3,
  PAUSED: 3,
  DONE: 4,
  FAILED: 4,
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

const h2Class = 'text-base font-bold'
const thClass = 'px-3 py-2 text-left font-semibold'

/* -------------------------------------------------------------------------- */
/* Métadonnées                                                                */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>
}): Promise<Metadata> {
  const { jobId } = await params
  // `getStaffUser` et non `requireStaff` : rediriger depuis les métadonnées
  // n'aurait pas de sens, c'est la page qui garde la porte.
  const staff = await getStaffUser()
  const job = staff
    ? await prisma.importJob.findUnique({ where: { id: jobId }, select: { filename: true } })
    : null
  return {
    title: job ? `Import ${job.filename}` : 'Import',
    robots: { index: false, follow: false },
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function AdminImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>
  searchParams: Promise<{ filtre?: string }>
}) {
  await requireStaff('imports.run')

  const { jobId } = await params
  const { filtre } = await searchParams
  // Le filtre vient de l'URL : on ne garde que les verdicts connus, sinon la
  // liste se viderait sans que personne comprenne pourquoi.
  const outcome = filtre && OUTCOME_COPY[filtre] ? filtre : undefined

  const report = await getImportReport(jobId, outcome)
  if (!report) notFound()

  const { job, rows, counts } = report
  const definition = IMPORT_DEFINITIONS[job.kind]
  const mapping = (job.columnMapping ?? {}) as Record<string, string>
  const headers = Object.keys(mapping)
  const missing = definition ? missingRequiredFields(mapping, definition) : []

  const step = STEP_BY_STATUS[job.status] ?? 1
  const isDraft = job.status === 'DRAFT'
  const canWrite = job.status === 'PREVIEW' || job.status === 'RUNNING' || job.status === 'PAUSED'

  const summary = job.summary as {
    valid?: number
    errors?: number
    duplicates?: number
    warnings?: number
  } | null

  const countEntries = [
    ...OUTCOME_ORDER.filter((key) => counts[key] !== undefined),
    ...Object.keys(counts).filter((key) => !OUTCOME_ORDER.includes(key)),
  ]

  // La correspondance reste consultable après coup, mais repliée : une fois le
  // fichier validé, ce n'est plus là que se joue la lecture de l'écran.
  const mappingBlock = definition ? (
    <div className="flex flex-col gap-3">
      {missing.length > 0 ? (
        <Alert tone="warn" title="Colonnes obligatoires non associées">
          {missing.map((field) => field.label).join(', ')}. La validation refusera le fichier tant
          qu&apos;elles ne sont pas associées à une colonne.
        </Alert>
      ) : null}

      <MappingForm job={job} headers={headers} mapping={mapping} definition={definition} />

      <p className="text-xs text-muted">
        Les champs suivis d&apos;une étoile sont obligatoires. Une colonne laissée sur
        « (ignorer) » n&apos;est pas lue. Enregistrer une correspondance remet l&apos;import en
        brouillon : il faut relancer la validation.
      </p>
    </div>
  ) : (
    <Alert tone="warn" title="Format non décrit">
      Le format <span className="font-semibold">{job.kind}</span> n&apos;est pas décrit dans cette
      version du back-office : ni la correspondance ni la validation ne peuvent être relancées
      depuis cet écran.
    </Alert>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- En-tête ---------------- */}
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/imports"
          className="inline-flex h-9 items-center text-sm font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
        >
          Retour aux imports
        </Link>
        <h1 className="text-xl font-extrabold break-all">Import — {job.filename}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={STATUS_TONES[job.status] ?? 'neutral'}>
            {STATUS_LABELS[job.status] ?? job.status}
          </Badge>
          <span>{definition?.label ?? job.kind}</span>
          <span aria-hidden>·</span>
          <span>{WRITE_MODE_LABELS[job.writeMode] ?? job.writeMode}</span>
          <span aria-hidden>·</span>
          <span>déposé le {dateFormatter.format(job.createdAt)}</span>
        </div>
      </header>

      {/* ---------------- Fil des étapes ---------------- */}
      <nav aria-label="Étapes de l’import">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {STEPS.map((label, index) => {
            const number = index + 1
            const current = number === step
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={
                    current
                      ? 'font-bold text-brand'
                      : number < step
                        ? 'text-muted-strong'
                        : 'text-muted'
                  }
                >
                  {number}. {label}
                  {current ? <span className="sr-only"> — étape en cours</span> : null}
                </span>
                {number < STEPS.length ? (
                  <span aria-hidden className="text-line-strong">
                    ·
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* ---------------- 1. Correspondance ---------------- */}
      <section aria-labelledby="titre-correspondance">
        <h2 id="titre-correspondance" className={h2Class}>
          1. Correspondance des colonnes
        </h2>

        {isDraft ? (
          <div className="mt-3">{mappingBlock}</div>
        ) : (
          <details className="mt-3 rounded-md border border-line bg-white px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-ink">
              Voir et corriger la correspondance ({headers.length} colonne
              {headers.length > 1 ? 's' : ''} dans le fichier)
            </summary>
            <div className="mt-3">{mappingBlock}</div>
          </details>
        )}
      </section>

      {/* ---------------- 2. Prévisualisation ---------------- */}
      {definition ? (
        <section aria-labelledby="titre-previsualisation">
          <h2 id="titre-previsualisation" className={h2Class}>
            2. Prévisualisation
          </h2>

          <div className="mt-3 flex flex-col gap-4">
            <WriteModeForm jobId={job.id} current={job.writeMode} />
            <ActionForm action={runPreview} label="Valider le fichier" jobId={job.id} />

            {summary ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Card className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-muted-strong">Lignes valides</p>
                  <p className="mt-1 text-2xl leading-tight font-extrabold tabular-nums">
                    {summary.valid ?? 0}
                  </p>
                </Card>
                <Card className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-muted-strong">Erreurs</p>
                  <p className="mt-1 text-2xl leading-tight font-extrabold text-danger tabular-nums">
                    {summary.errors ?? 0}
                  </p>
                </Card>
                <Card className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-muted-strong">Doublons</p>
                  <p className="mt-1 text-2xl leading-tight font-extrabold text-warn tabular-nums">
                    {summary.duplicates ?? 0}
                  </p>
                </Card>
                <Card className="px-3 py-2.5">
                  <p className="text-xs font-semibold text-muted-strong">Avertissements</p>
                  <p className="mt-1 text-2xl leading-tight font-extrabold text-warn tabular-nums">
                    {summary.warnings ?? 0}
                  </p>
                </Card>
              </div>
            ) : null}

            <p className="text-xs text-muted">
              La validation relit tout le fichier et pose un verdict sur chaque ligne. Rien
              n&apos;est écrit tant que l&apos;écriture n&apos;a pas été lancée à l&apos;étape
              suivante. Les doublons sont cherchés à l&apos;intérieur du fichier : la première
              ligne passe, les suivantes sont signalées.
            </p>
          </div>
        </section>
      ) : null}

      {/* ---------------- 3. Écriture ---------------- */}
      {canWrite ? (
        <section aria-labelledby="titre-ecriture">
          <h2 id="titre-ecriture" className={h2Class}>
            3. Écriture
          </h2>

          <div className="mt-3 flex flex-col gap-3">
            <ActionForm action={runChunk} label="Écrire le prochain lot" jobId={job.id} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="import-progression" className="text-xs font-semibold text-muted-strong">
                Avancement : {job.processedRows} sur {job.totalRows} lignes traitées
              </label>
              <progress
                id="import-progression"
                max={Math.max(job.totalRows, 1)}
                value={job.processedRows}
                className="h-2 w-full max-w-md overflow-hidden rounded-xs border border-line bg-surface-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-brand"
              />
            </div>

            <p className="text-xs text-muted">
              L&apos;import s&apos;écrit par lots de 50 lignes. Le curseur est enregistré après
              chaque lot : on peut s&apos;arrêter et reprendre plus tard, l&apos;écriture repart où
              elle en était au lieu de tout rejouer. Les lignes en erreur et les doublons ne sont
              jamais repris, le compteur peut donc s&apos;arrêter sous le total du fichier.
            </p>
          </div>
        </section>
      ) : null}

      {/* ---------------- 4. Rapport ---------------- */}
      <section aria-labelledby="titre-rapport">
        <h2 id="titre-rapport" className={h2Class}>
          4. Rapport
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/admin/imports/${job.id}`}
            aria-current={outcome ? undefined : 'page'}
            className={
              outcome
                ? 'inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink'
                : 'inline-flex h-9 items-center rounded-sm border border-slate-ink bg-surface-muted px-3 font-semibold'
            }
          >
            Tout ({job.totalRows})
          </Link>
          {countEntries.map((key) => {
            const copy = OUTCOME_COPY[key]
            const active = outcome === key
            return (
              <Link
                key={key}
                href={`/admin/imports/${job.id}?filtre=${encodeURIComponent(key)}`}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'inline-flex h-9 items-center rounded-sm border border-slate-ink bg-surface-muted px-3 font-semibold'
                    : 'inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink'
                }
              >
                {copy?.label ?? key} ({counts[key]})
              </Link>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-strong">
            {outcome
              ? 'Aucune ligne ne porte ce verdict.'
              : "Aucune ligne enregistrée pour cet import."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead className="bg-surface-soft text-xs text-muted-strong">
                <tr>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Ligne
                  </th>
                  <th scope="col" className={thClass}>
                    Résultat
                  </th>
                  <th scope="col" className={thClass}>
                    Message
                  </th>
                  <th scope="col" className={thClass}>
                    Identifiant cible
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const copy = OUTCOME_COPY[row.outcome]
                  return (
                    <tr key={row.id} className="border-t border-line align-top">
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={copy?.tone ?? 'neutral'}>{copy?.label ?? row.outcome}</Badge>
                      </td>
                      {/* Le motif en entier : tronqué, il ne sert plus à rien. */}
                      <td className="px-3 py-2 break-words whitespace-pre-wrap text-muted-strong">
                        {row.message ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2 break-all text-muted">
                        {row.targetId ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-muted">
          L&apos;affichage est limité à 500 lignes. Au-delà, filtrez par résultat pour retrouver
          les lignes qui vous intéressent — les erreurs d&apos;abord.
        </p>
      </section>
    </div>
  )
}
