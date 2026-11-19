'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GOOGLE_ADS_ID } from '@/lib/google-ads'
import {
  EVENEMENT_CONSENTEMENT,
  amorcerFile,
  annoncer,
  choixEnregistre,
  enregistrerChoix,
  refusDuNavigateur,
  type Choix,
} from './accord'

/**
 * Le bandeau de consentement publicitaire, et le chargement de la balise
 * Google Ads qu'il commande.
 *
 * Posé par `DecorBoutique`, à côté de la mesure maison, et **seulement si
 * l'identifiant de conversion est renseigné** : sans balise à autoriser, pas
 * de question à poser. Le back-office n'en a jamais (il a sa propre mise en
 * page).
 *
 * **Le script de Google n'est demandé qu'après un accord.** C'est tout
 * l'intérêt de ne pas s'en remettre au seul « refusé par défaut » de Consent
 * Mode : un refus, et aucune requête ne part vers googletagmanager.com.
 *
 * **Refuser est aussi facile qu'accepter** : deux boutons de même taille, côte
 * à côte, au même niveau, et le refus est gardé — la question n'est pas
 * reposée à la page suivante. Pas de croix qui ferme sans répondre, pas de
 * bouton « continuer » qui vaut accord. Le choix se change à tout moment sur
 * /cookies.
 */
export function Consentement() {
  // `null` = pas encore lu sur ce navigateur. Rien n'est rendu avant, sinon le
  // serveur et le navigateur n'écriraient pas la même chose.
  const [choix, setChoix] = useState<Choix | 'aDemander' | null>(null)

  useEffect(() => {
    // La file est posée tout de suite, pour que « refusé par défaut » y soit
    // le premier message quoi qu'il arrive ensuite.
    amorcerFile()
    if (refusDuNavigateur()) {
      annoncer('refuse')
      setChoix('refuse')
      return
    }
    const deja = choixEnregistre()
    if (deja) annoncer(deja)
    setChoix(deja ?? 'aDemander')
  }, [])

  // Le choix peut être changé depuis /cookies, ou dans un autre onglet.
  useEffect(() => {
    const surChangement = () => {
      if (refusDuNavigateur()) return
      setChoix(choixEnregistre() ?? 'aDemander')
    }
    window.addEventListener(EVENEMENT_CONSENTEMENT, surChangement)
    window.addEventListener('storage', surChangement)
    return () => {
      window.removeEventListener(EVENEMENT_CONSENTEMENT, surChangement)
      window.removeEventListener('storage', surChangement)
    }
  }, [])

  const repondre = useCallback((reponse: Choix) => {
    enregistrerChoix(reponse)
    setChoix(reponse)
  }, [])

  return (
    <>
      {/*
        Une fois accepté, la balise reste chargée sur toute la navigation :
        `<Script>` dédoublonne par `src`, et un changement de page ne la
        redemande pas.
      */}
      {choix === 'accepte' ? (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ADS_ID)}`}
          strategy="afterInteractive"
        />
      ) : null}

      {choix === 'aDemander' ? <Bandeau onRepondre={repondre} /> : null}
    </>
  )
}

/**
 * Variable CSS qui publie la hauteur du bandeau : `--hauteur-bandeau`.
 *
 * **Pourquoi.** Le bandeau et la barre d'achat collante de la fiche produit
 * sont tous deux posés en bas de l'écran. Mesuré le 19 novembre 2026 sur un
 * téléphone de 375 × 812 : le bandeau faisait 234 px (29 % de l'écran) et
 * recouvrait entièrement la barre « Ajouter au panier » (77 px), tant que le
 * visiteur n'avait pas répondu — et 131 visites sur 171 ne répondaient
 * jamais. La barre lit désormais cette variable pour se poser au-dessus du
 * bandeau, et le bandeau a été resserré sur téléphone.
 *
 * Remise à zéro quand le bandeau disparaît : la barre redescend d'elle-même.
 */
function useHauteurPubliee() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const racine = document.documentElement
    const publier = () =>
      racine.style.setProperty('--hauteur-bandeau', `${Math.round(el.getBoundingClientRect().height)}px`)
    publier()
    const obs = new ResizeObserver(publier)
    obs.observe(el)
    return () => {
      obs.disconnect()
      racine.style.removeProperty('--hauteur-bandeau')
    }
  }, [])
  return ref
}

function Bandeau({ onRepondre }: { onRepondre: (choix: Choix) => void }) {
  const ref = useHauteurPubliee()
  return (
    <section
      ref={ref}
      aria-label="Votre accord pour la mesure publicitaire"
      data-zone="Bandeau de consentement"
      /*
        z-40 : au-dessus de la page, mais sous les panneaux (z-50) — un bandeau
        qui recouvrirait les filtres ou le menu mobile serait pire que le mal.
      */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="container-page flex flex-col gap-2.5 py-3 lg:flex-row lg:items-center lg:gap-8 lg:py-4">
        {/*
          Sur téléphone, une seule phrase : ce qui est demandé, à qui, et que
          le site marche pareil sans. Le détail est sur /cookies. Sur grand
          écran, la place ne manque pas : le texte complet reste.
        */}
        <div className="min-w-0 flex-1 text-[12px] leading-[1.45] text-muted-strong lg:text-[13px] lg:leading-[1.5]">
          <p>
            <strong className="font-semibold text-slate-ink">
              Mesurer l’efficacité de nos publicités ?
            </strong>{' '}
            {/*
              L'empreinte chiffrée de l'e-mail (#156) reste dans la phrase
              courte : c'est une donnée envoyée à Google, elle fait partie de
              ce à quoi on demande d'accorder son accord, sur tous les écrans.
            */}
            Avec votre accord, nous indiquons à Google les commandes venues de ses annonces, avec
            une empreinte chiffrée de votre e-mail
            <span className="hidden lg:inline">, pour savoir lesquelles valent leur coût</span>.
            Cela dépose des cookies publicitaires.
            <span className="lg:hidden">
              {' '}Sans accord, le site fonctionne pareil.{' '}
              <Link href="/cookies" className="font-semibold underline underline-offset-2">
                En savoir plus
              </Link>
            </span>
          </p>
          <p className="mt-1 hidden lg:block">
            Sans votre accord, le site fonctionne à l’identique et sa fréquentation reste mesurée
            de façon anonyme, sans cookie.{' '}
            <Link href="/cookies" className="font-semibold underline underline-offset-2">
              En savoir plus
            </Link>
          </p>
        </div>
        {/* Même taille, même niveau : refuser ne coûte pas un clic de plus. */}
        <div className="flex shrink-0 gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 lg:h-11 lg:flex-none lg:px-5"
            onClick={() => onRepondre('refuse')}
          >
            Refuser
          </Button>
          <Button
            size="sm"
            className="flex-1 lg:h-11 lg:flex-none lg:px-5"
            onClick={() => onRepondre('accepte')}
          >
            Accepter
          </Button>
        </div>
      </div>
    </section>
  )
}
