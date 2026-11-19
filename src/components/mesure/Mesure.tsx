'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ETAPES_SIGNALEES,
  cheminSansIdentifiant,
  libelleSansDonneePerso,
  sourceDeLaVisite,
} from '@/lib/mesure-chemins'
import { estUnEvenement } from '@/lib/mesure-evenements'
import {
  CLE_REFUS,
  ajouter,
  ajouterTrace,
  court,
  ecran,
  envoyer,
  mesurer,
  modeDetaille,
  noterProvenance,
  refuse,
  visite,
} from './file'

/**
 * Mesure d'audience anonyme : pages vues, temps passé, défilement, clics,
 * gestes métier et signaux de gêne — pour voir où les visiteurs vont, ce
 * qu'ils font, et où ils s'arrêtent (demande de l'exploitant pour le
 * lancement, 10 novembre 2026 ; approfondie le 19 novembre 2026, après quoi
 * le premier relevé a montré 1,4 page par visite et 2 paniers sur 171
 * visites : les totaux ne disaient pas pourquoi).
 *
 * Faite pour rester dans l'exemption de consentement de la CNIL (mesure
 * d'audience strictement anonyme, propre au site) :
 * - aucun cookie : un numéro de visite tiré au hasard, gardé dans l'onglet
 *   (sessionStorage) et oublié à sa fermeture ou après 30 min d'inactivité ;
 * - ni adresse IP, ni compte, ni navigateur enregistrés : seulement la
 *   catégorie d'écran (mobile, tablette, ordinateur) et la taille de fenêtre,
 *   qui sert à replacer les clics sur la page ;
 * - aucun service extérieur : tout part vers /api/mesure ;
 * - le visiteur peut refuser (page Cookies), et « Do Not Track » / « Global
 *   Privacy Control » sont respectés ;
 * - aucun numéro de commande, de facture ni jeton dans les chemins, et aucun
 *   texte cliqué qui pourrait désigner quelqu'un (lib/mesure-chemins.ts) ;
 * - des formulaires, on retient le NOM du dernier champ touché, jamais ce qui
 *   y a été tapé.
 * L'équipe n'est pas comptée : ouvrir le back-office pose le refus sur son
 * navigateur (AdminSansMesure).
 *
 * **Le mode détaillé est à part.** La trace fine du pointeur ne s'enregistre
 * que sur un navigateur où l'exploitant l'a allumée depuis le back-office
 * (voir `file.ts` et `ModeDetaille.tsx`). Elle ne tourne chez aucun visiteur.
 */

export { CLE_REFUS }

/** Trois clics au même endroit en moins d'une seconde : de l'agacement. */
const RAGE_MS = 900
const RAGE_PX = 40

/** Un mouvement de pointeur enregistré au plus tous les 150 ms. */
const TRACE_MS = 150

/** Un défilement enregistré au plus tous les 200 ms. */
const DEFILEMENT_MS = 200

/**
 * Au-delà, la trace d'une page s'arrête : 2 000 points, c'est cinq minutes
 * de mouvement continu, et elle a déjà tout dit.
 */
const TRACES_PAR_PAGE = 2000

/**
 * La dernière page vue émise, pour ne pas l'émettre deux fois.
 *
 * Le mode strict de React monte, démonte et remonte chaque composant en
 * développement : sans ce garde-fou, chaque page compte double sur le poste
 * de développement, et le fil d'une visite montre deux fois la même page.
 * Une même adresse revue moins d'une seconde plus tard n'est pas une
 * nouvelle visite de la page.
 */
let dernierePage: { visit: string; chemin: string; t: number } | null = null

const INTERACTIF =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [contenteditable="true"]'

/** Ce qu'on s'attend à voir réagir quand on le touche, et qui parfois ne réagit pas. */
const CLIQUABLE_EN_APPARENCE = 'img, picture, figure, svg, video, canvas, h1, h2, h3, h4'

/** Où se trouvait l'élément : une zone nommée, sinon le titre de la section. */
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
      if (u.origin === location.origin) {
        return (
          cheminSansIdentifiant(u.pathname) +
          (u.hash && u.pathname === location.pathname ? u.hash : '')
        )
      }
      return u.protocol === 'mailto:' ? 'e-mail' : u.protocol === 'tel:' ? 'téléphone' : u.hostname
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Le nom d'un champ de formulaire — jamais ce qu'il contient.
 *
 * L'attribut `name` est déjà parlant dans ce site (`shipping.postalCode`,
 * `acceptTerms`) et c'est lui qu'on garde en premier. À défaut, l'étiquette
 * affichée, qui ne contient pas de donnée saisie non plus.
 */
function nomDuChamp(el: Element): string | undefined {
  const champ = el as HTMLInputElement
  if (champ.name) return court(champ.name, 60)
  if (champ.id) {
    const etiquette = document.querySelector(`label[for="${CSS.escape(champ.id)}"]`)
    if (etiquette?.textContent) return court(etiquette.textContent, 60)
    return court(champ.id, 60)
  }
  const parent = el.closest('label')
  if (parent?.textContent) return court(parent.textContent, 60)
  return court(champ.type, 30)
}

/** Ce qu'on dit d'un élément cliqué qui n'a pas réagi. */
function descriptionDe(el: Element): string | undefined {
  const alt = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('aria-label')
  if (alt) return court(alt, 80)
  const texte = court((el as HTMLElement).innerText, 80)
  if (texte) return texte
  return court(el.tagName.toLowerCase(), 30)
}

export function Mesure() {
  const pathname = usePathname()
  const params = useSearchParams()

  /* ---------------- Temps passé et défilement, page par page --------------- */

  // Gardés hors du rendu : ils changent des dizaines de fois par seconde et
  // ne doivent jamais provoquer de rendu.
  const depuis = useRef<number | null>(null)
  const cumul = useRef(0)
  const profondeur = useRef(0)
  const arrivee = useRef(0)
  const champ = useRef<string | null>(null)
  const envoye = useRef(false)

  // Page vue.
  useEffect(() => {
    if (refuse()) return
    const v = visite()
    // La provenance n'est notée qu'à la première page de la visite.
    const source = v.nouvelle
      ? sourceDeLaVisite(params, document.referrer, location.origin)
      : undefined
    // Gardée pour toute la visite : la commande, qui arrive bien plus tard,
    // la recopiera (voir `noterProvenance`).
    if (source) noterProvenance(source)
    // Une page peut signaler une étape (la commande réellement payée).
    const etape = document.querySelector<HTMLElement>('[data-mesure-etape]')?.dataset.mesureEtape
    const chemin = cheminSansIdentifiant(pathname)

    // Remise à zéro des compteurs de la page qui commence.
    depuis.current = document.visibilityState === 'visible' ? Date.now() : null
    cumul.current = 0
    profondeur.current = 0
    arrivee.current = Date.now()
    champ.current = null
    envoye.current = false

    const maintenant = Date.now()
    const doublon =
      dernierePage !== null &&
      dernierePage.visit === v.id &&
      dernierePage.chemin === chemin &&
      maintenant - dernierePage.t < 1000
    dernierePage = { visit: v.id, chemin, t: maintenant }

    if (!doublon) ajouter({
      kind: 'page',
      path: chemin,
      label: etape && ETAPES_SIGNALEES.has(etape) ? etape : undefined,
      query: pathname === '/recherche' ? court(params.get('q'), 80) : undefined,
      source,
      w: window.innerWidth,
      h: window.innerHeight,
      device: ecran(),
      visit: v.id,
    })

    /**
     * Ce qu'on a retenu de la page, au moment de la quitter.
     *
     * Émis en plusieurs morceaux s'il le faut : chaque fois que l'onglet passe
     * à l'arrière-plan, le temps accumulé part, et il repart de zéro si le
     * visiteur revient. Le back-office additionne les morceaux d'une même page
     * (`SUM(ms)`) et garde la plus grande profondeur (`MAX(scroll)`). C'est le
     * seul moyen fiable sur téléphone, où `pagehide` n'arrive pas toujours.
     */
    function sortir() {
      if (depuis.current !== null) {
        cumul.current += Date.now() - depuis.current
        depuis.current = null
      }
      // Moins d'une demi-seconde : un rendu double du mode strict, ou un
      // passage éclair. Rien à en dire.
      if (cumul.current < 500) return
      // Un formulaire commencé puis quitté sans envoi : on retient le nom du
      // dernier champ touché, c'est là que ça a coincé.
      if (champ.current && !envoye.current) {
        mesurer('champ-abandonne', { label: champ.current })
        champ.current = null
      }
      ajouter({
        kind: 'sortie',
        path: chemin,
        ms: Math.min(cumul.current, 4 * 3600 * 1000),
        scroll: Math.round(profondeur.current),
        w: window.innerWidth,
        h: window.innerHeight,
        device: ecran(),
        visit: visite().id,
      })
      cumul.current = 0
      envoyer()
    }

    function surVisibilite() {
      if (document.visibilityState === 'hidden') {
        sortir()
      } else {
        depuis.current = Date.now()
      }
    }

    function surDefilement() {
      const hauteur = document.documentElement.scrollHeight
      if (hauteur <= 0) return
      const vue = ((window.scrollY + window.innerHeight) / hauteur) * 100
      if (vue > profondeur.current) profondeur.current = Math.min(100, vue)
    }

    surDefilement()
    document.addEventListener('visibilitychange', surVisibilite)
    window.addEventListener('pagehide', sortir)
    window.addEventListener('scroll', surDefilement, { passive: true })
    window.addEventListener('resize', surDefilement, { passive: true })
    return () => {
      document.removeEventListener('visibilitychange', surVisibilite)
      window.removeEventListener('pagehide', sortir)
      window.removeEventListener('scroll', surDefilement)
      window.removeEventListener('resize', surDefilement)
      // Changement de page interne : la page précédente se termine ici.
      sortir()
    }
  }, [pathname, params])

  /* ------------------- Clics, agacement, clics sans effet ------------------ */

  useEffect(() => {
    let dernier: { x: number; y: number; t: number; n: number; label?: string } | null = null

    function surClic(event: MouseEvent) {
      if (refuse()) return
      const brut = event.target as Element | null
      if (!brut) return
      const el = brut.closest(INTERACTIF)
      const chemin = cheminSansIdentifiant(location.pathname)
      const x = Math.round(event.pageX)
      const y = Math.round(event.pageY)
      const w = window.innerWidth
      const h = window.innerHeight

      /* --- Agacement : trois clics au même endroit en moins d'une seconde --- */
      const maintenant = Date.now()
      if (
        dernier &&
        maintenant - dernier.t < RAGE_MS &&
        Math.abs(x - dernier.x) < RAGE_PX &&
        Math.abs(y - dernier.y) < RAGE_PX
      ) {
        dernier.n += 1
        dernier.t = maintenant
        if (dernier.n === 3) {
          mesurer('clic-rage', {
            label: dernier.label ?? descriptionDe(brut),
            value: 3,
            zone: zoneDe(brut),
            x,
            y,
          })
        }
      } else {
        dernier = { x, y, t: maintenant, n: 1, label: el ? undefined : descriptionDe(brut) }
      }

      /* ------------------------ Un clic sans effet ------------------------- */
      if (!el) {
        // Sélectionner du texte n'est pas un clic manqué.
        const selection = window.getSelection()?.toString() ?? ''
        // Un seul clic manqué par rafale : les suivants sont l'agacement,
        // compté à part.
        if (
          selection.length === 0 &&
          dernier?.n === 1 &&
          brut.closest(CLIQUABLE_EN_APPARENCE) &&
          !brut.closest('[data-mesure-inerte]')
        ) {
          mesurer('clic-mort', { label: descriptionDe(brut), zone: zoneDe(brut), x, y })
        }
        return
      }

      /*
        ------------------- Un geste nommé, posé dans le balisage -------------
        `data-mesure="retrait-panier"` sur un bouton suffit à émettre
        l'événement du même nom. C'est ce qui permet de nommer un geste sur
        une page rendue par le serveur, sans transformer la page en composant
        client pour une seule ligne de mesure. Le nom est validé contre la
        liste close : une faute de frappe ne crée pas un événement fantôme.
      */
      const nomme = el.closest<HTMLElement>('[data-mesure]')
      if (nomme?.dataset.mesure && estUnEvenement(nomme.dataset.mesure)) {
        mesurer(nomme.dataset.mesure, {
          label: nomme.dataset.mesureLabel ?? court((el as HTMLElement).innerText, 80),
          zone: zoneDe(el),
          urgent: el instanceof HTMLAnchorElement,
        })
      }

      /* ------------------------- Le clic lui-même -------------------------- */
      const label = libelleSansDonneePerso(
        location.pathname,
        court(
          el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title'),
          80,
        ),
      )
      const target = cibleDe(el)
      if (!label && !target) return
      ajouter(
        {
          kind: 'click',
          path: chemin,
          target,
          label,
          zone: zoneDe(el),
          x,
          y,
          w,
          h,
          device: ecran(),
          visit: visite().id,
        },
        el instanceof HTMLAnchorElement,
      )
    }

    /* ---------------------- Formulaires : nom des champs ------------------- */

    function surFocus(event: FocusEvent) {
      if (refuse()) return
      const el = event.target as Element | null
      if (!el || !el.matches('input, select, textarea')) return
      if ((el as HTMLInputElement).type === 'hidden') return
      champ.current = nomDuChamp(el) ?? null
    }

    function surEnvoi() {
      envoye.current = true
      champ.current = null
    }

    /*
      Sur une liste déroulante ou un bouton radio, ce qui compte est la valeur
      retenue, pas le fait d'avoir cliqué : un tri changé trois fois ne fait
      qu'un choix. D'où un écouteur de `change` à côté de celui de `click`.
    */
    function surChangement(event: Event) {
      if (refuse()) return
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-mesure]')
      if (!el?.dataset.mesure || !estUnEvenement(el.dataset.mesure)) return
      const cible = event.target as HTMLInputElement | HTMLSelectElement
      const choisi =
        cible instanceof HTMLSelectElement
          ? cible.options[cible.selectedIndex]?.text
          : cible.labels?.[0]?.textContent
      mesurer(el.dataset.mesure, {
        label: el.dataset.mesureLabel ?? court(choisi, 80),
        zone: zoneDe(cible),
      })
    }

    /** Validation du navigateur refusée : le champ en faute est un signal net. */
    function surInvalide(event: Event) {
      if (refuse()) return
      const el = event.target as Element | null
      if (!el) return
      mesurer('erreur-formulaire', { label: nomDuChamp(el) })
    }

    function surRetour() {
      if (refuse()) return
      mesurer('retour-arriere')
    }

    function surDepart() {
      if (document.visibilityState === 'hidden') envoyer()
    }

    document.addEventListener('click', surClic, { capture: true })
    document.addEventListener('focusin', surFocus, { capture: true })
    document.addEventListener('submit', surEnvoi, { capture: true })
    document.addEventListener('change', surChangement, { capture: true })
    document.addEventListener('invalid', surInvalide, { capture: true })
    window.addEventListener('popstate', surRetour)
    document.addEventListener('visibilitychange', surDepart)
    window.addEventListener('pagehide', envoyer)
    return () => {
      document.removeEventListener('click', surClic, { capture: true })
      document.removeEventListener('focusin', surFocus, { capture: true })
      document.removeEventListener('submit', surEnvoi, { capture: true })
      document.removeEventListener('change', surChangement, { capture: true })
      document.removeEventListener('invalid', surInvalide, { capture: true })
      window.removeEventListener('popstate', surRetour)
      document.removeEventListener('visibilitychange', surDepart)
      window.removeEventListener('pagehide', envoyer)
    }
  }, [])

  /* ------------------- Trace du pointeur (mode détaillé) ------------------- */

  useEffect(() => {
    if (!modeDetaille() || refuse()) return
    let points = 0
    let dernierMouvement = 0
    let dernierDefilement = 0
    const chemin = cheminSansIdentifiant(pathname)

    function noter(kind: 'move' | 'down' | 'scroll', x: number, y: number) {
      if (points >= TRACES_PAR_PAGE) return
      points += 1
      ajouterTrace({
        visit: visite().id,
        path: chemin,
        kind,
        t: Math.max(0, Date.now() - arrivee.current),
        x: Math.round(x),
        y: Math.round(y),
        w: window.innerWidth,
        h: window.innerHeight,
        doc: document.documentElement.scrollHeight,
      })
    }

    function surMouvement(event: PointerEvent) {
      const maintenant = Date.now()
      if (maintenant - dernierMouvement < TRACE_MS) return
      dernierMouvement = maintenant
      noter('move', event.pageX, event.pageY)
    }
    // Un appui n'est jamais échantillonné : c'est le geste qu'on veut voir.
    function surAppui(event: PointerEvent) {
      noter('down', event.pageX, event.pageY)
    }
    function surDefilement() {
      const maintenant = Date.now()
      if (maintenant - dernierDefilement < DEFILEMENT_MS) return
      dernierDefilement = maintenant
      noter('scroll', 0, window.scrollY)
    }

    // Position de départ de la fenêtre : un rejeu doit savoir d'où il part.
    noter('scroll', 0, window.scrollY)
    window.addEventListener('pointermove', surMouvement, { passive: true })
    window.addEventListener('pointerdown', surAppui, { passive: true })
    window.addEventListener('scroll', surDefilement, { passive: true })
    return () => {
      window.removeEventListener('pointermove', surMouvement)
      window.removeEventListener('pointerdown', surAppui)
      window.removeEventListener('scroll', surDefilement)
      // Dernière position, pour que le rejeu ne s'arrête pas avant la fin.
      noter('scroll', 0, window.scrollY)
      envoyer()
    }
  }, [pathname])

  return null
}

/**
 * Posé dans le back-office : l'équipe n'est pas comptée dans la mesure.
 *
 * Sauf si le mode détaillé est allumé sur ce navigateur — c'est alors un choix
 * explicite de l'exploitant, qui veut précisément se voir dans la mesure pour
 * la mettre au point. Ce cas est traité par `refuse()` dans `file.ts`.
 */
export function AdminSansMesure() {
  useEffect(() => {
    try {
      localStorage.setItem(CLE_REFUS, '1')
    } catch {}
  }, [])
  return null
}
