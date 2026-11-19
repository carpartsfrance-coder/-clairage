'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  changerDisponibilite,
  changerStatutDiscussion,
  chercherConseil,
  repondreDiscussion,
  type DiscussionState,
} from '@/lib/actions/admin-chat'
import { REPONSE_MAX, type CarteProduit } from '@/lib/chat'
import type { ProduitConseillable } from '@/lib/chat-serveur'
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

/**
 * Les réponses qui reviennent le plus, en un toucher : on répond souvent
 * depuis un téléphone, debout, entre deux colis. Le véhicule du visiteur y
 * est repris quand on le connaît.
 */
function reponsesToutesFaites(vehicule: string | null): Array<{ titre: string; texte: string }> {
  return [
    { titre: 'Je regarde', texte: 'Bonjour ! Je regarde ça pour vous, je reviens vers vous dans un instant.' },
    {
      titre: 'Compatible',
      texte: vehicule
        ? `Oui, ce produit est compatible avec votre ${vehicule}.`
        : 'Oui, ce produit est compatible avec votre véhicule.',
    },
    {
      titre: 'Je vérifie',
      texte:
        'Je vérifie la compatibilité exacte. Si vous devez partir, laissez votre e-mail dans la discussion : la réponse vous y attendra.',
    },
    {
      titre: 'Je conseille',
      texte: vehicule
        ? `Pour votre ${vehicule}, je vous conseille plutôt cet article :`
        : 'Je vous conseille plutôt cet article :',
    },
    { titre: 'Merci', texte: 'Avec plaisir ! N’hésitez pas si vous avez une autre question.' },
  ]
}

function prix(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export function ReponseDiscussion({
  id,
  vehicule,
  suggestions,
}: {
  id: string
  /** Le véhicule du visiteur, en court (« Audi A1 »). */
  vehicule: string | null
  /** Les conditionnements de la fiche qu'il regardait. */
  suggestions: ProduitConseillable[]
}) {
  const [state, action, pending] = useActionState(repondreDiscussion, VIDE)
  const formulaire = useRef<HTMLFormElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const [joint, setJoint] = useState<CarteProduit | null>(null)
  const [terme, setTerme] = useState('')
  const [resultats, setResultats] = useState<ProduitConseillable[]>([])
  const [recherche, chercher] = useTransition()

  // Réponse partie : on vide le champ et l'article joint. Pas de `key` qui
  // remonterait le formulaire — deux réponses de suite donnent le même avis,
  // et la seconde ne viderait rien.
  useEffect(() => {
    if (state.notice) {
      formulaire.current?.reset()
      setJoint(null)
      setTerme('')
      setResultats([])
    }
  }, [state])

  // Recherche d'un autre article, une fois la frappe posée.
  useEffect(() => {
    const mot = terme.trim()
    if (mot.length < 2) {
      setResultats([])
      return
    }
    const minuteur = window.setTimeout(() => {
      chercher(async () => setResultats(await chercherConseil(mot)))
    }, 300)
    return () => window.clearTimeout(minuteur)
  }, [terme])

  function inserer(texte: string) {
    const zone = champ.current
    if (!zone) return
    zone.value = zone.value.trim() ? `${zone.value.trim()} ${texte}` : texte
    zone.focus()
  }

  const listeVariantes = (produits: ProduitConseillable[]) => (
    <ul className="flex flex-col gap-1.5">
      {produits.map((produit) => (
        <li key={produit.slug}>
          <p className="text-xs font-semibold break-words">{produit.produit}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {produit.variantes.map((v) => (
              <button
                key={v.variantId}
                type="button"
                onClick={() => setJoint(v)}
                className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-ink"
              >
                {v.option ?? 'Joindre'} · {prix(v.prixCents)}
                {v.achetable ? '' : ' · indisponible'}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )

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
      <input type="hidden" name="variantId" value={joint?.variantId ?? ''} />

      <label htmlFor="discussion-reponse" className="text-xs font-bold">
        Répondre
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Réponses toutes faites">
        {reponsesToutesFaites(vehicule).map((r) => (
          <button
            key={r.titre}
            type="button"
            onClick={() => inserer(r.texte)}
            title={r.texte}
            className="rounded-full bg-surface-paper px-2.5 py-1 text-xs font-semibold hover:bg-line"
          >
            {r.titre}
          </button>
        ))}
      </div>
      <textarea
        ref={champ}
        id="discussion-reponse"
        name="body"
        rows={4}
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

      {/* ---- L'article joint ---- */}
      {joint ? (
        <div className="flex items-center gap-3 rounded-md border border-ink px-3 py-2">
          {joint.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={joint.image.url} alt="" className="size-11 shrink-0 rounded object-cover" />
          ) : null}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold break-words">{joint.nom}</p>
            <p className="text-xs text-muted-strong">
              {[joint.option, prix(joint.prixCents), joint.dispo].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJoint(null)}
            className="shrink-0 text-xs font-semibold underline underline-offset-4"
          >
            Retirer
          </button>
        </div>
      ) : (
        <details className="rounded-md border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-bold">Joindre un article (carte avec ajout au panier)</summary>
          <div className="mt-2 flex flex-col gap-3">
            {suggestions.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-muted-strong">Le produit qu’il regardait :</p>
                {listeVariantes(suggestions)}
              </div>
            ) : null}
            <div>
              <input
                type="search"
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                placeholder="Chercher un autre article : H7 ventilé, Clio 4…"
                aria-label="Chercher un article à conseiller"
                className="h-9 w-full rounded-sm border border-[#d4d4d4] px-2 text-[16px] sm:text-sm"
              />
              {recherche ? <p className="mt-1 text-xs text-muted">Recherche…</p> : null}
              {!recherche && terme.trim().length >= 2 && resultats.length === 0 ? (
                <p className="mt-1 text-xs text-muted">Aucun article en vente ne correspond.</p>
              ) : null}
              {resultats.length > 0 ? <div className="mt-2">{listeVariantes(resultats)}</div> : null}
            </div>
          </div>
        </details>
      )}

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
