'use client'

import { useActionState } from 'react'
import { lookupGuestOrder, type AccountState } from '@/lib/actions/account'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { TextField } from '@/components/ui/Field'

/* --------------------------------------------------------------------------
   Suivi d'une commande passée sans compte
   --------------------------------------------------------------------------
   En cas de succès, `lookupGuestOrder` redirige vers la page de confirmation :
   il n'y a donc aucun état de succès à gérer ici.

   Le message d'erreur de l'action est affiché TEL QUEL. Il est volontairement
   identique que la référence soit inconnue, que l'adresse e-mail ne corresponde
   pas, ou que les deux existent sans être associées. Distinguer ces cas
   transformerait ce formulaire en moyen de tester des références — elles sont
   séquentielles, donc devinables — et de savoir quelle adresse e-mail a
   commandé quoi. On n'ajoute donc aucune précision du genre « référence
   inconnue » ou « adresse ne correspondant pas ».
   -------------------------------------------------------------------------- */

export function TrackOrderForm() {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(lookupGuestOrder, {})

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        id="suivi-reference"
        name="reference"
        label="Référence de commande"
        hint="Elle figure sur votre e-mail de confirmation, au format CMD-2026-00001"
        fieldSize="lg"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
      />

      <TextField
        id="suivi-email"
        name="email"
        type="email"
        label="Adresse e-mail"
        hint="Celle utilisée lors de la commande"
        fieldSize="lg"
        autoComplete="email"
        required
      />

      <Button type="submit" block size="lg" disabled={pending} aria-busy={pending}>
        {pending ? 'Recherche…' : 'Voir ma commande'}
      </Button>
    </form>
  )
}
