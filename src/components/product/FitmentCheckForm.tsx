'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestFitmentCheck, type FitmentCheckState } from '@/lib/actions/support'
import { Alert } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'

/**
 * Formulaire de demande de vérification.
 *
 * Il ne demande que ce qui manque : une adresse pour répondre, et un message
 * si le client veut en dire plus. Le produit, le conditionnement, le véhicule
 * et l'équipement d'origine sont déjà connus — ils sont affichés au-dessus et
 * transmis par identifiant, pas re-saisis.
 */
export function FitmentCheckForm({
  variantId = null,
  generationId = null,
  configurationId,
  defaultEmail,
  submitLabel = 'Demander la vérification',
}: {
  /** Référence visée, quand la demande part d'une fiche produit. */
  variantId?: string | null
  /** Génération visée, quand la demande part du choix d'équipement. */
  generationId?: string | null
  configurationId: string | null
  defaultEmail: string | null
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<FitmentCheckState, FormData>(
    requestFitmentCheck,
    {},
  )

  if (state.reference) {
    return (
      <Alert tone="ok" live="polite" title="Votre demande est enregistrée.">
        <p>
          Elle porte la référence{' '}
          <strong className="text-slate-ink">{state.reference}</strong> et apparaît dans les
          demandes de l&apos;équipe.
        </p>
        {state.withoutEmail ? (
          /* L'envoi n'est pas activé : on le dit, plutôt que d'annoncer un
             e-mail parti. */
          <p className="mt-2">
            L&apos;envoi automatique d&apos;e-mails n&apos;est pas encore activé sur cet
            environnement : aucun accusé de réception ne vous a été expédié. Notez cette
            référence pour la suite.
          </p>
        ) : null}
        <p className="mt-2">
          <Link href="/" className="font-semibold underline underline-offset-4">
            Revenir à l&apos;accueil
          </Link>
        </p>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="variantId" value={variantId ?? ''} />
      <input type="hidden" name="generationId" value={generationId ?? ''} />
      <input type="hidden" name="configurationId" value={configurationId ?? ''} />

      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        id="verification-email"
        name="email"
        type="email"
        label="Votre adresse e-mail"
        required
        autoComplete="email"
        defaultValue={defaultEmail ?? ''}
        hint="Elle sert uniquement à vous répondre sur cette vérification."
      />

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="verification-message" className="text-[11px] font-bold">
          Précisions
        </label>
        <textarea
          id="verification-message"
          name="message"
          rows={4}
          maxLength={1000}
          placeholder="Référence du bloc optique, finition, difficulté rencontrée…"
          className="w-full rounded-[7px] border border-[#d5d9cf] bg-white p-3 text-[13px] text-[#31372c] placeholder:text-muted"
        />
        <p className="text-[10px] font-normal text-muted">
          Facultatif. La référence inscrite sur le phare d&apos;origine est ce qui lève le doute
          le plus souvent.
        </p>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="min-h-[51px] gap-3 rounded-[7px] text-[13px]"
      >
        {pending ? 'Envoi en cours…' : submitLabel}
      </Button>
    </form>
  )
}
