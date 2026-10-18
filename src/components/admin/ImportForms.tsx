'use client'

import { useActionState, useState } from 'react'
import {
  saveMapping,
  setWriteMode,
  startImport,
  type ImportState,
} from '@/lib/actions/admin-imports'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import {
  IMPORT_DEFINITIONS,
  IMPORT_KINDS,
  type ImportDefinition,
} from '@/lib/imports/definitions'

/* --------------------------------------------------------------------------
   Formulaires d'import
   --------------------------------------------------------------------------
   Composants client pour une seule raison : `useActionState`, qui affiche le
   retour du serveur. Le choix du format garde un état local, parce que la
   description affichée doit suivre le select avant tout envoi.

   Rien n'est décidé ici. La lecture du fichier, la validation, les droits et
   l'écriture appartiennent à `lib/actions/admin-imports` et au moteur
   d'import : masquer un bouton ne protège rien.
   -------------------------------------------------------------------------- */

const EMPTY: ImportState = {}

/** Retour de l'action : une erreur interrompt, un succès se constate. */
function Feedback({ state }: { state: ImportState }) {
  return (
    <>
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? <Alert tone="ok">{state.notice}</Alert> : null}
    </>
  )
}

const formClass = 'flex flex-col gap-3'

/* -------------------------------------------------------------------------- */
/* Dépôt d'un fichier                                                         */
/* -------------------------------------------------------------------------- */

export function StartImportForm() {
  const [state, formAction, pending] = useActionState(startImport, EMPTY)
  // Le format choisi est gardé ici : sa description et le sens d'une ligne
  // doivent être lisibles avant d'envoyer quoi que ce soit.
  const [kind, setKind] = useState<string>(IMPORT_KINDS[0] ?? '')
  const definition: ImportDefinition | undefined = IMPORT_DEFINITIONS[kind]

  // Ni `method` ni `encType` sur le formulaire : React les pose lui-même quand
  // l'action est une fonction, et les indiquer déclenche un avertissement sans
  // rien changer à l'envoi du fichier.
  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />

      <SelectField
        id="import-kind"
        name="kind"
        label="Format du fichier"
        fieldSize="sm"
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        wrapperClassName="sm:w-80"
      >
        {IMPORT_KINDS.map((key) => (
          <option key={key} value={key}>
            {IMPORT_DEFINITIONS[key].label}
          </option>
        ))}
      </SelectField>

      {definition ? (
        <div className="text-sm text-muted-strong">
          <p>{definition.description}</p>
          <p className="mt-1 text-xs text-muted">
            Une ligne = {definition.rowMeaning}.
          </p>
        </div>
      ) : null}

      {definition?.caution ? <Alert tone="warn">{definition.caution}</Alert> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-file" className="text-sm font-semibold">
          Fichier
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".csv,.txt"
          required
          className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-sm text-slate-ink file:mr-3 file:rounded-sm file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-ink hover:border-muted sm:w-80"
        />
        <p className="text-xs text-muted">
          CSV ou TXT, 5 Mo au maximum. Le fichier est lu et ses colonnes reconnues ; la validation
          ligne par ligne est l&apos;étape suivante, et aucune écriture n&apos;a lieu avant de
          l&apos;avoir demandée.
        </p>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Analyse…' : 'Analyser le fichier'}
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Correspondance des colonnes                                                */
/* -------------------------------------------------------------------------- */

export function MappingForm({
  job,
  headers,
  mapping,
  definition,
}: {
  job: { id: string }
  /** Entêtes du fichier, dans leur graphie d'origine. */
  headers: string[]
  mapping: Record<string, string>
  definition: ImportDefinition
}) {
  const [state, formAction, pending] = useActionState(saveMapping, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="jobId" value={job.id} />

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead className="bg-surface-soft text-xs text-muted-strong">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Colonne du fichier
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Champ LUMERA
              </th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, index) => (
              <tr key={header} className="border-t border-line align-middle">
                <td className="px-3 py-2 font-semibold break-words text-slate-ink">{header}</td>
                <td className="px-3 py-2">
                  <SelectField
                    id={`col-${index}`}
                    name={`col:${header}`}
                    label={`Champ associé à la colonne « ${header} »`}
                    hideLabel
                    fieldSize="sm"
                    defaultValue={mapping[header] ?? '__ignore__'}
                    wrapperClassName="sm:w-72"
                  >
                    <option value="__ignore__">(ignorer)</option>
                    {definition.fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </option>
                    ))}
                  </SelectField>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer la correspondance'}
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Action simple sur un import                                                */
/* -------------------------------------------------------------------------- */

export function ActionForm({
  action,
  label,
  jobId,
  variant = 'primary',
}: {
  action: (previous: ImportState, formData: FormData) => Promise<ImportState>
  label: string
  jobId: string
  variant?: ButtonVariant
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? 'Traitement…' : label}
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Mode d'écriture                                                            */
/* -------------------------------------------------------------------------- */

export function WriteModeForm({ jobId, current }: { jobId: string; current: string }) {
  const [state, formAction, pending] = useActionState(setWriteMode, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="jobId" value={jobId} />

      <SelectField
        id="import-write-mode"
        name="writeMode"
        label="Mode d'écriture"
        fieldSize="sm"
        defaultValue={current}
        wrapperClassName="sm:w-96"
      >
        <option value="upsert">Créer et mettre à jour</option>
        <option value="create_only">Créer seulement (ne touche pas à l&apos;existant)</option>
        <option value="update_only">Mettre à jour seulement (ne crée rien)</option>
      </SelectField>

      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  )
}
