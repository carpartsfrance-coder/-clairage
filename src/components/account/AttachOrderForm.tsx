'use client'

import { useActionState } from 'react'
import { attachGuestOrder, type AccountState } from '@/lib/actions/account'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

/**
 * Rattachement d'une commande invité.
 *
 * Composant client pour une seule raison : `useActionState`, qui porte le
 * message renvoyé par l'action. Rien n'est vérifié ici — la référence et
 * l'adresse sont contrôlées côté serveur, où la fréquence est aussi limitée.
 *
 * Les messages de l'action sont affichés tels quels : ils sont volontairement
 * identiques selon que la commande existe ou non, et toute précision ajoutée
 * ici permettrait de tester des références.
 */
export function AttachOrderForm() {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(attachGuestOrder, {})

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? <Alert tone="ok">{state.notice}</Alert> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <TextField
          id="attach-reference"
          name="reference"
          label="Référence de la commande"
          autoComplete="off"
          required
          wrapperClassName="sm:flex-1"
        />
        <TextField
          id="attach-email"
          name="email"
          type="email"
          label="Adresse e-mail de la commande"
          autoComplete="email"
          required
          wrapperClassName="sm:flex-1"
        />
      </div>

      <Button type="submit" variant="secondary" disabled={pending} className="sm:self-start">
        {pending ? 'Vérification…' : 'Rattacher à mon compte'}
      </Button>
    </form>
  )
}
