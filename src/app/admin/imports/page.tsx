import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { IMPORT_DEFINITIONS, IMPORT_KINDS, sampleCsv } from '@/lib/imports/definitions'
import { listImportJobs } from '@/lib/imports/runner'
import { StartImportForm } from '@/components/admin/ImportForms'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Surface'

/**
 * Imports — accueil.
 *
 * Trois choses, dans cet ordre : déposer un fichier, savoir ce qu'on a le droit
 * d'y mettre, et retrouver ce qui a déjà été passé. La documentation des
 * formats est générée depuis `IMPORT_DEFINITIONS`, celle-là même qui sert à la
 * correspondance et à la validation : un écran qui recopierait les colonnes à
 * la main finirait par mentir.
 */

export const metadata: Metadata = {
  title: 'Imports',
  robots: { index: false, follow: false },
}

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

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

const h2Class = 'text-base font-bold'
const thClass = 'px-3 py-2 text-left font-semibold'
const thNumClass = 'px-3 py-2 text-right font-semibold'

export default async function AdminImportsPage() {
  await requireStaff('imports.run')
  const jobs = await listImportJobs()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold">Imports</h1>
        <p className="text-xs text-muted">
          Un import se déroule en quatre temps : correspondance des colonnes, validation,
          écriture par lots, rapport ligne par ligne.
        </p>
      </header>

      {/* ---------------- Nouvel import ---------------- */}
      <section aria-labelledby="titre-nouvel-import">
        <h2 id="titre-nouvel-import" className={h2Class}>
          Nouvel import
        </h2>
        <div className="mt-3">
          <StartImportForm />
        </div>
      </section>

      {/* ---------------- Formats acceptés ---------------- */}
      <section aria-labelledby="titre-formats">
        <h2 id="titre-formats" className={h2Class}>
          Formats acceptés
        </h2>

        <div className="mt-3 flex flex-col gap-2">
          {IMPORT_KINDS.map((key) => {
            const definition = IMPORT_DEFINITIONS[key]
            return (
              <details key={key} className="rounded-md border border-line bg-white px-3 py-2.5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-ink">
                  {definition.label}
                </summary>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="text-sm text-muted-strong">
                    <p>{definition.description}</p>
                    <p className="mt-1 text-xs text-muted">
                      Une ligne = {definition.rowMeaning}.
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-md border border-line">
                    <table className="w-full min-w-[48rem] border-collapse text-sm">
                      <thead className="bg-surface-soft text-xs text-muted-strong">
                        <tr>
                          <th scope="col" className={thClass}>
                            Colonne
                          </th>
                          <th scope="col" className={thClass}>
                            Obligatoire
                          </th>
                          <th scope="col" className={thClass}>
                            Exemple
                          </th>
                          <th scope="col" className={thClass}>
                            Précision
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {definition.fields.map((field) => (
                          <tr key={field.key} className="border-t border-line align-top">
                            <td className="px-3 py-2 font-semibold text-slate-ink">
                              {field.label}
                            </td>
                            <td className="px-3 py-2">
                              {field.required ? (
                                <Badge tone="warn">obligatoire</Badge>
                              ) : (
                                <span className="text-muted">facultative</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-strong">{field.example}</td>
                            <td className="px-3 py-2 text-muted-strong">
                              {field.help ?? <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-strong">Exemple de fichier</p>
                    <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-surface-soft px-3 py-2 text-xs text-slate-ink">
                      {sampleCsv(definition)}
                    </pre>
                    <p className="mt-1 text-xs text-muted">
                      Le séparateur attendu est le point-virgule ; la virgule et la tabulation sont
                      reconnues aussi. Les colonnes sont reconnues par leur intitulé, et la
                      correspondance reste corrigeable à la main avant toute écriture.
                    </p>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      </section>

      {/* ---------------- Historique ---------------- */}
      <section aria-labelledby="titre-historique">
        <h2 id="titre-historique" className={h2Class}>
          Historique
        </h2>

        {jobs.length === 0 ? (
          <EmptyState
            className="mt-3"
            title="Aucun import"
            description="Les fichiers déposés apparaîtront ici, avec leur rapport ligne par ligne."
          />
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
              <thead className="bg-surface-soft text-xs text-muted-strong">
                <tr>
                  <th scope="col" className={thClass}>
                    Fichier
                  </th>
                  <th scope="col" className={thClass}>
                    Format
                  </th>
                  <th scope="col" className={thClass}>
                    Statut
                  </th>
                  <th scope="col" className={thNumClass}>
                    Lignes
                  </th>
                  <th scope="col" className={thNumClass}>
                    Créées
                  </th>
                  <th scope="col" className={thNumClass}>
                    Mises à jour
                  </th>
                  <th scope="col" className={thNumClass}>
                    Ignorées
                  </th>
                  <th scope="col" className={thNumClass}>
                    Erreurs
                  </th>
                  <th scope="col" className={thClass}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-line align-middle">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/imports/${job.id}`}
                        className="inline-flex min-h-9 items-center font-semibold break-all text-slate-ink underline-offset-4 hover:text-brand hover:underline"
                      >
                        {job.filename}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-strong">
                      {IMPORT_DEFINITIONS[job.kind]?.label ?? job.kind}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[job.status] ?? 'neutral'}>
                        {STATUS_LABELS[job.status] ?? job.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {job.processedRows} / {job.totalRows}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{job.createdRows}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{job.updatedRows}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{job.skippedRows}</td>
                    <td
                      className={
                        job.errorRows > 0
                          ? 'px-3 py-2 text-right font-semibold text-danger tabular-nums'
                          : 'px-3 py-2 text-right tabular-nums'
                      }
                    >
                      {job.errorRows}
                    </td>
                    <td className="px-3 py-2 text-muted-strong">
                      {dateFormatter.format(job.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {jobs.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            La colonne « Lignes » compte les lignes écrites sur le total du fichier : les lignes en
            erreur et les doublons ne sont jamais repris, le compteur peut donc s&apos;arrêter sous
            le total.
          </p>
        ) : null}
      </section>
    </div>
  )
}
