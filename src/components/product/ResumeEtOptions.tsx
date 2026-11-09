'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import type { PackComplementaire } from '@/lib/queries/packs-complementaires'
import { IconCheck, IconPlus } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Colonne d'achat plus fournie, comme chez le concurrent (demande de
 * l'exploitant, 9 novembre 2026) : à droite des photos, la référence, un
 * résumé avec « Voir la description complète », puis les autres emplacements
 * du même véhicule à ajouter d'un clic (« Feux de route — Ajouter + »).
 */

export function ResumeFiche({ reference, resume }: { reference: string | null; resume: string | null }) {
  if (!reference && !resume) return null
  return (
    <div className="order-3 mt-4">
      {reference ? (
        <p className="text-[13px] text-muted-strong">
          Réf. <span className="font-semibold text-ink">{reference}</span>
        </p>
      ) : null}
      {resume ? (
        <p className="mt-3 text-[15px] leading-[1.65] text-muted-strong">
          {resume}{' '}
          <Link href="#en-bref" className="font-semibold text-brand underline underline-offset-2">
            Voir la description complète
          </Link>
        </p>
      ) : null}
    </div>
  )
}

export function OptionsDuVehicule({ vehicule, packs }: { vehicule: string; packs: PackComplementaire[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [ajoutes, setAjoutes] = useState<string[]>([])
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const liste = packs.slice(0, 4)
  if (liste.length === 0) return null

  function ajouter(variantId: string) {
    setErreur(null)
    setEnCours(variantId)
    startTransition(async () => {
      const r = await addToCart({ variantId, quantity: 1, extraVariantIds: [] })
      if (r.ok) {
        setAjoutes((d) => [...d, variantId])
        router.refresh()
      } else setErreur(r.error)
      setEnCours(null)
    })
  }

  return (
    <div className="order-3 mt-6 rounded-[10px] bg-[#111214] p-4 text-white fiche:p-5">
      <p className="text-[16px] font-bold">Complétez votre {vehicule}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-[#c9ccd1]">
        Les autres éclairages vérifiés pour ce véhicule, à ajouter en un clic.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {liste.map((pack) => {
          const fait = ajoutes.includes(pack.variantId)
          return (
            <li key={pack.variantId} className="flex items-center gap-3 rounded-[7px] bg-[#1d1f23] px-3 py-2.5">
              <Link href={`/p/${pack.slug}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-[14px] font-semibold">{pack.titre}</span>
                {pack.sousTitre ? (
                  <span className="block truncate text-[12px] text-[#9aa0a6]">{pack.sousTitre}</span>
                ) : null}
              </Link>
              <span className="shrink-0 text-[14px] font-bold">{formatPrice(pack.prixCents)}</span>
              <button
                type="button"
                onClick={() => ajouter(pack.variantId)}
                disabled={fait || enCours !== null}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[6px] px-2.5 text-[13px] font-bold',
                  fait ? 'text-[#7dd3a0]' : 'text-[#ff8a5c] hover:bg-white/10',
                )}
              >
                {fait ? <IconCheck className="size-4" /> : <IconPlus className="size-4" />}
                {fait ? 'Ajouté' : enCours === pack.variantId ? '…' : 'Ajouter'}
              </button>
            </li>
          )
        })}
      </ul>
      {erreur ? <p className="mt-2 text-[12px] text-[#ff9b9b]">{erreur}</p> : null}
    </div>
  )
}
