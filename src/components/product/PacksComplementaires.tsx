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

/**
 * « Complétez l'éclairage de votre … » — les autres packs du même véhicule.
 *
 * Refonte LEDVROOM : la fiche vendait un emplacement et s'arrêtait là, alors
 * que le client équipe souvent toute sa voiture. La section propose les autres
 * packs confirmés pour ce véhicule (voir `getPacksComplementaires`), chacun
 * ajoutable en un clic, et tous d'un coup.
 *
 * **Le coup de pouce livraison.** Quand le pack de la fiche n'atteint pas seul
 * la livraison offerte, le moins cher des packs qui la déclenchent avec lui le
 * dit. C'est un calcul sur le prix de la fiche, pas sur le panier : la phrase
 * reste donc conditionnelle (« avec le pack de cette page »).
 */
export function PacksComplementaires({
  vehicule,
  packs,
  prixDuPackCents,
  seuilFranchiseCents,
  libelleFranchise = 'Avec le pack de cette page : livraison offerte',
}: {
  vehicule: string
  packs: PackComplementaire[]
  /** Prix du pack de la fiche, conditionnement conseillé — ou du panier. */
  prixDuPackCents: number
  /** Seuil de livraison offerte configuré, ou null s'il n'y en a pas. */
  seuilFranchiseCents: number | null
  /** La phrase sous le pack qui fait passer le seuil (le panier dit « Avec ce pack »). */
  libelleFranchise?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ajoutes, setAjoutes] = useState<string[]>([])
  const [enCours, setEnCours] = useState<string | null>(null)
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)

  const restants = packs.filter((pack) => !ajoutes.includes(pack.variantId))
  const total = packs.reduce((somme, pack) => somme + pack.prixCents, 0)

  const declencheur =
    seuilFranchiseCents !== null && prixDuPackCents < seuilFranchiseCents
      ? ([...packs]
          .filter((pack) => prixDuPackCents + pack.prixCents >= seuilFranchiseCents)
          .sort((a, b) => a.prixCents - b.prixCents)[0]?.variantId ?? null)
      : null

  function ajouter(variantIds: string[]) {
    if (variantIds.length === 0) return
    setRetour(null)
    setEnCours(variantIds.length === 1 ? variantIds[0] : 'tout')
    startTransition(async () => {
      const resultat =
        variantIds.length === 1
          ? await addToCart({ variantId: variantIds[0], quantity: 1, extraVariantIds: [] })
          : await addPacksToCart({ variantIds })
      if (resultat.ok) {
        setAjoutes((deja) => [...new Set([...deja, ...variantIds])])
        setRetour({
          ok: true,
          texte: [
            resultat.message ??
              (variantIds.length === 1 ? 'Ajouté au panier.' : `${variantIds.length} packs ajoutés au panier.`),
            resultat.livraison,
          ]
            .filter(Boolean)
            .join(' '),
        })
        // Rafraîchit le compteur du header, rendu côté serveur.
        router.refresh()
      } else {
        setRetour({ ok: false, texte: resultat.error })
      }
      setEnCours(null)
    })
  }

  return (
    <section
      id="completer"
      aria-labelledby="titre-completer"
      className="scroll-mt-32 border-t border-line bg-[#f5f6f7]"
    >
      <div className="container-page py-12 fiche:py-16">
        <div className="mb-6 fiche:mb-8 fiche:flex fiche:items-end fiche:justify-between fiche:gap-8">
          <div>
            <p className="mb-2 text-[12px] font-bold tracking-[1.4px] text-brand uppercase">
              Pour la même voiture
            </p>
            <h2
              id="titre-completer"
              className="text-[26px] leading-[1.15] font-bold tracking-[-0.6px] fiche:text-[32px]"
            >
              Complétez l’éclairage de votre {vehicule}
            </h2>
          </div>
          <p className="mt-2 text-[14px] text-[#5f6266] fiche:mt-0 fiche:max-w-[420px] fiche:text-right">
            Des packs vérifiés pour ce véhicule, à ajouter en un clic.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 fiche:grid-cols-4 min-[1101px]:gap-4">
          {packs.map((pack) => {
            const ajoute = ajoutes.includes(pack.variantId)
            return (
              <li
                key={pack.variantId}
                className={cn(
                  'flex flex-col overflow-hidden rounded-2xl border bg-white',
                  pack.variantId === declencheur ? 'border-ok' : 'border-line',
                )}
              >
                <Link href={`/p/${pack.slug}`} tabIndex={-1} aria-hidden="true">
                  <span className="relative block aspect-square bg-[#f2f2f2]">
                    {pack.image ? (
                      <Image
                        src={pack.image.url}
                        alt=""
                        fill
                        sizes="(min-width: 801px) 22vw, 45vw"
                        className="object-cover"
                      />
                    ) : null}
                  </span>
                </Link>

                <div className="flex flex-1 flex-col gap-1 p-3.5 fiche:p-4">
                  <Link
                    href={`/p/${pack.slug}`}
                    className="text-[15px] leading-[1.25] font-bold hover:underline fiche:text-[16px]"
                  >
                    {pack.titre}
                  </Link>
                  {pack.sousTitre ? (
                    <span className="text-[13px] leading-[1.35] text-[#5f6266]">
                      {pack.sousTitre}
                    </span>
                  ) : null}
                  {pack.variantId === declencheur ? (
                    <span className="mt-1 text-[12px] leading-[1.35] font-bold text-[#1f5a39]">
                      {libelleFranchise}
                    </span>
                  ) : null}

                  <div className="mt-auto flex flex-col gap-2 pt-3 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
                    <strong className="text-[17px]">{formatPrice(pack.prixCents)}</strong>
                    <button
                      type="button"
                      onClick={() => ajouter([pack.variantId])}
                      disabled={pending || ajoute}
                      aria-label={ajoute ? `${pack.titre} : ajouté au panier` : `Ajouter ${pack.titre} au panier`}
                      className={cn(
                        'flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[14px] font-bold transition-colors disabled:cursor-not-allowed',
                        ajoute
                          ? 'bg-ok-soft text-[#1f5a39]'
                          : 'border border-ink bg-white text-ink hover:bg-ink hover:text-white disabled:opacity-60',
                      )}
                    >
                      {ajoute ? (
                        <>
                          <IconCheck className="size-4" strokeWidth={2.5} />
                          Ajouté
                        </>
                      ) : enCours === pack.variantId ? (
                        'Ajout…'
                      ) : (
                        <>
                          <IconPlus className="size-4" strokeWidth={2} />
                          Ajouter
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {packs.length > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 fiche:px-6">
            <p className="text-[15px]">
              <strong>
                Les {packs.length} packs : {formatPrice(total)}
              </strong>
              <span className="text-[#5f6266]"> · tout l’éclairage en une fois</span>
            </p>
            <button
              type="button"
              onClick={() => ajouter(restants.map((pack) => pack.variantId))}
              disabled={pending || restants.length === 0}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb] min-[480px]:w-auto"
            >
              {restants.length === 0
                ? 'Tous ajoutés'
                : enCours === 'tout'
                  ? 'Ajout…'
                  : restants.length === packs.length
                    ? `Ajouter les ${packs.length} packs`
                    : `Ajouter les ${restants.length} restants`}
            </button>
          </div>
        ) : null}

        {retour ? (
          <p
            role="status"
            className={cn(
              'mt-3 text-[14px] font-semibold',
              retour.ok ? 'text-[#1f5a39]' : 'text-danger',
            )}
          >
            {retour.texte}{' '}
            {retour.ok ? (
              <Link href="/panier" className="underline underline-offset-4">
                Voir le panier
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  )
}
