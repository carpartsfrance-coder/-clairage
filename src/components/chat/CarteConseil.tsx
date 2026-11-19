'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from '@/components/ui/Image'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import type { CarteProduit } from '@/lib/chat'
import { mesurer } from '@/components/mesure/file'
import { IconCart, IconCheck } from '@/components/ui/icons'

/**
 * L'article conseillé par l'équipe, dans la discussion : photo, prix, stock,
 * et le bouton qui transforme le conseil en ajout au panier sans quitter la
 * page. C'est le moment précis où une discussion devient une vente.
 *
 * Prix et stock sont ceux du jour (relus à chaque relecture de la
 * discussion), et l'ajout passe par la même action que la fiche produit :
 * mêmes contrôles de stock, même panier. Le bouton est rouge comme partout
 * où l'on achète — c'est ici le seul geste d'achat de la fenêtre.
 */
export function CarteConseil({ carte }: { carte: CarteProduit }) {
  const router = useRouter()
  const [ajoute, setAjoute] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function ajouter() {
    demarrer(async () => {
      setErreur(null)
      const r = await addToCart({ variantId: carte.variantId, quantity: 1 })
      if (!r.ok) {
        setErreur(r.error)
        return
      }
      setAjoute(true)
      mesurer('ajout-panier', { label: carte.nom, value: carte.prixCents, zone: 'Discussion' })
      mesurer('chat-conseil-ajoute', { label: carte.nom, value: carte.prixCents })
      // Le compteur du panier, dans l'en-tête, est rendu côté serveur.
      router.refresh()
    })
  }

  return (
    <div className="mt-1.5 w-[88%] max-w-[300px] overflow-hidden rounded-2xl border border-line bg-white">
      <Link href={carte.url} className="flex items-center gap-3 px-3 pt-3 pb-2.5">
        <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-paper">
          {carte.image ? (
            <Image src={carte.image.url} alt="" fill sizes="56px" className="object-cover" />
          ) : null}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 block text-[13.5px] leading-snug font-semibold text-ink">
            {carte.nom}
          </span>
          {carte.option ? (
            <span className="block text-[12px] text-muted-strong">{carte.option}</span>
          ) : null}
          <span className="mt-0.5 block text-[13px]">
            <strong className="text-ink">{formatPrice(carte.prixCents)}</strong>
            <span className={carte.achetable ? 'text-ok' : 'text-muted'}> · {carte.dispo}</span>
          </span>
        </span>
      </Link>

      <div className="border-t border-line px-3 py-2.5">
        {ajoute ? (
          <p className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold text-ok">
              <IconCheck className="size-4" />
              Ajouté au panier
            </span>
            <Link href="/panier" className="font-semibold underline underline-offset-4">
              Voir le panier
            </Link>
          </p>
        ) : (
          <button
            type="button"
            onClick={ajouter}
            disabled={!carte.achetable || enCours}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[14px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb]"
          >
            <IconCart className="size-[18px] shrink-0" />
            {enCours ? 'Ajout…' : carte.achetable ? 'Ajouter au panier' : 'Indisponible'}
          </button>
        )}
        {erreur ? (
          <p role="alert" className="mt-1.5 text-[12px] text-danger">
            {erreur}
          </p>
        ) : null}
      </div>
    </div>
  )
}
