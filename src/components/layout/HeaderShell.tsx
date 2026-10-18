'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Enveloppe du header : elle ne sait qu'une chose, si la page est défilée.
 *
 * Le header reste un composant serveur — c'est lui qui lit le véhicule et le
 * panier. Seul cet état d'affichage a besoin du navigateur, et il est isolé
 * ici pour que le reste n'ait pas à devenir client.
 *
 * L'information est posée en attribut (`data-scrolled`) plutôt qu'en classes :
 * la mise en forme reste entièrement dans les composants, et chaque étage du
 * header décide lui-même de ce qu'il devient — le bandeau de réassurance
 * disparaît, la ligne principale et la navigation se resserrent.
 *
 * Deux précautions :
 *
 *  - un **seuil** (et non « dès le premier pixel ») et une **hystérésis** :
 *    replier le header raccourcit la page, ce qui remonte le contenu sous le
 *    curseur. Avec un seuil unique, un défilement qui s'arrête juste dessus
 *    ferait clignoter le header. Les deux bornes sont donc écartées ;
 *  - une lecture dans `requestAnimationFrame` : l'écouteur est passif et ne
 *    lit la position qu'une fois par image, pas à chaque événement.
 */

/** Au-delà : header replié. */
const SEUIL_REPLI = 96
/** En deçà : header déplié. Écart volontaire avec le seuil de repli. */
const SEUIL_DEPLI = 32

export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const ticking = useRef(false)

  useEffect(() => {
    function lire() {
      ticking.current = false
      const y = window.scrollY
      setScrolled((etait) => (etait ? y > SEUIL_DEPLI : y > SEUIL_REPLI))
    }

    function onScroll() {
      if (ticking.current) return
      ticking.current = true
      window.requestAnimationFrame(lire)
    }

    // Lecture immédiate : on peut arriver sur la page déjà défilée (retour
    // arrière, ancre, rechargement en cours de page).
    lire()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      data-scrolled={scrolled ? 'true' : undefined}
      className="group/header sticky top-0 z-40 bg-white"
    >
      {children}
    </header>
  )
}
