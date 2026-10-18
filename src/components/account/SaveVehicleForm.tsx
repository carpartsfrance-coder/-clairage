'use client'

import { useActionState } from 'react'
import { saveCurrentVehicle, type AccountState } from '@/lib/actions/account'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { TextField } from '@/components/ui/Field'

/* --------------------------------------------------------------------------
   Enregistrement du véhicule sélectionné
   --------------------------------------------------------------------------
   Composant client pour `useActionState` uniquement. L'identifiant de
   configuration part dans un champ caché, mais l'action le revérifie en base
   (configuration existante et active) avant d'enregistrer quoi que ce soit.
   -------------------------------------------------------------------------- */

export function SaveVehicleForm({ configurationId }: { configurationId: string }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    saveCurrentVehicle,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="configurationId" value={configurationId} />

      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      {state.notice ? (
        <Alert tone="ok" live="polite">
          {state.notice}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="vehicule-nickname"
          name="nickname"
          label="Surnom"
          hint="Facultatif — « Voiture de Marie », « La moto »"
          maxLength={60}
        />
        <TextField
          id="vehicule-plate"
          name="plate"
          label="Plaque d'immatriculation"
          hint="Facultatif"
          autoComplete="off"
          maxLength={16}
        />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer ce véhicule'}
        </Button>
      </div>
    </form>
  )
}
