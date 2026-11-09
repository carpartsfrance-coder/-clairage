'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addPacksToCart, addToCart } from '@/lib/actions/cart'
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
    <div className="order-4 mt-4">
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
    <section aria-labelledby="titre-options-vehicule" className="order-5 mt-8 scroll-mt-32">
      <h2 id="titre-options-vehicule" className="text-[20px] leading-tight font-extrabold tracking-[-0.02em]">
        Complétez l’éclairage de votre {vehicule}
      </h2>
      <p className="mt-1 text-[13px] text-muted-strong">Vérifiés pour ce véhicule, à ajouter en un clic.</p>
      {/*
        Téléphone : un carrousel qu'on fait glisser du doigt (comme chez
        Lasfit), toutes les cartes à la suite — empilées, quatre cartes
        prenaient un écran entier. Ordinateur : la liste, quatre cartes puis
        « Voir les N autres ».
      */}
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] fiche:mx-0 fiche:snap-none fiche:flex-col fiche:overflow-visible fiche:px-0 fiche:pb-0">
        {packs.map((pack, index) => {
          const fait = ajoutes.includes(pack.variantId)
          const p = presentationDeCarte(pack.nom, pack.sousTitre)
          return (
            <li
              key={pack.variantId}
              className={cn(
                'flex w-[76%] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-line bg-[#f6f7f8]',
                'fiche:w-auto fiche:max-w-none fiche:flex-row fiche:gap-4 fiche:p-3',
                index >= 4 && !tout && 'fiche:hidden',
              )}
            >
              <Link
                href={`/p/${pack.slug}`}
                className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[#282b2f] fiche:aspect-auto fiche:size-[120px] fiche:rounded-lg"
              >
                {pack.image ? (
                  <Image src={pack.image.url} alt={pack.image.alt} fill sizes="(max-width: 800px) 300px, 120px" className="object-cover" />
                ) : null}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col p-3 fiche:p-0">
                <Link href={`/p/${pack.slug}`} className="hover:underline">
                  <span className="block text-[15px] leading-snug font-extrabold">{p.titre ?? pack.titre}</span>
                </Link>
                <p className="mt-1 text-[13px] text-muted-strong">
                  <span className="font-semibold text-ink">Emplacement :</span> {pack.titre}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-ok">
                  <span aria-hidden className="size-2 rounded-full bg-ok" /> En stock
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <strong className="text-[18px] font-extrabold tracking-[-0.03em]">{formatPrice(pack.prixCents)}</strong>
                  <button
                    type="button"
                    onClick={() => ajouter(pack.variantId)}
                    disabled={fait || enCours !== null}
                    aria-label={fait ? `${p.titre ?? pack.titre} ajouté au panier` : `Ajouter ${p.titre ?? pack.titre} au panier`}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold text-white transition-colors',
                      fait ? 'bg-ok' : 'bg-brand hover:bg-brand-dark disabled:opacity-60',
                    )}
                  >
                    {fait ? <IconCheck className="size-4" /> : <IconPlus className="size-4" />}
                    {fait ? 'Ajouté' : enCours === pack.variantId ? 'Ajout…' : 'Ajouter'}
                    <span className="hidden fiche:inline">{fait || enCours === pack.variantId ? '' : ' au panier'}</span>
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {packs.length > 1 ? (
        <p className="mt-1 text-[12px] text-muted-strong fiche:hidden">
          Faites glisser pour voir les {packs.length} éclairages →
        </p>
      ) : null}
      {packs.length > 4 && !tout ? (
        <button
          type="button"
          onClick={() => setTout(true)}
          className="mt-3 hidden w-full fiche:block rounded-lg border border-line py-2.5 text-[13px] font-bold hover:border-line-strong"
        >
          Voir les {packs.length - 4} autres éclairages pour ce véhicule
        </button>
      ) : null}
      {packs.length > 1 ? (
        <div className="mt-4 rounded-xl bg-[#111214] p-4 text-white">
          <p className="text-[14px] leading-snug">
            <strong>Tout l’éclairage de votre {vehicule}</strong> en une fois :{' '}
            {packs.length} produits, {formatPrice(packs.reduce((t, p) => t + p.prixCents, 0))}
          </p>
          <button
            type="button"
            disabled={enCours !== null || packs.every((p) => ajoutes.includes(p.variantId))}
            onClick={() => {
              const ids = packs.map((p) => p.variantId).filter((id) => !ajoutes.includes(id))
              setErreur(null)
              setEnCours('tout')
              startTransition(async () => {
                const r = await addPacksToCart({ variantIds: ids })
                if (r.ok) {
                  setAjoutes((d) => [...new Set([...d, ...ids])])
                  router.refresh()
                } else setErreur(r.error)
                setEnCours(null)
              })
            }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-bold hover:bg-brand-dark disabled:opacity-60"
          >
            {packs.every((p) => ajoutes.includes(p.variantId))
              ? 'Tout est dans le panier'
              : enCours === 'tout'
                ? 'Ajout…'
                : `Ajouter les ${packs.length} au panier`}
          </button>
        </div>
      ) : null}
      {erreur ? <p className="mt-2 text-[12px] text-danger">{erreur}</p> : null}
    </section>
  )
}
