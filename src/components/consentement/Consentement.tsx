'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useCallback, useEffect, useState } from 'react'
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

function Bandeau({ onRepondre }: { onRepondre: (choix: Choix) => void }) {
  return (
    <section
      aria-label="Votre accord pour la mesure publicitaire"
      data-zone="Bandeau de consentement"
      /*
        z-40 : au-dessus de la page, mais sous les panneaux (z-50) — un bandeau
        qui recouvrirait les filtres ou le menu mobile serait pire que le mal.
      */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="container-page flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="min-w-0 flex-1 text-[13px] leading-[1.5] text-muted-strong">
          <p>
            <strong className="font-semibold text-slate-ink">
              Mesurer l’efficacité de nos publicités ?
            </strong>{' '}
            Avec votre accord, nous indiquons à Google les commandes venues de ses annonces, pour
            savoir lesquelles valent leur coût. Cela dépose des cookies publicitaires.
          </p>
          <p className="mt-1">
            Sans votre accord, le site fonctionne à l’identique et sa fréquentation reste mesurée
            de façon anonyme, sans cookie.{' '}
            <Link href="/cookies" className="font-semibold underline underline-offset-2">
              En savoir plus
            </Link>
          </p>
        </div>
        {/* Même taille, même niveau : refuser ne coûte pas un clic de plus. */}
        <div className="flex shrink-0 gap-3">
          <Button variant="secondary" className="flex-1 lg:flex-none" onClick={() => onRepondre('refuse')}>
            Refuser
          </Button>
          <Button className="flex-1 lg:flex-none" onClick={() => onRepondre('accepte')}>
            Accepter
          </Button>
        </div>
      </div>
    </section>
  )
}
