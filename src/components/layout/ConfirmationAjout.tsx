'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from '@/components/ui/Image'
import { IconCart, IconCheck, IconClose } from '@/components/ui/icons'
import { EVENEMENT_AJOUT_PANIER, type AnnonceAjoutPanier } from '@/lib/annonce-ajout-panier'

/** Le temps de lire, de choisir — puis la confirmation s'efface d'elle-même. */
const DUREE_AFFICHAGE_MS = 12_000

type AnnonceAffichee = AnnonceAjoutPanier & {
  /** Change à chaque ajout : relance l'animation et le minuteur. */
  cle: number
  /** La page où l'ajout a eu lieu : la confirmation ne la suit pas ailleurs. */
  chemin: string
}

/**
 * Confirmation d'ajout au panier, à l'écran, quel que soit le bouton utilisé.
 *
 * Posée une fois pour toute la boutique (DecorBoutique). Elle écoute
 * `annoncerAjoutPanier` (lib/annonce-ajout-panier.ts) et s'affiche :
 *
 * - sur téléphone, en bas de l'écran, PAR-DESSUS la barre « Ajouter au
 *   panier » et la bulle de discussion — c'est là que le doigt vient
 *   d'appuyer, donc là que le client regarde ;
 * - sur ordinateur, en bas à droite, au-dessus de la barre fixe.
 *
 * Deux sorties évidentes : « Voir le panier » et « Commander ». Elle ne prend
 * pas le focus (le client peut continuer à lire) mais elle est annoncée aux
 * lecteurs d'écran, et Échap la ferme.
 */
export function ConfirmationAjout() {
  const chemin = usePathname()
  const [annonce, setAnnonce] = useState<AnnonceAffichee | null>(null)

  useEffect(() => {
    function surAjout(evenement: Event) {
      const detail = (evenement as CustomEvent<AnnonceAjoutPanier>).detail
      if (!detail?.titre) return
      setAnnonce({ ...detail, cle: Date.now(), chemin: window.location.pathname })
    }
    window.addEventListener(EVENEMENT_AJOUT_PANIER, surAjout)
    return () => window.removeEventListener(EVENEMENT_AJOUT_PANIER, surAjout)
  }, [])

  useEffect(() => {
    if (!annonce) return
    const minuteur = window.setTimeout(() => setAnnonce(null), DUREE_AFFICHAGE_MS)
    function surTouche(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') setAnnonce(null)
    }
    window.addEventListener('keydown', surTouche)
    return () => {
      window.clearTimeout(minuteur)
      window.removeEventListener('keydown', surTouche)
    }
  }, [annonce])

  // Après un changement de page (vers le panier, par exemple), plus rien à confirmer.
  const visible = annonce !== null && annonce.chemin === chemin
  const quantite = annonce?.quantite ?? 1

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--hauteur-bandeau,0px)+12px+env(safe-area-inset-bottom,0px))] z-40 fiche:inset-x-auto fiche:right-6 fiche:bottom-[calc(var(--hauteur-bandeau,0px)+96px)] fiche:w-[380px]"
    >
      {visible && annonce ? (
        <div
          key={annonce.cle}
          data-zone="Confirmation d’ajout"
          className="pointer-events-auto rounded-2xl border border-line bg-white p-4 shadow-[0_18px_50px_rgb(17_18_20/0.28)] motion-safe:animate-[invitation-chat_220ms_ease-out]"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok text-white">
              <IconCheck className="size-4" strokeWidth={2.5} />
            </span>
            <p className="min-w-0 flex-1 text-[16px] font-extrabold text-ink">Ajouté au panier</p>
            <button
              type="button"
              onClick={() => setAnnonce(null)}
              aria-label="Fermer et continuer mes achats"
              className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-paper"
            >
              <IconClose className="size-[18px]" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {annonce.image ? (
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-[#f2f2f2]">
                <Image src={annonce.image.url} alt="" fill sizes="48px" className="object-cover" />
              </span>
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-paper">
                <IconCart className="size-5 text-brand" />
              </span>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-[14px] leading-snug font-semibold text-ink">
                {quantite > 1 ? `${quantite} × ` : null}
                {annonce.titre}
              </p>
              {annonce.livraison ? (
                <p className="mt-0.5 text-[12.5px] leading-snug text-[#1f5a39]">{annonce.livraison}</p>
              ) : null}
            </div>
          </div>

          {annonce.note ? <p className="mt-2 text-[12.5px] leading-snug text-muted-strong">{annonce.note}</p> : null}

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Link
              href="/panier"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong bg-white px-3 text-[15px] font-bold text-ink hover:bg-surface-paper"
            >
              Voir le panier
            </Link>
            <Link
              href="/commande"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-3 text-[15px] font-bold text-white hover:bg-brand-dark"
            >
              Commander
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setAnnonce(null)}
            className="mt-2 w-full py-1.5 text-center text-[13px] font-semibold text-muted-strong underline underline-offset-2 hover:text-ink"
          >
            Continuer mes achats
          </button>
        </div>
      ) : null}
    </div>
  )
}
