'use client'

import { useEffect, useState } from 'react'
import {
  EVENEMENT_CONSENTEMENT,
  choixEnregistre,
  enregistrerChoix,
  refusDuNavigateur,
  type Choix,
} from './accord'

/**
 * Le réglage de la page /cookies : revenir sur son accord publicitaire.
 *
 * Retirer son accord doit être aussi simple que de le donner — c'est la
 * condition pour que l'accord vaille quelque chose. Un seul bouton, qui dit
 * l'état courant et ce qu'il va faire, comme `RefusMesure` juste au-dessus.
 *
 * Quand le navigateur refuse pour le visiteur (« Global Privacy Control »,
 * « Do Not Track »), le bouton disparaît : il n'y a rien à régler, le signal
 * du navigateur l'emporte et c'est à lui qu'il faut toucher.
 */
export function ChoixConsentement() {
  const [etat, setEtat] = useState<Choix | 'aDemander' | 'navigateur' | null>(null)

  useEffect(() => {
    const lire = () =>
      setEtat(refusDuNavigateur() ? 'navigateur' : (choixEnregistre() ?? 'aDemander'))
    lire()
    window.addEventListener(EVENEMENT_CONSENTEMENT, lire)
    window.addEventListener('storage', lire)
    return () => {
      window.removeEventListener(EVENEMENT_CONSENTEMENT, lire)
      window.removeEventListener('storage', lire)
    }
  }, [])

  if (etat === null) return null

  if (etat === 'navigateur') {
    return (
      <p>
        Votre navigateur demande à ne pas être pisté, et nous le respectons : aucune mesure
        publicitaire n’a lieu sur ce navigateur, et aucun accord ne vous est demandé.
      </p>
    )
  }

  const accepte = etat === 'accepte'
  return (
    <p>
      {accepte
        ? 'Vous avez accepté la mesure publicitaire sur ce navigateur. '
        : etat === 'refuse'
          ? 'Vous avez refusé la mesure publicitaire sur ce navigateur. '
          : 'Nous ne mesurons pas encore la publicité sur ce navigateur : le bandeau vous posera la question. '}
      <button
        type="button"
        onClick={() => enregistrerChoix(accepte ? 'refuse' : 'accepte')}
        className="font-semibold underline underline-offset-2"
      >
        {accepte ? 'Retirer mon accord' : 'Donner mon accord'}
      </button>
    </p>
  )
}
