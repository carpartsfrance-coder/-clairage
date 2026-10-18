'use client'

import { useActionState } from 'react'
import { requestPasswordReset, resetPassword } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

/* --------------------------------------------------------------------------
   Récupération d'accès — formulaires
   --------------------------------------------------------------------------
   Ces deux formulaires sont client pour une seule raison : useActionState.
   Aucune décision n'est prise ici. Les actions serveur renvoient des messages
   déjà neutralisés ; on les affiche tels quels, sans les compléter ni les
   reformuler. Toute phrase ajoutée autour risquerait de distinguer le cas
   « cette adresse a un compte » du cas contraire, ce que les actions se
   donnent précisément pour règle de ne jamais laisser voir.
   -------------------------------------------------------------------------- */

/** Demande d'un lien de réinitialisation. */
export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {})

  // Succès = l'action a renvoyé son message neutre. On masque alors le champ :
  // le laisser en place inviterait à enchaîner les adresses pour voir laquelle
  // déclenche un envoi, c'est-à-dire à sonder la base des comptes.
  const submitted = Boolean(state.notice)

  return (
    <div className="flex flex-col gap-4">
      {state.notice ? (
        <Alert tone="info" live="polite">
          {state.notice}
        </Alert>
      ) : null}

      {/* Seul échec possible ici : la limite de fréquence. */}
      {state.error ? (
        <Alert tone="danger" live="polite">
          {state.error}
        </Alert>
      ) : null}

      {submitted ? null : (
        <form action={formAction} className="flex flex-col gap-5">
          <TextField
            id="recuperation-email"
            name="email"
            label="Adresse e-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="vous@exemple.fr"
            required
          />
          <Button type="submit" size="lg" block disabled={pending}>
            {pending ? 'Envoi en cours…' : 'Recevoir le lien'}
          </Button>
        </form>
      )}
    </div>
  )
}

/** Choix du nouveau mot de passe, à l'ouverture du lien reçu par e-mail. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {})

  // Quand l'action attache l'erreur au champ (mot de passe trop court, par
  // exemple), le champ l'affiche déjà : répéter le même texte dans un encart
  // au-dessus n'ajoute rien.
  const fieldError = state.fieldErrors?.password
  const globalError = state.error && !fieldError ? state.error : null

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Le jeton vient de l'URL du lien reçu par e-mail ; il n'est ni affiché
          ni réécrit dans l'adresse de la page après envoi. */}
      <input type="hidden" name="token" value={token} />

      {globalError ? (
        <Alert tone="danger" live="assertive">
          {globalError}
        </Alert>
      ) : null}

      <TextField
        id="nouveau-mot-de-passe"
        name="password"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        minLength={12}
        hint="12 caractères minimum"
        error={fieldError}
        required
      />

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? 'Enregistrement…' : 'Définir le nouveau mot de passe'}
      </Button>
    </form>
  )
}
