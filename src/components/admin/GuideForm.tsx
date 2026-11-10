'use client'

import { useActionState } from 'react'
import { enregistrerGuide, type GuideState } from '@/lib/actions/admin-guides'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

export type GuideInitial = {
  id: string
  title: string
  slug: string
  summary: string
  body: string
  difficulty: string
  durationMinutes: string
  published: boolean
}

const VIDE: GuideState = {}

export function GuideForm({ initial, notice }: { initial?: GuideInitial; notice?: string }) {
  const [state, action, pending] = useActionState(enregistrerGuide, VIDE)
  const p = initial?.id ?? 'nouveau'
  const message = state.notice ?? (state.error ? undefined : notice)
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger" live="assertive">{state.error}</Alert> : null}
      {message ? <Alert tone="ok" live="polite">{message}</Alert> : null}
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`${p}-titre`} name="title" label="Titre" required fieldSize="sm" defaultValue={initial?.title}
          placeholder="Changer les veilleuses d’une Clio 4" wrapperClassName="sm:col-span-2" />
        <TextField id={`${p}-slug`} name="slug" label="Adresse (facultatif)" fieldSize="sm" defaultValue={initial?.slug}
          hint="Vide = faite à partir du titre." className="font-mono" />
      </div>
      <TextField id={`${p}-resume`} name="summary" label="Résumé (facultatif)" fieldSize="sm" defaultValue={initial?.summary}
        hint="Une phrase, affichée dans la liste des guides et dans Google." />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${p}-texte`} className="text-xs font-bold">Le guide</label>
        <textarea id={`${p}-texte`} name="body" required rows={14} defaultValue={initial?.body}
          className="rounded-sm border border-[#d4d4d4] p-2 text-sm"
          placeholder={'## Ce qu’il faut\nUn tournevis plat…\n\n## Étape 1 — Ouvrir le capot\n…'} />
        <p className="text-[10px] text-muted-strong">
          « ## Titre » pour un intertitre, **gras** entre deux étoiles, une ligne vide pour changer de paragraphe.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField id={`${p}-diff`} name="difficulty" label="Difficulté" fieldSize="sm" defaultValue={initial?.difficulty ?? 'EASY'}>
          <option value="EASY">Facile</option>
          <option value="MEDIUM">Moyen</option>
          <option value="HARD">Difficile</option>
          <option value="UNKNOWN">Non précisée</option>
        </SelectField>
        <TextField id={`${p}-duree`} name="durationMinutes" label="Durée (minutes)" inputMode="numeric" fieldSize="sm"
          defaultValue={initial?.durationMinutes} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={initial?.published ?? false} /> En ligne
        </label>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer le guide'}
        </Button>
      </div>
    </form>
  )
}
