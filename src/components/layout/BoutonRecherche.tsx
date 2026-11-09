'use client'

import { useEffect } from 'react'
import { IconSearch } from '@/components/ui/icons'

/**
 * Loupe du header mobile (demande de l'exploitant, 9 novembre 2026 : « le
 * haut de l'écran est trop chargé » sur téléphone).
 *
 * Arrivée sur la page : la grande barre de recherche est affichée, comme
 * avant. Dès qu'on défile, elle se replie et cette loupe prend sa place dans
 * la ligne du logo : le header collant passe de ~108 px à ~53 px pendant toute
 * la lecture. Un appui sur la loupe rouvre la barre et y place le curseur
 * (le clavier s'ouvre dans le même geste, ce qu'iOS n'accepte que si le focus
 * est donné pendant l'appui).
 *
 * L'état « ouverte » est un attribut `data-recherche` posé sur le `<header>` :
 * la barre et la loupe le lisent en CSS, sans rendre le header client.
 */
export function BoutonRecherche({ cible }: { cible: string }) {
  useEffect(() => {
    const zone = document.getElementById(cible)
    const header = zone?.closest('header')
    if (!zone || !header) return
    // La barre se referme quand on la quitte (appui ailleurs, clavier fermé).
    function quitter(event: FocusEvent) {
      if (event.relatedTarget instanceof Node && zone!.contains(event.relatedTarget)) return
      window.setTimeout(() => {
        if (!zone!.contains(document.activeElement)) header!.removeAttribute('data-recherche')
      }, 150)
    }
    zone.addEventListener('focusout', quitter)
    return () => zone.removeEventListener('focusout', quitter)
  }, [cible])

  return (
    <button
      type="button"
      aria-label="Rechercher"
      onClick={(event) => {
        const header = event.currentTarget.closest('header')
        header?.setAttribute('data-recherche', '')
        document.querySelector<HTMLInputElement>(`#${cible} input`)?.focus()
      }}
      className="touch-cible hidden size-10 place-items-center rounded-sm text-[#343434] transition-colors hover:text-brand [header[data-scrolled]:not([data-recherche])_&]:grid"
    >
      <IconSearch className="size-[23px]" />
    </button>
  )
}
