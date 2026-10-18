'use client'

import { useActionState, useId, useState } from 'react'
import {
  removeMedia,
  updateMedia,
  uploadMedia,
  type MediaState,
} from '@/lib/actions/admin-media'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { NATURE_NOTES, NATURE_OPTIONS } from '@/lib/media-nature'

/**
 * Formulaires de la médiathèque.
 *
 * Composants client pour `useActionState` uniquement : c'est le retour du
 * serveur qui porte l'information utile (ce qui a été écrit, ce qui a été
 * refusé et pourquoi), et il doit s'afficher à côté du formulaire concerné.
 */

const EMPTY: MediaState = {}

export function MediaUploadForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(uploadMedia, EMPTY)
  const [nature, setNature] = useState<string>('PRODUCT_PHOTO')
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '')

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? (
        // Un média sans texte alternatif est enregistré mais incomplet : le
        // ton suit ce fait plutôt que d'afficher une coche verte.
        <Alert tone={state.notice.includes('alternatif') ? 'warn' : 'ok'} live="polite">
          {state.notice}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${prefix}-fichier`} className="text-sm font-semibold">
          Fichier
        </label>
        <input
          id={`${prefix}-fichier`}
          name="file"
          type="file"
          required
          disabled={disabled}
          accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml,application/pdf"
          aria-describedby={`${prefix}-fichier-aide`}
          className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold disabled:bg-surface-muted disabled:text-muted"
        />
        <p id={`${prefix}-fichier-aide`} className="text-xs text-muted">
          JPEG, PNG, WebP, AVIF, SVG ou PDF. 8 Mo au maximum. Le type est vérifié sur le contenu du
          fichier, pas sur son extension.
        </p>
      </div>

      <SelectField
        id={`${prefix}-nature`}
        name="nature"
        label="Nature du visuel"
        fieldSize="sm"
        value={nature}
        onChange={(event) => setNature(event.target.value)}
        disabled={disabled}
        hint={NATURE_NOTES[nature]}
      >
        {NATURE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <TextField
        id={`${prefix}-alt`}
        name="alt"
        label="Texte alternatif"
        fieldSize="sm"
        disabled={disabled}
        maxLength={300}
        placeholder="Ampoule H7 vue de côté, culot métallique visible"
        hint="Ce que montre l’image, pour qui ne la voit pas. Laissé vide, le média est enregistré mais signalé comme incomplet."
      />

      <TextField
        id={`${prefix}-legende`}
        name="caption"
        label="Légende (facultative)"
        fieldSize="sm"
        disabled={disabled}
        maxLength={300}
        hint="Affichée sous l’image lorsque la fiche en prévoit une."
      />

      <Button type="submit" size="sm" disabled={pending || disabled}>
        {pending ? 'Téléversement…' : 'Téléverser'}
      </Button>
    </form>
  )
}

/** Édition en place : nature, texte alternatif, légende. */
export function MediaEditForm({
  media,
}: {
  media: { id: string; alt: string | null; caption: string | null; nature: string }
}) {
  const [state, formAction, pending] = useActionState(updateMedia, EMPTY)
  const [nature, setNature] = useState(media.nature)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={media.id} />

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

      <SelectField
        id={`nature-${media.id}`}
        name="nature"
        label="Nature"
        fieldSize="sm"
        value={nature}
        onChange={(event) => setNature(event.target.value)}
      >
        {NATURE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <TextField
        id={`alt-${media.id}`}
        name="alt"
        label="Texte alternatif"
        fieldSize="sm"
        defaultValue={media.alt ?? ''}
        maxLength={300}
      />

      <TextField
        id={`caption-${media.id}`}
        name="caption"
        label="Légende"
        fieldSize="sm"
        defaultValue={media.caption ?? ''}
        maxLength={300}
      />

      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  )
}

/**
 * Suppression.
 *
 * Deux temps : le bouton demande confirmation avant d'envoyer. Un média
 * encore rattaché est refusé par l'action elle-même, qui renvoie le nombre
 * d'emplacements concernés — le bouton n'est donc pas la garde, seulement le
 * premier filtre.
 */
export function MediaDeleteForm({ mediaId, uses }: { mediaId: string; uses: number }) {
  const [state, formAction, pending] = useActionState(removeMedia, EMPTY)
  const [confirming, setConfirming] = useState(false)

  if (state.notice) {
    return (
      <Alert tone="ok" live="polite">
        {state.notice}
      </Alert>
    )
  }

  if (uses > 0) {
    return (
      <p className="text-xs text-muted">
        Utilisé à {uses} endroit{uses > 1 ? 's' : ''} : détachez-le d’une fiche avant de pouvoir le
        supprimer.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={mediaId} />

      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Suppression…' : 'Confirmer la suppression'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          Supprimer
        </Button>
      )}
    </form>
  )
}
