'use client'

import { useActionState } from 'react'
import { changePassword, updateProfile, type AuthState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { TextField } from '@/components/ui/Field'

/**
 * Formulaires du profil.
 *
 * Client uniquement pour `useActionState` : il faut rendre le message renvoyé
 * par l'action et l'état d'envoi. Tout le reste — lecture, validation,
 * vérification du mot de passe actuel, révocation des sessions — se passe côté
 * serveur, dans `lib/actions/auth.ts`.
 *
 * Les messages des actions sont affichés tels quels. Ils sont écrits pour ne
 * rien révéler de plus que nécessaire, et les reformuler ici ferait diverger la
 * page de ce que l'action a réellement fait.
 */

/* -------------------------------------------------------------------------- */
/* Informations personnelles                                                  */
/* -------------------------------------------------------------------------- */

export function ProfileForm({
  defaults,
}: {
  defaults: { firstName: string | null; lastName: string | null; phone: string | null }
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updateProfile, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.notice ? (
        <Alert tone="ok" live="polite">
          {state.notice}
        </Alert>
      ) : null}
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="profil-firstName"
          name="firstName"
          label="Prénom"
          hint="Facultatif"
          defaultValue={defaults.firstName ?? ''}
          autoComplete="given-name"
          maxLength={80}
          error={state.fieldErrors?.firstName}
        />
        <TextField
          id="profil-lastName"
          name="lastName"
          label="Nom"
          hint="Facultatif"
          defaultValue={defaults.lastName ?? ''}
          autoComplete="family-name"
          maxLength={80}
          error={state.fieldErrors?.lastName}
        />
      </div>

      <TextField
        id="profil-phone"
        name="phone"
        type="tel"
        label="Téléphone"
        hint="Facultatif — le transporteur utilise le numéro de l'adresse de livraison"
        defaultValue={defaults.phone ?? ''}
        autoComplete="tel"
        inputMode="tel"
        maxLength={32}
        error={state.fieldErrors?.phone}
        wrapperClassName="sm:max-w-xs"
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Mot de passe                                                               */
/* -------------------------------------------------------------------------- */

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(changePassword, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.notice ? (
        <Alert tone="ok" live="polite">
          {state.notice}
        </Alert>
      ) : null}
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        id="profil-password-current"
        name="current"
        type="password"
        label="Mot de passe actuel"
        required
        autoComplete="current-password"
        error={state.fieldErrors?.current}
        wrapperClassName="sm:max-w-sm"
      />

      <TextField
        id="profil-password-next"
        name="next"
        type="password"
        label="Nouveau mot de passe"
        hint="12 caractères minimum"
        required
        autoComplete="new-password"
        error={state.fieldErrors?.next}
        wrapperClassName="sm:max-w-sm"
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Modification…' : 'Modifier le mot de passe'}
        </Button>
      </div>
    </form>
  )
}
