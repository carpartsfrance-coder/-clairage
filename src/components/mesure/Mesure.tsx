'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Mesure d'audience anonyme : pages vues et clics, pour voir où les visiteurs
 * vont et où ils s'arrêtent (demande de l'exploitant pour le lancement,
 * 10 novembre 2026).
 *
 * Faite pour rester dans l'exemption de consentement de la CNIL (mesure
 * d'audience strictement anonyme, propre au site) :
 * - aucun cookie : un numéro de visite tiré au hasard, gardé dans l'onglet
 *   (sessionStorage) et oublié à sa fermeture ou après 30 min d'inactivité ;
 * - ni adresse IP, ni compte, ni navigateur enregistrés : seulement la
 *   catégorie d'écran (mobile, tablette, ordinateur) ;
 * - aucun service extérieur : tout part vers /api/mesure ;
 * - le visiteur peut refuser (page Cookies), et « Do Not Track » / « Global
 *   Privacy Control » sont respectés.
 * L'équipe n'est pas comptée : ouvrir le back-office pose le refus sur son
 * navigateur (AdminSansMesure).
 */

const CLE_VISITE = 'lv-visite'
export const CLE_REFUS = 'lv-sans-mesure'
const INACTIVITE_MS = 30 * 60 * 1000

type Evenement = {
  kind: 'page' | 'click'
  path: string
  target?: string
  label?: string
  zone?: string
  query?: string
  source?: string
  device: string
  visit: string
}

let file: Evenement[] = []
let minuteur: ReturnType<typeof setTimeout> | null = null

function refuse(): boolean {
  try {
    if (localStorage.getItem(CLE_REFUS) === '1') return true
  } catch {}
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.webdriver === true || nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

/** Le numéro de visite, et s'il vient d'être créé (première page de la visite). */
function visite(): { id: string; nouvelle: boolean } {
  const maintenant = Date.now()
  try {
    const brut = sessionStorage.getItem(CLE_VISITE)
    const v = brut ? (JSON.parse(brut) as { id: string; t: number }) : null
    if (v && maintenant - v.t < INACTIVITE_MS) {
      sessionStorage.setItem(CLE_VISITE, JSON.stringify({ id: v.id, t: maintenant }))
      return { id: v.id, nouvelle: false }
    }
    const id = crypto.randomUUID()
    sessionStorage.setItem(CLE_VISITE, JSON.stringify({ id, t: maintenant }))
    return { id, nouvelle: true }
  } catch {
    return { id: 'sans-stockage', nouvelle: false }
  }
}

function ecran(): string {
  const l = window.innerWidth
  return l < 640 ? 'mobile' : l < 1024 ? 'tablette' : 'ordinateur'
}

function envoyer() {
  if (file.length === 0) return
  const lot = file.splice(0, 50)
  const corps = JSON.stringify({ events: lot })
  const ok = navigator.sendBeacon?.('/api/mesure', new Blob([corps], { type: 'application/json' }))
  if (!ok) void fetch('/api/mesure', { method: 'POST', body: corps, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
}

function ajouter(e: Evenement, tout_de_suite = false) {
  file.push(e)
  if (minuteur) clearTimeout(minuteur)
  // Un clic sur un lien peut quitter la page : on envoie sans attendre.
  if (tout_de_suite || file.length >= 20) envoyer()
  else minuteur = setTimeout(envoyer, 1000)
}

const court = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, n) : undefined
}

/** Où se trouvait l'élément cliqué : une zone nommée, sinon le titre de la section. */
function zoneDe(el: Element): string | undefined {
  const nommee = el.closest<HTMLElement>('[data-zone]')
  if (nommee?.dataset.zone) return nommee.dataset.zone
  const dialogue = el.closest('[role="dialog"]')
  if (dialogue) {
    const t = dialogue.querySelector('h2, h1')
    return court(`Fenêtre : ${t?.textContent ?? ''}`, 60)
  }
  if (el.closest('footer')) return 'Pied de page'
  if (el.closest('header')) return el.closest('nav') ? 'Menu' : 'En-tête'
  const section = el.closest('section, aside, article')
  if (section) {
    const id = section.getAttribute('aria-labelledby')
    const titre = (id && document.getElementById(id)) || section.querySelector('h1, h2, h3')
    if (titre?.textContent) return court(titre.textContent, 60)
  }
  return undefined
}

function cibleDe(el: Element): string | undefined {
  if (el instanceof HTMLAnchorElement && el.href) {
    try {
      const u = new URL(el.href, location.href)
      if (u.origin === location.origin) return u.pathname + (u.hash && u.pathname === location.pathname ? u.hash : '')
      return u.protocol === 'mailto:' ? 'e-mail' : u.protocol === 'tel:' ? 'téléphone' : u.hostname
    } catch {
      return undefined
    }
  }
  return undefined
}

export function Mesure() {
  const pathname = usePathname()
  const params = useSearchParams()

  // Page vue.
  useEffect(() => {
    if (refuse()) return
    const v = visite()
    let source: string | undefined
    if (v.nouvelle) {
      const utm = params.get('utm_source')
      const campagne = params.get('utm_campaign')
      if (utm) source = court(campagne ? `${utm} / ${campagne}` : utm, 80)
      else if (params.get('gclid')) source = 'google (publicité)'
      else if (params.get('fbclid')) source = 'facebook / instagram'
      else {
        try {
          const ref = document.referrer ? new URL(document.referrer) : null
          source = ref && ref.origin !== location.origin ? ref.hostname.replace(/^www\./, '') : 'direct'
        } catch {
          source = 'direct'
        }
      }
    }
    ajouter({
      kind: 'page',
      path: pathname,
      query: pathname === '/recherche' ? court(params.get('q'), 80) : undefined,
      source,
      device: ecran(),
      visit: v.id,
    })
  }, [pathname, params])

  // Clics sur les liens et les boutons.
  useEffect(() => {
    function surClic(event: MouseEvent) {
      if (refuse()) return
      const el = (event.target as Element | null)?.closest('a, button, summary, [role="button"], [role="tab"], [role="radio"]')
      if (!el) return
      const label = court(el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title'), 80)
      const target = cibleDe(el)
      if (!label && !target) return
      ajouter({
        kind: 'click',
        path: location.pathname,
        target,
        label,
        zone: zoneDe(el),
        device: ecran(),
        visit: visite().id,
      }, el instanceof HTMLAnchorElement)
    }
    function surDepart() {
      if (document.visibilityState === 'hidden') envoyer()
    }
    document.addEventListener('click', surClic, { capture: true })
    document.addEventListener('visibilitychange', surDepart)
    window.addEventListener('pagehide', envoyer)
    return () => {
      document.removeEventListener('click', surClic, { capture: true })
      document.removeEventListener('visibilitychange', surDepart)
      window.removeEventListener('pagehide', envoyer)
    }
  }, [])

  return null
}

/** Posé dans le back-office : l'équipe n'est pas comptée dans la mesure. */
export function AdminSansMesure() {
  useEffect(() => {
    try {
      localStorage.setItem(CLE_REFUS, '1')
    } catch {}
  }, [])
  return null
}
