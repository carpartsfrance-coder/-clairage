'use client'

import { useActionState } from 'react'
import { requestStockAlert, type StockAlertState } from '@/lib/actions/stock-alert'
import { IconCheckCircle, IconMail } from '@/components/ui/icons'

/**
 * Alerte de retour en stock, sur une référence en rupture.
 *
 * Le bloc d'achat affichait un bouton désactivé : une impasse, sans rien à
 * faire. La maquette V2 prévoit un parcours d'alerte à cet endroit, et le
 * cahier des charges demande qu'il **enregistre réellement** la demande.
 *
 * Trois choses qu'il ne fait pas, et c'est délibéré :
 *
 * - **Aucune date.** Une rupture sans date de réapprovisionnement connue ne
 *   doit pas afficher un délai : « sous 8 jours » inventé vaut mieux que rien
 *   pour la conversion, et moins que rien pour la confiance.
 * - **Aucune réservation.** L'alerte prévient, elle ne met pas de côté. Le
 *   message de retour le redit, parce qu'un client qui arrive deux jours plus
 *   tard sur une rupture aurait le sentiment d'avoir été joué.
 * - **Aucun compte requis.** Une adresse suffit ; le doublon est écarté par la
 *   base, pas par le formulaire.
 */
export function StockAlertForm({
  variantId,
  defaultEmail,
}: {
  variantId: string
  /** Adresse du client connecté, s'il y en a un. */
  defaultEmail?: string | null
}) {
  const [state, action, pending] = useActionState<StockAlertState, FormData>(requestStockAlert, {})

  if (state.ok) {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-ok-border bg-ok-soft p-3 text-[11px] text-[#2a6441]">
        <IconCheckCircle className="mt-px size-4 shrink-0" />
        <p>{state.message}</p>
      </div>
    )
  }

  return (
    <form action={action} className="rounded-md border border-line bg-surface-paper p-3">
      <input type="hidden" name="variantId" value={variantId} />

      <p className="text-[11px] font-bold">Prévenez-moi du retour</p>
      <p className="mt-[3px] text-[10px] leading-[1.5] text-muted-strong">
        Nous ne connaissons pas encore la date de réapprovisionnement. Vous recevrez un message dès
        que la référence revient — rien n’est mis de côté.
      </p>

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`alerte-${variantId}`}>
          Votre adresse e-mail
        </label>
        <input
          id={`alerte-${variantId}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail ?? ''}
          placeholder="vous@exemple.fr"
          className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-3 text-[12px] placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-[11px] font-bold text-white transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconMail className="size-4" />
          {pending ? 'Enregistrement…' : 'Me prévenir'}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-[10px] font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
