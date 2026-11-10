'use client'

import { useActionState } from 'react'
import { enregistrerPrefixeCommande, type ReglageState } from '@/lib/actions/admin-settings'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

const VIDE: ReglageState = {}

export function PrefixeCommandeForm({ valeur, modifiable }: { valeur: string; modifiable: boolean }) {
  const [state, action, pending] = useActionState(enregistrerPrefixeCommande, VIDE)
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <Alert tone="danger" live="assertive">{state.error}</Alert> : null}
      {state.notice ? <Alert tone="ok" live="polite">{state.notice}</Alert> : null}
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          id="prefixe-commande"
          name="prefix"
          label="Début des numéros de commande"
          defaultValue={valeur}
          fieldSize="sm"
          wrapperClassName="w-48"
          className="font-mono uppercase"
          disabled={!modifiable}
          hint={`Exemple : ${valeur}-${new Date().getFullYear()}-00012`}
        />
        {modifiable ? (
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
