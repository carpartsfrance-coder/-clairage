'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { identity } from '@/lib/identity'
import {
  ATTENTE_AVANT_EMAIL_MS,
  MESSAGE_MAX,
  type EtatDiscussion,
  type MessageVu,
} from '@/lib/chat'
import { mesurer, visiteEnCours } from '@/components/mesure/file'
import { IconChat, IconClose, IconSend } from '@/components/ui/icons'

/**
 * La bulle « Une question ? » et sa fenêtre de discussion.
 *
 * **Une personne répond, et la fenêtre le dit dès l'ouverture.** C'est la
 * différence avec les chats de robots que les visiteurs ont appris à fuir, et
 * c'est la raison d'être de cette bulle (exploitant, 19 novembre 2026).
 *
 * **Placement.** Sur la fiche produit, la barre d'achat fixe occupe le bas de
 * l'écran : la bulle se pose au-dessus (`decalage`), et au-dessus du bandeau
 * de consentement tant qu'il est affiché (`--hauteur-bandeau`). Une bulle qui
 * recouvrirait « Ajouter au panier » coûterait plus de ventes qu'elle n'en
 * apporterait. Elle est sombre, pas rouge : le rouge appartient au bouton
 * d'achat, et la bulle ne doit pas lui disputer le regard.
 *
 * **En bas à droite, partout** (exploitant, 19 novembre 2026), là où tout
 * le monde cherche un chat. Sur grand écran, la colonne d'achat occupe la
 * droite, et à cet endroit la bulle mordait sur « Ajouter au panier » dès le
 * premier écran d'un portable (vérifié à 1280 × 820). Elle s'écarte donc
 * d'elle-même des boutons marqués `data-cta-achat` : au-dessus de la barre
 * d'achat quand elle est affichée, sinon dans le coin, puis au ras du bas de
 * l'écran si un bouton passe juste au-dessus, et en dernier recours elle
 * s'efface le temps que le bouton passe. Sur téléphone, rien de tel : le
 * bouton de la barre fixe reste toujours visible sous la bulle.
 *
 * **Rien n'est stocké avant la première question.** Le jeton de la
 * discussion n'est écrit dans le navigateur qu'au premier message envoyé :
 * c'est un stockage nécessaire au service que le visiteur vient de demander,
 * et il n'existe pas tant qu'il ne l'a pas demandé.
 *
 * **Relecture.** Toutes les 4 s fenêtre ouverte, toutes les 12 s fermée, et
 * jamais onglet en arrière-plan. C'est aussi ce qui dit au serveur si le
 * visiteur est encore là quand l'équipe répond (voir `PRESENCE_MS`).
 */

const CLE_JETON = 'lv-discussion'
const CLE_VU = 'lv-discussion-vu'
const RELECTURE_OUVERTE_MS = 4_000
const RELECTURE_FERMEE_MS = 12_000

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrire(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle)
    else localStorage.setItem(cle, valeur)
  } catch {
    // Stockage refusé (navigation privée stricte) : la discussion marche le
    // temps de la page, elle ne survit simplement pas à un rechargement.
  }
}

export function BulleDiscussion({
  produit = null,
  decalage = 0,
}: {
  /** Identifiant de la fiche regardée : l'équipe verra le produit à côté de la question. */
  produit?: string | null
  /** Hauteur à laisser libre en bas de l'écran (barre d'achat fixe), en pixels. */
  decalage?: number
}) {
  const [ouvert, setOuvert] = useState(false)
  const [jeton, setJeton] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageVu[]>([])
  const [disponible, setDisponible] = useState<boolean | null>(null)
  const [avecEmail, setAvecEmail] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [dernierVu, setDernierVu] = useState<string | null>(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  const champ = useRef<HTMLTextAreaElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const fil = useRef<HTMLDivElement>(null)

  /*
    Grand écran : la bulle ne couvre jamais un bouton d'achat.

    Barre d'achat affichée, elle se pose au-dessus. Sinon, elle prend le coin
    habituel (24 px du bas), puis le ras de l'écran (8 px) si un bouton passe
    juste au-dessus ; si les deux tombent sur un bouton, elle s'efface le temps
    qu'il passe. Recalculé au défilement et au redimensionnement, une fois par
    image au plus. Sur téléphone, `null` : la place prévue par les classes.
  */
  const [ecart, setEcart] = useState<number | 'cachee' | null>(null)
  useEffect(() => {
    const grandEcran = window.matchMedia('(min-width: 801px)')
    let image = 0
    const calculer = () => {
      image = 0
      const b = bouton.current
      if (!b || !grandEcran.matches) {
        setEcart(null)
        return
      }
      const hauteur = b.offsetHeight || 48
      const droite = window.innerWidth - 24
      const gauche = droite - (b.offsetWidth || 150)
      const bandeau =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hauteur-bandeau')) || 0
      const aLEcran = (r: DOMRect) => r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
      const boutons = Array.from(document.querySelectorAll('[data-cta-achat]'))
        .map((el) => el.getBoundingClientRect())
        .filter(aLEcran)
      const barre = Array.from(document.querySelectorAll('[data-cta-achat="barre"]')).some((el) =>
        aLEcran(el.getBoundingClientRect()),
      )
      const libre = (depuisLeBas: number) => {
        const basBulle = window.innerHeight - depuisLeBas
        const hautBulle = basBulle - hauteur
        return boutons.every(
          (r) =>
            r.right < gauche - 4 || r.left > droite + 4 || r.bottom < hautBulle - 4 || r.top > basBulle + 4,
        )
      }
      const candidats = barre ? [bandeau + decalage + 14] : [bandeau + 24, bandeau + 8]
      setEcart(candidats.find(libre) ?? 'cachee')
    }
    const demander = () => {
      if (!image) image = requestAnimationFrame(calculer)
    }
    demander()
    window.addEventListener('scroll', demander, { passive: true })
    window.addEventListener('resize', demander)
    grandEcran.addEventListener('change', demander)
    // La barre d'achat entre et sort en glissant : la place calculée pendant
    // le défilement est celle d'avant son arrivée. On recompte à la fin de
    // chaque animation de la page.
    document.addEventListener('transitionend', demander)
    return () => {
      cancelAnimationFrame(image)
      window.removeEventListener('scroll', demander)
      window.removeEventListener('resize', demander)
      grandEcran.removeEventListener('change', demander)
      document.removeEventListener('transitionend', demander)
    }
  }, [decalage])

  /* Une discussion déjà commencée reprend où elle en était, de page en page. */
  useEffect(() => {
    setJeton(lire(CLE_JETON))
    setDernierVu(lire(CLE_VU))
  }, [])

  const appliquer = useCallback((etat: EtatDiscussion, jetonEnvoye: string | null) => {
    setDisponible(etat.disponible)
    setMaintenant(Date.now())
    if (etat.t) {
      if (etat.t !== jetonEnvoye) ecrire(CLE_JETON, etat.t)
      setJeton(etat.t)
      setMessages(etat.messages ?? [])
      setAvecEmail(Boolean(etat.avecEmail))
    } else if (jetonEnvoye) {
      // Jeton inconnu du serveur (discussion effacée) : on l'oublie.
      ecrire(CLE_JETON, null)
      setJeton(null)
      setMessages([])
    }
  }, [])

  const relire = useCallback(
    async (t: string | null) => {
      try {
        const r = await fetch(`/api/chat${t ? `?t=${encodeURIComponent(t)}` : ''}`, {
          cache: 'no-store',
        })
        if (r.ok) appliquer((await r.json()) as EtatDiscussion, t)
      } catch {
        // Réseau coupé : la relecture suivante rattrapera.
      }
    },
    [appliquer],
  )

  /* Relecture : seulement s'il y a une discussion, et onglet au premier plan. */
  useEffect(() => {
    if (!jeton) {
      if (ouvert) void relire(null)
      return
    }
    const tour = () => {
      if (document.visibilityState === 'visible') void relire(jeton)
    }
    tour()
    const minuteur = window.setInterval(tour, ouvert ? RELECTURE_OUVERTE_MS : RELECTURE_FERMEE_MS)
    document.addEventListener('visibilitychange', tour)
    return () => {
      window.clearInterval(minuteur)
      document.removeEventListener('visibilitychange', tour)
    }
  }, [jeton, ouvert, relire])

  /* Fenêtre ouverte, tout ce qui est affiché est lu. */
  const dernier = messages.at(-1) ?? null
  useEffect(() => {
    if (ouvert && dernier && dernier.id !== dernierVu) {
      setDernierVu(dernier.id)
      ecrire(CLE_VU, dernier.id)
    }
  }, [ouvert, dernier, dernierVu])

  const nonLus = useMemo(() => {
    if (ouvert) return 0
    const depuis = dernierVu ? messages.findIndex((m) => m.id === dernierVu) : -1
    return messages.slice(depuis + 1).filter((m) => m.de === 'equipe').length
  }, [ouvert, messages, dernierVu])

  /* Le dernier message reste en vue. */
  useEffect(() => {
    if (ouvert && fil.current) fil.current.scrollTop = fil.current.scrollHeight
  }, [ouvert, messages.length])

  /* Échap ferme la fenêtre et rend la main à la bulle. */
  useEffect(() => {
    if (!ouvert) return
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false)
        bouton.current?.focus()
      }
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [ouvert])

  function ouvrir() {
    setOuvert(true)
    mesurer('chat-ouvert')
    // Après l'affichage : un champ masqué ne prend pas le focus.
    window.setTimeout(() => champ.current?.focus(), 30)
  }

  function fermer() {
    setOuvert(false)
    bouton.current?.focus()
  }

  async function envoyer(corps: { message?: string; email?: string }): Promise<boolean> {
    setEnvoi(true)
    setErreur(null)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          t: jeton,
          ...corps,
          page: location.pathname,
          produit,
          visite: visiteEnCours(),
        }),
      })
      const etat = (await r.json().catch(() => ({}))) as EtatDiscussion & { erreur?: string }
      if (!r.ok) {
        setErreur(etat.erreur ?? 'Le message n’a pas pu partir. Réessayez dans un instant.')
        return false
      }
      appliquer(etat, jeton)
      return true
    } catch {
      setErreur('Connexion impossible. Vérifiez votre réseau, puis réessayez.')
      return false
    } finally {
      setEnvoi(false)
    }
  }

  const emailRequis = disponible === false && !avecEmail

  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const texte = brouillon.trim()
    if (!texte || envoi) return
    if (emailRequis && !email.trim()) {
      setErreur('Laissez votre e-mail : nous vous répondrons dès notre retour.')
      return
    }
    const premier = messages.length === 0
    const ok = await envoyer({
      message: texte,
      ...(email.trim() && !avecEmail ? { email: email.trim() } : {}),
    })
    if (ok) {
      setBrouillon('')
      if (champ.current) champ.current.style.height = ''
      mesurer('chat-message', { label: premier ? 'premier' : 'suite' })
    }
  }

  async function laisserEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || envoi) return
    await envoyer({ email: email.trim() })
  }

  const enAttente =
    dernier?.de === 'client' && maintenant - Date.parse(dernier.le) > ATTENTE_AVANT_EMAIL_MS

  const bas =
    typeof ecart === 'number'
      ? `${ecart}px`
      : `calc(var(--hauteur-bandeau, 0px) + ${decalage + 14}px + env(safe-area-inset-bottom, 0px))`

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={ouvrir}
        aria-label={
          nonLus > 0
            ? `Discussion : ${nonLus} nouvelle${nonLus > 1 ? 's' : ''} réponse${nonLus > 1 ? 's' : ''}`
            : 'Une question ? Écrivez à l’équipe'
        }
        aria-expanded={ouvert}
        aria-controls="discussion"
        style={{ bottom: bas }}
        className={cn(
          'fixed right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-ink pr-[18px] pl-3.5 text-[14px] font-semibold text-white shadow-[0_10px_28px_rgb(17_18_20/0.28)] transition-[background-color,bottom,opacity,visibility] duration-200 hover:bg-black fiche:right-6',
          ecart === 'cachee' && 'invisible opacity-0',
          ouvert && 'hidden',
        )}
      >
        <IconChat className="size-[22px] shrink-0" />
        Une question ?
        {nonLus > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-brand px-1 text-[11px] font-bold"
          >
            {nonLus}
          </span>
        ) : null}
      </button>

      <div
        id="discussion"
        role="dialog"
        aria-label={`Discussion avec l’équipe ${identity.name}`}
        data-mesure-inerte
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden bg-white shadow-[0_18px_60px_rgb(17_18_20/0.3)]',
          'inset-x-0 bottom-0 h-[min(85dvh,640px)] rounded-t-[20px]',
          'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(600px,calc(100dvh-48px))] sm:w-[372px] sm:rounded-[20px] sm:border sm:border-line',
          !ouvert && 'hidden',
        )}
      >
        {/* ---- En-tête : qui répond, et s'il est là ---- */}
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-paper text-ink">
            <IconChat className="size-5" />
            <i
              aria-hidden="true"
              className={cn(
                'absolute right-0 bottom-0 size-3 rounded-full border-2 border-white',
                disponible === false ? 'bg-line-strong' : 'bg-ok',
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight font-bold text-ink">
              Une question ?{' '}
              <span className="text-[12px] font-semibold text-muted">
                {disponible === false ? '· Absents' : disponible ? '· En ligne' : ''}
              </span>
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted-strong">
              {disponible === false
                ? 'Laissez votre question et votre e-mail : nous vous répondons dès notre retour.'
                : 'Une personne de l’équipe vous répond ici, en direct.'}
            </p>
          </div>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer la discussion"
            className="-mt-1 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-strong hover:bg-surface-paper"
          >
            <IconClose className="size-5" />
          </button>
        </div>

        {/* ---- Le fil ---- */}
        <div ref={fil} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="rounded-2xl bg-surface-soft px-4 py-3.5 text-[13.5px] leading-relaxed text-[#3c4047]">
              <p>
                Compatibilité avec votre véhicule, choix d’une teinte, montage : posez votre
                question.
              </p>
              <p className="mt-1.5 text-muted-strong">
                C’est une vraie personne qui vous répond, pas un robot.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn('flex flex-col', m.de === 'client' ? 'items-end' : 'items-start')}
                >
                  <p
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug break-words whitespace-pre-line',
                      m.de === 'client'
                        ? 'rounded-br-md bg-ink text-white'
                        : 'rounded-bl-md bg-surface-paper text-ink',
                    )}
                  >
                    {m.texte}
                  </p>
                  <span className="mt-1 px-1 text-[11px] text-muted">
                    {m.de === 'equipe' ? `${identity.name} · ` : ''}
                    {heure.format(new Date(m.le))}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {messages.length > 0 && !avecEmail && disponible !== false ? (
            <form onSubmit={laisserEmail} className="mt-4 rounded-2xl border border-line px-3.5 py-3">
              <p className="text-[12.5px] leading-snug text-muted-strong">
                {enAttente
                  ? 'Nous n’avons pas encore pu vous répondre. Laissez votre e-mail : la réponse vous y attendra.'
                  : 'Vous devez partir ? Laissez votre e-mail, la réponse vous y attendra.'}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label="Votre e-mail"
                  placeholder="votre@email.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-[16px] focus:border-ink focus:outline-none sm:text-[14px]"
                />
                <button
                  type="submit"
                  disabled={envoi || !email.trim()}
                  className="h-10 shrink-0 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </form>
          ) : null}

          {avecEmail && messages.length > 0 ? (
            <p className="mt-4 text-center text-[11.5px] leading-snug text-muted">
              Si vous quittez la page, la réponse vous sera aussi envoyée par e-mail.
            </p>
          ) : null}
        </div>

        {/* ---- La saisie ---- */}
        <form onSubmit={soumettre} className="border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {erreur ? (
            <p role="alert" className="mb-2 text-[12.5px] leading-snug text-danger">
              {erreur}
            </p>
          ) : null}
          {emailRequis ? (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Votre e-mail, pour recevoir la réponse"
              placeholder="Votre e-mail, pour recevoir la réponse"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-2 h-11 w-full rounded-xl border border-line px-3 text-[16px] focus:border-ink focus:outline-none sm:text-[14px]"
            />
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={champ}
              aria-label="Votre question"
              rows={1}
              maxLength={MESSAGE_MAX}
              value={brouillon}
              placeholder="Écrivez votre question…"
              onChange={(e) => {
                setBrouillon(e.target.value)
                // La zone grandit avec le texte, jusqu'à cinq lignes environ.
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line px-3 py-2.5 text-[16px] leading-snug focus:border-ink focus:outline-none sm:text-[14px]"
            />
            <button
              type="submit"
              disabled={envoi || !brouillon.trim()}
              aria-label="Envoyer"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white transition-opacity disabled:opacity-35"
            >
              <IconSend className="size-5" />
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
