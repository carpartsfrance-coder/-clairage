'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Fine barre rouge en haut de l'écran, du clic jusqu'à l'arrivée de la page.
 *
 * **Pourquoi.** Les pages sont rendues sur le serveur à chaque visite : entre
 * le clic et l'affichage passent quelques centaines de millisecondes pendant
 * lesquelles rien ne bougeait à l'écran. Le visiteur se demandait si son clic
 * avait été pris, et recliquait.
 *
 * **Pourquoi pas `loading.tsx`.** Une silhouette de chargement aurait été plus
 * parlante, mais elle fait partir la réponse avant que la page sache si elle
 * existe : une fiche retirée répondrait alors « 200 » au lieu de « 404 »
 * (documentation de Next, « Status codes »). Avec des milliers de fiches
 * retirées de la vente que Google va revisiter, un vrai 404 compte. La barre,
 * elle, ne touche pas à la réponse du serveur.
 *
 * Elle démarre au clic sur un lien interne qui change de page, avance seule
 * en ralentissant, et se termine quand l'adresse a changé. Un garde-fou la
 * retire si la navigation n'aboutit pas.
 */
export function BarreDeNavigation() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [etat, setEtat] = useState<'repos' | 'en-cours' | 'fin'>('repos')
  const garde = useRef<ReturnType<typeof setTimeout> | null>(null)

  // L'adresse a changé : la page est là.
  useEffect(() => {
    setEtat((precedent) => (precedent === 'en-cours' ? 'fin' : precedent))
  }, [pathname, searchParams])

  // Fin de l'animation de sortie.
  useEffect(() => {
    if (etat !== 'fin') return
    const t = setTimeout(() => setEtat('repos'), 300)
    return () => clearTimeout(t)
  }, [etat])

  useEffect(() => {
    function auClic(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const lien = (event.target as Element | null)?.closest?.('a')
      if (!lien || !lien.href || lien.target === '_blank' || lien.hasAttribute('download')) return

      const cible = new URL(lien.href, window.location.href)
      if (cible.origin !== window.location.origin) return
      // Même page (ou simple ancre) : rien ne va se charger.
      if (cible.pathname === window.location.pathname && cible.search === window.location.search) {
        return
      }

      setEtat('en-cours')
      if (garde.current) clearTimeout(garde.current)
      garde.current = setTimeout(() => setEtat('repos'), 15000)
    }

    document.addEventListener('click', auClic, true)
    return () => {
      document.removeEventListener('click', auClic, true)
      if (garde.current) clearTimeout(garde.current)
    }
  }, [])

  if (etat === 'repos') return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className={
          'h-full w-full origin-left bg-brand ' +
          (etat === 'en-cours'
            ? 'animate-[navigation-en-cours_8s_cubic-bezier(0.1,0.6,0.2,1)_forwards] motion-reduce:animate-none'
            : 'opacity-0 transition-opacity duration-300')
        }
      />
    </div>
  )
}
