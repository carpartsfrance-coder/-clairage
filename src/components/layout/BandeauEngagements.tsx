'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import {
  IconClock,
  IconHeadset,
  IconReturn,
  IconShield,
  IconTruck,
} from '@/components/ui/icons'

/**
 * Bandeau des engagements, tout en haut de chaque page.
 *
 * Cinq promesses, chacune menant à la page qui la détaille. Le header (serveur)
 * les compose depuis `commercialTerms` et le seuil réglé dans le back-office :
 * ce composant n'en écrit aucune, il ne fait que les montrer.
 *
 * **Ordinateur** : les cinq côte à côte, réparties sur la largeur du contenu.
 * **Téléphone et tablette** : elles ne tiennent pas sur une ligne ; une seule
 * est visible et elles se relaient toutes les quatre secondes. Le relais
 * s'arrête au survol, au focus clavier (l'engagement qui reçoit le focus
 * devient celui qu'on voit), et ne démarre pas du tout si le visiteur a
 * demandé moins d'animations — le premier engagement reste alors affiché.
 *
 * Les cinq restent dans le DOM : un lecteur d'écran les lit toutes, dans
 * l'ordre, quel que soit celui qui est affiché.
 */

export type Engagement = {
  libelle: string
  href: string
  icone: 'expedition' | 'sav' | 'garantie' | 'livraison' | 'retour'
}

const ICONES = {
  expedition: IconClock,
  sav: IconHeadset,
  garantie: IconShield,
  livraison: IconTruck,
  retour: IconReturn,
} as const

const RELAIS_MS = 4000

export function BandeauEngagements({ engagements }: { engagements: Engagement[] }) {
  const [actif, setActif] = useState(0)
  const [enPause, setEnPause] = useState(false)

  useEffect(() => {
    if (enPause || engagements.length < 2) return
    const large = window.matchMedia('(min-width: 1024px)')
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)')
    let minuterie: number | undefined

    const relancer = () => {
      window.clearInterval(minuterie)
      minuterie = undefined
      // Sur grand écran tout est visible : rien à faire tourner.
      if (large.matches || reduit.matches) return
      minuterie = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        setActif((i) => (i + 1) % engagements.length)
      }, RELAIS_MS)
    }

    relancer()
    large.addEventListener('change', relancer)
    reduit.addEventListener('change', relancer)
    return () => {
      window.clearInterval(minuterie)
      large.removeEventListener('change', relancer)
      reduit.removeEventListener('change', relancer)
    }
  }, [enPause, engagements.length])

  return (
    <ul
      aria-label="Nos engagements"
      className="relative h-full lg:flex lg:items-center lg:justify-between lg:gap-6"
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocus={() => setEnPause(true)}
      onBlur={() => setEnPause(false)}
    >
      {engagements.map((engagement, index) => {
        const Icone = ICONES[engagement.icone]
        const visible = index === actif
        return (
          <li
            key={engagement.icone}
            data-actif={visible ? '' : undefined}
            className={cn(
              // Mobile : les engagements sont empilés au même endroit, seul
              // l'actif est opaque. Grand écran : tous en ligne.
              'absolute inset-0 flex items-center justify-center transition-[opacity,translate] duration-300 motion-reduce:transition-none',
              'pointer-events-none translate-y-1 opacity-0',
              'data-actif:pointer-events-auto data-actif:translate-y-0 data-actif:opacity-100',
              'lg:pointer-events-auto lg:static lg:translate-y-0 lg:opacity-100',
            )}
          >
            <Link
              href={engagement.href}
              onFocus={() => setActif(index)}
              className="flex min-w-0 items-center gap-2 rounded-xs whitespace-nowrap transition-opacity hover:opacity-80"
            >
              <Icone className="size-[15px] shrink-0" strokeWidth={1.6} />
              <span className="truncate">{engagement.libelle}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
