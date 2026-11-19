'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  changerDisponibilite,
  changerStatutDiscussion,
  repondreDiscussion,
  type DiscussionState,
} from '@/lib/actions/admin-chat'
import { REPONSE_MAX } from '@/lib/chat'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'

const VIDE: DiscussionState = {}

/**
 * Relit la page à intervalle régulier, onglet au premier plan seulement.
 *
 * C'est ce qui fait d'une page du back-office une discussion : les messages
 * du visiteur apparaissent sans recharger. `router.refresh` garde l'état des
 * composants client — une réponse en cours de frappe n'est pas perdue.
 */
export function RelectureAuto({ intervalle }: { intervalle: number }) {
  const router = useRouter()
  useEffect(() => {
    const tour = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const minuteur = window.setInterval(tour, intervalle)
    document.addEventListener('visibilitychange', tour)
    return () => {
      window.clearInterval(minuteur)
      document.removeEventListener('visibilitychange', tour)
    }
  }, [router, intervalle])
  return null
}

export function ReponseDiscussion({ id }: { id: string }) {
  const [state, action, pending] = useActionState(repondreDiscussion, VIDE)
  const formulaire = useRef<HTMLFormElement>(null)

  // Réponse partie : on vide le champ. Pas de `key` qui remonterait le
  // formulaire — deux réponses de suite donnent le même avis, et la seconde
  // ne viderait rien.
  useEffect(() => {
    if (state.notice) formulaire.current?.reset()
  }, [state])

  return (
    <form ref={formulaire} action={action} className="flex flex-col gap-2">
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
      <input type="hidden" name="id" value={id} />
      <label htmlFor="discussion-reponse" className="text-xs font-bold">
        Répondre
      </label>
      <textarea
        id="discussion-reponse"
        name="body"
        rows={4}
        required
        maxLength={REPONSE_MAX}
        className="rounded-sm border border-[#d4d4d4] p-2 text-[16px] sm:text-sm"
        placeholder="Bonjour, je vérifie pour votre véhicule…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer'}
        </Button>
        <span className="text-xs text-muted">
          S’affiche chez le visiteur s’il est sur la page, sinon part par e-mail s’il en a laissé un.
        </span>
      </div>
    </form>
  )
}

export function StatutDiscussion({ id, close }: { id: string; close: boolean }) {
  const [state, action, pending] = useActionState(changerStatutDiscussion, VIDE)
  return (
    <form action={action} className="flex flex-col gap-2">
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
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="statut" value={close ? 'OPEN' : 'CLOSED'} />
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {close ? 'Rouvrir la discussion' : 'Clore la discussion'}
        </Button>
      </div>
    </form>
  )
}

export function Disponibilite({ disponible }: { disponible: boolean }) {
  const [state, action, pending] = useActionState(changerDisponibilite, VIDE)
  return (
    <form action={action} className="flex flex-col gap-2">
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
      <input type="hidden" name="disponible" value={disponible ? 'non' : 'oui'} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <i
            aria-hidden="true"
            className={disponible ? 'size-2.5 rounded-full bg-ok' : 'size-2.5 rounded-full bg-line-strong'}
          />
          {disponible ? 'En ligne' : 'Absents'}
        </span>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {disponible ? 'Je m’absente' : 'Je suis disponible'}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {disponible
          ? 'La bulle annonce une réponse en direct.'
          : 'La bulle annonce une réponse par e-mail et demande l’adresse avec la question.'}
      </p>
    </form>
  )
}
