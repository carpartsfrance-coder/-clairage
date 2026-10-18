'use client'

import { useActionState } from 'react'
import {
  addOrderNote,
  cancelOrder,
  refundOrder,
  shipOrder,
  type AdminState,
} from '@/lib/actions/admin-orders'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { formatPrice } from '@/lib/identity'

/* --------------------------------------------------------------------------
   Actions d'administration sur une commande
   --------------------------------------------------------------------------
   Quatre formulaires, un par action. Ce sont des composants client pour une
   seule raison : `useActionState`, qui affiche le retour du serveur.

   Rien n'est décidé ici. La validation, les droits, la remise en stock et la
   rédaction des messages appartiennent à `lib/actions/admin-orders`. La page
   qui monte ces formulaires ne les affiche que si le rôle a le droit
   correspondant, mais c'est l'action qui protège : masquer un bouton n'est
   qu'une politesse d'interface.

   Deux vérités sont écrites à l'écran, parce qu'elles ne vont pas de soi :
   la remise en stock n'est jamais automatique, et un remboursement enregistré
   ici n'est pas un remboursement exécuté chez le prestataire de paiement.
   -------------------------------------------------------------------------- */

const EMPTY: AdminState = {}

/** Retour de l'action : une erreur interrompt, un succès se constate. */
function Feedback({ state }: { state: AdminState }) {
  return (
    <>
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}
      {state.notice ? <Alert tone="ok">{state.notice}</Alert> : null}
    </>
  )
}

const formClass = 'flex flex-col gap-3'
const noteClass = 'text-xs text-muted'
const checkRowClass = 'flex items-start gap-2.5 text-sm'
const checkInputClass = 'mt-0.5 size-5 shrink-0 accent-brand'

/**
 * Zone de texte. `Field.tsx` n'en fournit pas : on reprend ses classes pour
 * que l'apparence reste la même, sans dupliquer sa logique d'erreur.
 */
function Textarea({
  id,
  name,
  label,
  rows = 3,
  required,
  placeholder,
}: {
  id: string
  name: string
  label: string
  rows?: number
  required?: boolean
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-sm text-slate-ink transition-colors placeholder:text-muted hover:border-muted"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Expédition                                                                 */
/* -------------------------------------------------------------------------- */

export function ShipForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(shipOrder, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="orderId" value={orderId} />

      <TextField
        id="expedition-transporteur"
        name="carrier"
        label="Transporteur"
        fieldSize="sm"
        required
        autoComplete="off"
      />

      <TextField
        id="expedition-numero"
        name="trackingNumber"
        label="Numéro de suivi"
        fieldSize="sm"
        autoComplete="off"
      />

      <TextField
        id="expedition-url"
        name="trackingUrl"
        label="URL de suivi"
        type="url"
        fieldSize="sm"
        placeholder="https://"
        autoComplete="off"
      />

      <label htmlFor="expedition-prevenir" className={checkRowClass}>
        <input
          id="expedition-prevenir"
          name="notifyCustomer"
          type="checkbox"
          defaultChecked
          className={checkInputClass}
        />
        <span>Prévenir le client par e-mail</span>
      </label>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Enregistrement…' : "Enregistrer l'expédition"}
      </Button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Annulation                                                                 */
/* -------------------------------------------------------------------------- */

export function CancelForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(cancelOrder, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="orderId" value={orderId} />

      <Textarea
        id="annulation-motif"
        name="reason"
        label="Motif"
        required
        placeholder="Ce motif est conservé dans l'historique de la commande."
      />

      <p className={noteClass}>
        La remise en stock est un choix explicite : un article revenu cassé ne retourne pas en
        rayon.
      </p>

      <label htmlFor="annulation-stock" className={checkRowClass}>
        <input
          id="annulation-stock"
          name="restock"
          type="checkbox"
          className={checkInputClass}
        />
        <span>Remettre les articles en stock</span>
      </label>

      <label htmlFor="annulation-prevenir" className={checkRowClass}>
        <input
          id="annulation-prevenir"
          name="notifyCustomer"
          type="checkbox"
          defaultChecked
          className={checkInputClass}
        />
        <span>Prévenir le client</span>
      </label>

      <Button type="submit" size="sm" variant="secondary" className="text-danger!" disabled={pending}>
        {pending ? 'Annulation…' : 'Annuler la commande'}
      </Button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Remboursement                                                              */
/* -------------------------------------------------------------------------- */

export function RefundForm({
  orderId,
  maxRefundableCents,
}: {
  orderId: string
  /** Ce qui reste remboursable : encaissé moins déjà remboursé. */
  maxRefundableCents: number
}) {
  const [state, formAction, pending] = useActionState(refundOrder, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="orderId" value={orderId} />

      <TextField
        id="remboursement-montant"
        name="amount"
        label="Montant à rembourser (€)"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0.01"
        max={maxRefundableCents / 100}
        fieldSize="sm"
        required
        hint={`Reste remboursable : ${formatPrice(maxRefundableCents)}`}
      />

      <Textarea id="remboursement-motif" name="reason" label="Motif" required />

      <p className={noteClass}>
        La remise en stock est un choix explicite : un article revenu cassé ne retourne pas en
        rayon.
      </p>

      <label htmlFor="remboursement-stock" className={checkRowClass}>
        <input
          id="remboursement-stock"
          name="restock"
          type="checkbox"
          className={checkInputClass}
        />
        <span>Remettre les articles en stock</span>
      </label>

      <label htmlFor="remboursement-prevenir" className={checkRowClass}>
        <input
          id="remboursement-prevenir"
          name="notifyCustomer"
          type="checkbox"
          defaultChecked
          className={checkInputClass}
        />
        <span>Prévenir le client</span>
      </label>

      {/*
        Dit avant le clic, pas après : l'action écrit un remboursement dans la
        commande et n'appelle pas le prestataire de paiement.
      */}
      <Alert tone="warn">
        Ce formulaire enregistre le remboursement dans la commande. Il ne le déclenche PAS chez le
        prestataire de paiement — à faire depuis son tableau de bord.
      </Alert>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer le remboursement'}
      </Button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Note interne                                                               */
/* -------------------------------------------------------------------------- */

export function NoteForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(addOrderNote, EMPTY)

  return (
    <form action={formAction} className={formClass}>
      <Feedback state={state} />
      <input type="hidden" name="orderId" value={orderId} />

      <Textarea id="note-corps" name="body" label="Note" required />

      <p className={noteClass}>Note interne, le client ne la voit pas.</p>

      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Ajout…' : 'Ajouter la note'}
      </Button>
    </form>
  )
}
