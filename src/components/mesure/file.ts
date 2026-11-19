'use client'

import { libelleSansDonneePerso, cheminSansIdentifiant } from '@/lib/mesure-chemins'
import type { NomEvenement } from '@/lib/mesure-evenements'

/**
 * La plomberie de la mesure : le numéro de visite, le refus, le mode
 * détaillé, la file d'envoi, et `mesurer()` — la seule fonction que le reste
 * du site appelle.
 *
 * Séparée de `Mesure.tsx` pour une raison simple : n'importe quel composant
 * du site doit pouvoir dire « ceci vient de se produire » (un ajout au panier
 * a réussi, une compatibilité a échoué) sans importer le composant qui pose
 * les écouteurs, ni remonter l'information par des propriétés sur dix
 * niveaux.
 *
 * Les règles de la mesure ne changent pas pour autant : anonyme, sans cookie,
 * sans service extérieur, et rien de ce qui part ne doit permettre de
 * retrouver quelqu'un.
 */

/** Le numéro de visite, propre à un onglet (sessionStorage). */
const CLE_VISITE = 'lv-visite'

/** Refus de la mesure, posé par /cookies ou par le back-office. */
export const CLE_REFUS = 'lv-sans-mesure'

/**
 * Mode détaillé : ce navigateur-ci enregistre tout, trace du pointeur
 * comprise.
 *
 * **Il ne s'allume que depuis /admin/statistiques, et il ne vaut que pour le
 * navigateur où l'on a appuyé.** C'est la clé de voûte du dispositif : la
 * trace fine du pointeur sort de ce qu'une mesure d'audience anonyme a le
 * droit de faire sans accord, donc elle ne doit jamais tourner chez un
 * visiteur. Tant que l'exploitant ne teste que sur lui-même, personne
 * d'autre n'est concerné, et il n'y a pas d'accord à demander à personne.
 *
 * Le jour où ce mode devrait s'appliquer à de vrais visiteurs, il faudra une
 * case dans le bandeau de consentement et une ligne sur /confidentialite :
 * c'est ce que dit le commentaire de `ModeDetaille.tsx`, qui porte le bouton.
 */
export const CLE_DETAIL = 'lv-mesure-detail'

const INACTIVITE_MS = 30 * 60 * 1000

/**
 * Garde-fou : au-delà, les points en attente d'envoi sont jetés. L'envoi se
 * fait tous les 200 points ; on n'atteint ce plafond que si le réseau est
 * coupé, et mieux vaut alors perdre une trace que remplir la mémoire.
 */
const TRACES_EN_ATTENTE = 1000

export type Evenement = {
  kind: 'page' | 'sortie' | 'click' | 'event'
  path: string
  target?: string
  label?: string
  zone?: string
  query?: string
  source?: string
  name?: string
  value?: number
  ms?: number
  scroll?: number
  x?: number
  y?: number
  w?: number
  h?: number
  device: string
  visit: string
  /**
   * Instant du geste, horloge du navigateur. Il ne part pas tel quel : à
   * l'envoi, il devient un âge (« il y a 800 ms »), que le serveur retranche
   * de sa propre heure. L'horloge d'un téléphone peut avoir des minutes
   * d'écart ; un âge, lui, ne dépend d'aucune horloge. Sans cela, tous les
   * gestes d'un même envoi recevaient la même heure d'enregistrement, et le
   * fil d'une visite ne savait plus dans quel ordre ils avaient eu lieu.
   */
  quand?: number
}

export type Trace = {
  visit: string
  path: string
  /** move · down · scroll — voir `VisitTrace.kind` dans le schéma. */
  kind: 'move' | 'down' | 'scroll'
  quand?: number
  t: number
  x: number
  y: number
  w: number
  h: number
  doc: number
}

let file: Evenement[] = []
let traces: Trace[] = []
let minuteur: ReturnType<typeof setTimeout> | null = null

/* -------------------------------------------------------------------------- */
/* Refus, mode détaillé                                                       */
/* -------------------------------------------------------------------------- */

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

/** Ce navigateur enregistre-t-il la trace fine ? */
export function modeDetaille(): boolean {
  return lire(CLE_DETAIL) === '1'
}

/**
 * Rien ne doit être mesuré.
 *
 * Le mode détaillé passe devant tout le reste, y compris devant le refus posé
 * par le back-office : quelqu'un qui allume l'enregistrement sur son propre
 * navigateur demande explicitement à être enregistré, et serait très surpris
 * de ne rien trouver ensuite parce qu'il s'était connecté à l'administration.
 */
export function refuse(): boolean {
  /*
    Une page affichée dans un cadre n'est pas une visite : c'est le
    back-office qui la montre (carte des clics, rejeu). Sans cette ligne,
    chaque ouverture de la carte compterait une visite de plus — et, mode
    détaillé allumé, enregistrerait la trace de l'exploitant qui regarde la
    carte au lieu de celle d'un visiteur.
  */
  try {
    if (window.top !== window.self) return true
  } catch {
    return true
  }
  if (modeDetaille()) return false
  if (lire(CLE_REFUS) === '1') return true
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.webdriver === true || nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

/* -------------------------------------------------------------------------- */
/* Visite, écran                                                              */
/* -------------------------------------------------------------------------- */

type Memoire = { id: string; t: number; s?: string }

/**
 * Le numéro de la visite en cours, sans en créer ni prolonger aucune.
 *
 * Pour la discussion en direct : l'équipe peut rouvrir le parcours du
 * visiteur qui lui écrit. Rien si le visiteur refuse la mesure — sa question
 * n'a pas à rattacher un parcours qu'il a demandé de ne pas enregistrer.
 */
export function visiteEnCours(): string | null {
  try {
    if (refuse()) return null
    const brut = sessionStorage.getItem(CLE_VISITE)
    const v = brut ? (JSON.parse(brut) as Memoire) : null
    return v && Date.now() - v.t < INACTIVITE_MS ? v.id : null
  } catch {
    return null
  }
}

/** Le numéro de visite, et s'il vient d'être créé (première page de la visite). */
export function visite(): { id: string; nouvelle: boolean } {
  const maintenant = Date.now()
  try {
    const brut = sessionStorage.getItem(CLE_VISITE)
    const v = brut ? (JSON.parse(brut) as Memoire) : null
    if (v && maintenant - v.t < INACTIVITE_MS) {
      sessionStorage.setItem(CLE_VISITE, JSON.stringify({ ...v, t: maintenant }))
      return { id: v.id, nouvelle: false }
    }
    const id = crypto.randomUUID()
    sessionStorage.setItem(CLE_VISITE, JSON.stringify({ id, t: maintenant }))
    return { id, nouvelle: true }
  } catch {
    return { id: 'sans-stockage', nouvelle: false }
  }
}

/**
 * Garder la provenance pour toute la visite.
 *
 * Elle n'est connue qu'à la première page (c'est là qu'il y a un `gclid` ou
 * une page précédente). Le formulaire de commande, lui, arrive bien plus tard
 * et doit pouvoir la recopier dans la commande : d'où ce rangement, dans le
 * même objet d'onglet que le numéro de visite, oublié en même temps que lui.
 */
export function noterProvenance(source: string) {
  try {
    const brut = sessionStorage.getItem(CLE_VISITE)
    const v = brut ? (JSON.parse(brut) as Memoire) : null
    if (!v) return
    sessionStorage.setItem(CLE_VISITE, JSON.stringify({ ...v, s: source.slice(0, 80) }))
  } catch {}
}

/** La provenance de la visite en cours, si elle a été notée. */
export function provenance(): string | null {
  try {
    const brut = sessionStorage.getItem(CLE_VISITE)
    const v = brut ? (JSON.parse(brut) as Memoire) : null
    return v?.s ?? null
  } catch {
    return null
  }
}

export function ecran(): string {
  const l = window.innerWidth
  return l < 640 ? 'mobile' : l < 1024 ? 'tablette' : 'ordinateur'
}

export const court = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, n) : undefined
}

/* -------------------------------------------------------------------------- */
/* Envoi                                                                      */
/* -------------------------------------------------------------------------- */

export function envoyer() {
  if (file.length === 0 && traces.length === 0) return
  const maintenant = Date.now()
  const age = ({ quand, ...reste }: { quand?: number }) => ({
    ...reste,
    age: quand ? Math.max(0, maintenant - quand) : 0,
  })
  const lot = file.splice(0, 60).map(age)
  // Les traces partent par paquets plus gros : elles sont minuscules, et un
  // mouvement de souris en produit des dizaines par seconde avant
  // échantillonnage.
  const lotTraces = traces.splice(0, 400).map(age)
  const corps = JSON.stringify({ events: lot, traces: lotTraces })
  const ok = navigator.sendBeacon?.('/api/mesure', new Blob([corps], { type: 'application/json' }))
  if (!ok) {
    void fetch('/api/mesure', {
      method: 'POST',
      body: corps,
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    }).catch(() => {})
  }
  // Il peut rester de quoi remplir un deuxième envoi (longue visite détaillée).
  if (file.length > 0 || traces.length > 0) {
    if (minuteur) clearTimeout(minuteur)
    minuteur = setTimeout(envoyer, 1200)
  }
}

export function ajouter(e: Evenement, toutDeSuite = false) {
  file.push({ ...e, quand: e.quand ?? Date.now() })
  if (minuteur) clearTimeout(minuteur)
  // Un clic sur un lien peut quitter la page : on envoie sans attendre.
  if (toutDeSuite || file.length >= 20) envoyer()
  else minuteur = setTimeout(envoyer, 1000)
}

export function ajouterTrace(t: Trace) {
  if (traces.length >= TRACES_EN_ATTENTE) return
  traces.push({ ...t, quand: t.quand ?? Date.now() })
  if (traces.length >= 200) envoyer()
}

/* -------------------------------------------------------------------------- */
/* L'appel que fait le reste du site                                          */
/* -------------------------------------------------------------------------- */

export type DetailsEvenement = {
  /** Précision libre : le produit, le résultat, la raison. Nettoyée ici. */
  label?: string | null
  /** Prix en centimes, quantité, nombre de résultats. */
  value?: number | null
  /** Partie de la page d'où vient le geste, si elle est connue. */
  zone?: string | null
  /** Position du geste dans la page entière, pour la carte des clics. */
  x?: number
  y?: number
  /** Envoyer tout de suite : le geste fait quitter la page. */
  urgent?: boolean
}

/**
 * « Ceci vient de se produire. »
 *
 * Appelée depuis n'importe quel composant client, après coup, quand le
 * résultat est connu : `mesurer('ajout-panier', { value: prixCents })` n'est
 * émis que si l'ajout a réellement abouti.
 *
 * Ne lève jamais : une mesure qui casserait un ajout au panier serait un
 * comble.
 */
export function mesurer(nom: NomEvenement, details: DetailsEvenement = {}) {
  try {
    if (refuse()) return
    const chemin = cheminSansIdentifiant(location.pathname)
    ajouter(
      {
        kind: 'event',
        path: chemin,
        name: nom,
        label: libelleSansDonneePerso(chemin, court(details.label, 80)),
        value:
          typeof details.value === 'number' && Number.isFinite(details.value)
            ? Math.round(details.value)
            : undefined,
        zone: court(details.zone, 60),
        x: details.x,
        y: details.y,
        w: window.innerWidth,
        h: window.innerHeight,
        device: ecran(),
        visit: visite().id,
      },
      details.urgent ?? false,
    )
  } catch {
    /* la mesure ne doit jamais gêner la navigation */
  }
}
