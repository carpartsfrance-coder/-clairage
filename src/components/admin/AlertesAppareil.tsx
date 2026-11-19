'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  enregistrerAppareil,
  envoyerAlerteEssai,
  retirerAppareil,
  type AbonnementNavigateur,
} from '@/lib/actions/admin-alertes'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'

/**
 * Activer les alertes instantanées sur l'appareil qu'on tient en main.
 *
 * Chaque appareil s'active à part, depuis lui-même : c'est le navigateur qui
 * demande la permission et fournit son adresse. Sur iPhone, Apple réserve les
 * notifications aux sites ajoutés à l'écran d'accueil — la page le dit et
 * explique comment, plutôt que d'afficher un bouton qui ne marcherait pas.
 */

type Etat =
  | 'verification'
  | 'iphone-a-installer'
  | 'non-pris-en-charge'
  | 'refusees'
  | 'inactives'
  | 'actives'

const SCRIPT = '/sw-equipe.js'
const PORTEE = '/admin/'

function versOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const brut = atob(base64)
  const octets = new Uint8Array(new ArrayBuffer(brut.length))
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets
}

function estUnIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function installeSurLEcran(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function enAbonnement(sub: PushSubscription): AbonnementNavigateur {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

export function AlertesAppareil({ clePublique }: { clePublique: string | null }) {
  const [etat, setEtat] = useState<Etat>('verification')
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [enCours, demarrer] = useTransition()

  useEffect(() => {
    let annule = false
    ;(async () => {
      const pris = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      if (!pris) {
        if (!annule) setEtat(estUnIphone() && !installeSurLEcran() ? 'iphone-a-installer' : 'non-pris-en-charge')
        return
      }
      if (Notification.permission === 'denied') {
        if (!annule) setEtat('refusees')
        return
      }
      try {
        const enregistrement = await navigator.serviceWorker.register(SCRIPT, { scope: PORTEE })
        const sub = await enregistrement.pushManager.getSubscription()
        if (sub) {
          // Le serveur peut l'avoir oublié (appareil passé à un autre compte,
          // base remise à zéro) : on le lui redonne à chaque visite.
          await enregistrerAppareil(enAbonnement(sub))
          if (!annule) setEtat('actives')
        } else if (!annule) {
          setEtat('inactives')
        }
      } catch {
        if (!annule) setEtat('non-pris-en-charge')
      }
    })()
    return () => {
      annule = true
    }
  }, [])

  function activer() {
    if (!clePublique) {
      setMessage({ ok: false, texte: 'Les alertes ne sont pas disponibles pour le moment. Réessayez plus tard.' })
      return
    }
    demarrer(async () => {
      setMessage(null)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refusees' : 'inactives')
        return
      }
      try {
        const enregistrement = await navigator.serviceWorker.register(SCRIPT, { scope: PORTEE })
        await navigator.serviceWorker.ready
        const sub = await enregistrement.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: versOctets(clePublique),
        })
        const r = await enregistrerAppareil(enAbonnement(sub))
        setMessage({ ok: r.ok, texte: r.message })
        if (r.ok) setEtat('actives')
      } catch {
        setMessage({ ok: false, texte: 'Cet appareil n’a pas pu s’abonner. Réessayez dans un instant.' })
      }
    })
  }

  function desactiver() {
    demarrer(async () => {
      setMessage(null)
      const enregistrement = await navigator.serviceWorker.getRegistration(PORTEE)
      const sub = await enregistrement?.pushManager.getSubscription()
      if (sub) {
        await retirerAppareil(sub.endpoint)
        await sub.unsubscribe().catch(() => {})
      }
      setEtat('inactives')
      setMessage({ ok: true, texte: 'Alertes coupées sur cet appareil.' })
    })
  }

  function essayer() {
    demarrer(async () => {
      setMessage(null)
      const r = await envoyerAlerteEssai()
      setMessage({ ok: r.ok, texte: r.message })
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Alertes instantanées sur cet appareil</p>

      {etat === 'verification' ? <p className="text-xs text-muted">Vérification…</p> : null}

      {etat === 'iphone-a-installer' ? (
        <p className="text-sm text-muted-strong">
          Sur iPhone, Apple n’envoie les alertes qu’aux sites ajoutés à l’écran d’accueil. Dans
          Safari, touchez <strong>Partager</strong>, puis <strong>Sur l’écran d’accueil</strong>.
          Ouvrez ensuite le back-office depuis cette icône et revenez ici pour activer les alertes.
        </p>
      ) : null}

      {etat === 'non-pris-en-charge' ? (
        <p className="text-sm text-muted-strong">
          Ce navigateur ne sait pas recevoir d’alertes. Ouvrez le back-office dans Chrome, Safari,
          Edge ou Firefox à jour.
        </p>
      ) : null}

      {etat === 'refusees' ? (
        <p className="text-sm text-muted-strong">
          Les notifications ont été refusées pour ce site. Rouvrez-les dans les réglages du
          navigateur (ou de l’iPhone, rubrique Notifications), puis rechargez cette page.
        </p>
      ) : null}

      {etat === 'inactives' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={activer} disabled={enCours}>
            {enCours ? 'Activation…' : 'Activer les alertes ici'}
          </Button>
          <span className="text-xs text-muted">
            Le téléphone sonnera à chaque question, même le back-office fermé.
          </span>
        </div>
      ) : null}

      {etat === 'actives' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <i aria-hidden="true" className="size-2.5 rounded-full bg-ok" />
            Actives
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={essayer} disabled={enCours}>
            Envoyer une alerte d’essai
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={desactiver} disabled={enCours}>
            Couper ici
          </Button>
        </div>
      ) : null}

      {message ? (
        <Alert tone={message.ok ? 'ok' : 'danger'} live="polite">
          {message.texte}
        </Alert>
      ) : null}
    </div>
  )
}
