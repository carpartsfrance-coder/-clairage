'use client'

import { useActionState } from 'react'
import { changerEtatDemande, repondreDemande, type SavState } from '@/lib/actions/admin-sav'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

const VIDE: SavState = {}

export function SavReponse({ ticketId, email }: { ticketId: string; email: string }) {
  const [state, action, pending] = useActionState(repondreDemande, VIDE)
  return (
    <form action={action} className="flex flex-col gap-2" key={state.notice}>
      {state.error ? <Alert tone="danger" live="assertive">{state.error}</Alert> : null}
      {state.notice ? <Alert tone="ok" live="polite">{state.notice}</Alert> : null}
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="sav-message" className="text-xs font-bold">Répondre au client</label>
      <textarea id="sav-message" name="body" rows={6} required className="rounded-sm border border-[#d4d4d4] p-2 text-sm"
        placeholder="Bonjour, merci pour votre message…" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="internal" /> Note interne seulement (pas envoyée au client)
      </label>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer'}
        </Button>
        <span className="ml-3 text-xs text-muted">Envoyé par e-mail à {email}.</span>
      </div>
    </form>
  )
}

export function SavEtat({
  ticketId,
  status,
  resolution,
}: {
  ticketId: string
  status: string
  resolution: string | null
}) {
  const [state, action, pending] = useActionState(changerEtatDemande, VIDE)
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <Alert tone="danger" live="assertive">{state.error}</Alert> : null}
      {state.notice ? <Alert tone="ok" live="polite">{state.notice}</Alert> : null}
      <input type="hidden" name="ticketId" value={ticketId} />
      <SelectField id="sav-etat" name="status" label="État" fieldSize="sm" defaultValue={status}>
        <option value="OPEN">Ouverte</option>
        <option value="WAITING_CUSTOMER">Attente du client</option>
        <option value="WAITING_RETURN">Attente du colis retour</option>
        <option value="RECEIVED">Colis reçu</option>
        <option value="APPROVED">Acceptée</option>
        <option value="REJECTED">Refusée</option>
        <option value="CLOSED">Clôturée</option>
      </SelectField>
      <SelectField id="sav-issue" name="resolution" label="Issue" fieldSize="sm" defaultValue={resolution ?? ''}>
        <option value="">Pas encore décidée</option>
        <option value="EXCHANGE">Échange</option>
        <option value="REPLACEMENT">Remplacement</option>
        <option value="REFUND">Remboursement</option>
        <option value="REJECTED">Refus</option>
        <option value="NO_ACTION">Aucune action</option>
      </SelectField>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer l’état'}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Un remboursement se fait depuis la page de la commande (bouton « Rembourser le client »).
      </p>
    </form>
  )
}
