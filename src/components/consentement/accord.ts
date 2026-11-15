'use client'

import { GOOGLE_ADS_ID } from '@/lib/google-ads'
import { CLE_REFUS } from '@/components/mesure/Mesure'

/**
 * Le consentement publicitaire : ce qu'on retient du visiteur, et ce qu'on
 * annonce à Google avant tout chargement.
 *
 * **Pourquoi un consentement ici, alors que la mesure maison n'en demande
 * pas.** La mesure d'audience du site tient dans l'exemption de la CNIL :
 * anonyme, sans cookie, sans service extérieur (components/mesure/Mesure.tsx).
 * La balise Google Ads, elle, est de la mesure publicitaire pour le compte
 * d'un tiers : elle dépose des cookies et envoie les achats à Google, qui s'en
 * sert pour ses propres enchères. Aucune exemption ne couvre cela. Il faut
 * donc un accord préalable, explicite, et aussi facile à refuser qu'à donner.
 *
 * **Les deux ne se mélangent pas.** Le refus de la mesure maison garde sa
 * propre clé (`lv-sans-mesure`) et son propre bouton sur /cookies. Le choix
 * publicitaire a la sienne. Un visiteur qui refuse la publicité continue
 * d'être compté anonymement ; un visiteur qui l'accepte ne change rien à la
 * mesure maison.
 *
 * **Ce qui est chargé, et quand.** Le script de Google n'est demandé
 * **qu'après un accord**. Consent Mode v2 permettrait de le charger tout de
 * suite en « refusé par défaut », mais il continuerait d'envoyer des appels à
 * Google sans accord : ce n'est pas ce que la CNIL accepte. Le refus par
 * défaut est quand même déclaré, dans la file d'attente locale : c'est ce que
 * Google Ads attend pour savoir que la page sait gérer le consentement, et
 * l'ordre « refusé puis accordé » est respecté quand le script arrive enfin.
 */

/** Le choix du visiteur, gardé sur son navigateur. */
export const CLE_CONSENTEMENT = 'lv-consentement'

export type Choix = 'accepte' | 'refuse'

/**
 * Prévient les composants déjà montés qu'un choix vient d'être fait.
 *
 * Sert au cas réel suivant : le visiteur arrive directement sur la page de
 * confirmation, accepte au bandeau une fois la page affichée. Sans ce signal,
 * la conversion de cette commande serait perdue, son envoi ayant déjà été
 * écarté au montage.
 */
export const EVENEMENT_CONSENTEMENT = 'lv-consentement-change'

type FileGoogle = {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

const ACCORDS = {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
} as const

const REFUS = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
} as const

/**
 * Un refus venu du navigateur lui-même, qu'on ne discute pas : « Global
 * Privacy Control », « Do Not Track », ou un navigateur piloté (robot,
 * Lighthouse). Les mêmes signaux écartent déjà la mesure maison.
 *
 * Dans ces trois cas le bandeau ne s'affiche même pas : le visiteur a déjà
 * répondu, lui reposer la question serait au mieux inutile, au pire une façon
 * de ne pas entendre sa réponse.
 */
export function refusDuNavigateur(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.webdriver === true || nav.globalPrivacyControl === true || nav.doNotTrack === '1') {
    return true
  }
  // L'équipe n'est pas comptée : ouvrir le back-office pose ce repère
  // (AdminSansMesure). Une commande passée pour essayer le tunnel ne doit pas
  // remonter comme une vente, pas plus dans Google que dans la mesure maison.
  try {
    return localStorage.getItem(CLE_REFUS) === '1'
  } catch {
    return false
  }
}

/** Le choix déjà fait, ou `null` si la question n'a pas encore été posée. */
export function choixEnregistre(): Choix | null {
  try {
    const v = localStorage.getItem(CLE_CONSENTEMENT)
    return v === 'accepte' || v === 'refuse' ? v : null
  } catch {
    return null
  }
}

/** Garde le choix et le fait savoir, ici et aux autres onglets ouverts. */
export function enregistrerChoix(choix: Choix): void {
  try {
    localStorage.setItem(CLE_CONSENTEMENT, choix)
  } catch {}
  annoncer(choix)
  window.dispatchEvent(new CustomEvent(EVENEMENT_CONSENTEMENT, { detail: choix }))
}

let amorce = false
let dernierAnnonce: Choix | null = null

/**
 * Pose la file d'attente de Google, y déclare le refus par défaut, puis
 * aussitôt la réponse déjà connue du visiteur s'il en a donné une.
 *
 * **L'ordre de la file est tout.** Google lit ces messages dans l'ordre où ils
 * ont été empilés, et un événement posé avant la mise à jour du consentement
 * est traité comme non consenti — c'est-à-dire perdu. Or la conversion d'achat
 * et le bandeau sont deux composants distincts, montés dans un ordre que React
 * décide, pas nous. D'où ce choix : le premier des deux à toucher la file y
 * met le refus par défaut **et** la réponse connue, avant quoi que ce soit
 * d'autre. L'autre n'a plus rien à rattraper.
 *
 * Purement local : rien n'est téléchargé, rien n'est envoyé, rien n'est écrit
 * sur l'appareil. Appelable sans accord, et autant de fois qu'on veut — seul
 * le premier appel pose quelque chose.
 */
export function amorcerFile(): void {
  if (amorce) return
  amorce = true
  const w = window as Window & FileGoogle
  const file = (w.dataLayer ??= [])
  w.gtag ??= (...args: unknown[]) => {
    file.push(args)
  }
  // `wait_for_update` : le temps laissé au bandeau pour répondre avant que
  // Google considère la file comme définitive.
  w.gtag('consent', 'default', { ...REFUS, wait_for_update: 500 })
  const deja = refusDuNavigateur() ? 'refuse' : choixEnregistre()
  if (deja) poser(deja)
  w.gtag('js', new Date())
  w.gtag('config', GOOGLE_ADS_ID)
}

/**
 * La mise à jour elle-même, sans amorçage — la file est supposée posée.
 *
 * Ne répète pas une réponse déjà annoncée : en développement React monte les
 * composants deux fois, et une file qui dirait deux fois la même chose se
 * relirait mal.
 */
function poser(choix: Choix): void {
  if (dernierAnnonce === choix) return
  dernierAnnonce = choix
  const w = window as Window & FileGoogle
  w.gtag?.('consent', 'update', choix === 'accepte' ? ACCORDS : REFUS)
}

/** Dit à Google ce que le visiteur a répondu. */
export function annoncer(choix: Choix): void {
  amorcerFile()
  poser(choix)
}

/** Envoie un message à Google, la file étant à jour du consentement. */
export function envoyer(...args: unknown[]): void {
  amorcerFile()
  const w = window as Window & FileGoogle
  w.gtag?.(...args)
}
