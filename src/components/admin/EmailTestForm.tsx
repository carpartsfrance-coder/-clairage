'use client'

import { useActionState } from 'react'
import { sendTestEmail, type EmailState } from '@/lib/actions/admin-emails'
import type { TemplateKey } from '@/lib/email/templates'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

/**
 * Envoi de test d'un modèle.
 *
 * Composant client pour une seule raison : `useActionState`, qui affiche le
 * retour du serveur. Le modèle voyage en champ caché, et l'action le revalide
 * contre le catalogue : ce champ est une commodité d'interface, pas une
 * autorisation.
 *
 * Le message de retour est celui de l'action, mot pour mot, parce que c'est
 * lui qui dit si l'envoi a réellement eu lieu ou s'il a seulement été
 * journalisé.
 *
 * La couleur suit le même fait : un message seulement journalisé est rendu en
 * avertissement, pas en vert avec une coche. Un bandeau de réussite au-dessus
 * d'un texte qui dit « aucun envoi réel » se lit à l'envers — c'est l'icône
 * qu'on retient.
 */

const EMPTY: EmailState = {}

export function EmailTestForm({
  templateKey,
  defaultTo,
}: {
  templateKey: TemplateKey
  defaultTo: string
}) {
  const [state, formAction, pending] = useActionState(sendTestEmail, EMPTY)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone={state.simulated ? 'warn' : 'ok'} live="polite">
          {state.notice}
        </Alert>
      ) : null}

      <input type="hidden" name="template" value={templateKey} />

      <TextField
        id="test-destinataire"
        name="to"
        label="Destinataire"
        type="email"
        required
        defaultValue={defaultTo}
        fieldSize="sm"
        autoComplete="email"
        hint="Le message part avec le jeu d'exemple du modèle, pas avec des données réelles."
      />

      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Envoi…' : 'Envoyer un test'}
      </Button>
    </form>
  )
}
