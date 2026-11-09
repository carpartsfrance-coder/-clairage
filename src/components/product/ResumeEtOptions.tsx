'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import type { PackComplementaire } from '@/lib/queries/packs-complementaires'
import { IconCheck, IconPlus } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { presentationDeCarte } from '@/lib/carte-titre'

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
  const [tout, setTout] = useState(false)
  if (packs.length === 0) return null
  const liste = tout ? packs : packs.slice(0, 4)

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
    <section aria-labelledby="titre-options-vehicule" className="order-3 mt-8">
      <h2 id="titre-options-vehicule" className="text-[20px] leading-tight font-extrabold tracking-[-0.02em]">
        Complétez l’éclairage de votre {vehicule}
      </h2>
      <p className="mt-1 text-[13px] text-muted-strong">Vérifiés pour ce véhicule, à ajouter en un clic.</p>
      <ul className="mt-4 flex flex-col gap-3">
        {liste.map((pack) => {
          const fait = ajoutes.includes(pack.variantId)
          const p = presentationDeCarte(pack.nom, pack.sousTitre)
          return (
            <li key={pack.variantId} className="flex gap-4 rounded-xl border border-line bg-[#f6f7f8] p-3">
              <Link
                href={`/p/${pack.slug}`}
                className="relative size-[104px] shrink-0 overflow-hidden rounded-lg bg-[#282b2f] sm:size-[120px]"
              >
                {pack.image ? (
                  <Image src={pack.image.url} alt={pack.image.alt} fill sizes="120px" className="object-cover" />
                ) : null}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/p/${pack.slug}`} className="hover:underline">
                  <span className="block text-[15px] leading-snug font-extrabold">{p.titre ?? pack.titre}</span>
                </Link>
                <p className="mt-1 text-[12px] text-muted-strong">
                  <span className="font-semibold text-ink">Emplacement :</span> {pack.titre}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-ok">
                  <span aria-hidden className="size-2 rounded-full bg-ok" /> En stock
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                  <strong className="text-[18px] font-extrabold tracking-[-0.03em]">{formatPrice(pack.prixCents)}</strong>
                  <button
                    type="button"
                    onClick={() => ajouter(pack.variantId)}
                    disabled={fait || enCours !== null}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold text-white transition-colors',
                      fait ? 'bg-ok' : 'bg-brand hover:bg-brand-dark disabled:opacity-60',
                    )}
                  >
                    {fait ? <IconCheck className="size-4" /> : <IconPlus className="size-4" />}
                    {fait ? 'Ajouté' : enCours === pack.variantId ? 'Ajout…' : 'Ajouter au panier'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {packs.length > 4 && !tout ? (
        <button
          type="button"
          onClick={() => setTout(true)}
          className="mt-3 w-full rounded-lg border border-line py-2.5 text-[13px] font-bold hover:border-line-strong"
        >
          Voir les {packs.length - 4} autres éclairages pour ce véhicule
        </button>
      ) : null}
      {erreur ? <p className="mt-2 text-[12px] text-danger">{erreur}</p> : null}
    </section>
  )
}
