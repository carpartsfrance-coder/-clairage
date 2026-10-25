'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ProductView } from '@/lib/queries/product'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import { availabilityLabel, isPurchasable } from '@/lib/stock'
import { Alert } from '@/components/ui/Surface'
import { FitmentBadge } from '@/components/ui/Badge'
import { IconCheck } from '@/components/ui/icons'
import { addonsProposables } from '@/lib/addons'
import { cn } from '@/lib/cn'
import { useProductConfiguration } from './ProductConfiguration'

type Addon = ProductView['optionalAddons'][number]

const PACKAGING_LABELS: Record<Addon['packaging'], string> = {
  UNIT: "à l'unité",
  PAIR: 'la paire',
  PACK: 'le pack',
  KIT: 'le kit',
}

/**
 * Compléments facultatifs — `#complements` / `.extra-card` de la référence.
 *
 * Valeurs reprises de `styles.css` : deux colonnes de 20 px d'écart, cartes à
 * filet et rayon 9 px, panneau visuel sombre de 124 × 119 px, case à cocher
 * carrée en haut à droite, et la bande de synthèse #f4f6f0 qui n'apparaît que
 * lorsqu'un complément est coché.
 *
 * Trois règles, et la première prime sur les deux autres :
 *
 * 1. **Rien n'est ajouté sans un geste.** Aucune case cochée d'avance. La
 *    bande de synthèse reste masquée tant que rien n'est sélectionné, et elle
 *    annonce le total exact avant l'ajout.
 * 2. **On ne prétend pas que c'est compatible.** Le statut vient du moteur de
 *    compatibilité, résolu pour le complément lui-même. Sans véhicule, aucun
 *    statut n'est affiché. Un complément incompatible n'est pas sélectionnable.
 * 3. **Ce ne sont pas les accessoires du montage.** Les adaptateurs et
 *    décodeurs exigés par le kit vivent dans le bloc d'achat : les mélanger
 *    ferait passer une pièce indispensable pour une suggestion.
 *
 * Chaque complément part au panier par son propre appel : ce sont des articles
 * à part entière, pas des accessoires rattachés au kit. Les passer en
 * `extraVariantIds` les enregistrerait comme « exigés par » le produit
 * principal, ce qu'ils ne sont pas.
 */
export function OptionalAddons({
  addons,
  vehicleSelected,
}: {
  addons: Addon[]
  vehicleSelected: boolean
}) {
  const router = useRouter()
  const configuration = useProductConfiguration()
  const [pending, startTransition] = useTransition()
  const [selection, setSelection] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  /*
    Un complément déjà fourni par le conditionnement retenu n'est pas un
    complément : le proposer à l'achat ferait payer deux fois la même pièce au
    client qui vient précisément de choisir le pack qui la contient. La liste
    suit donc le choix du bloc d'achat, et l'accessoire réapparaît dès qu'on
    bascule sur un conditionnement qui ne le fournit pas.

    Le rapprochement se fait par produit, pas par variante : le pack peut
    inclure l'adaptateur en paire quand la fiche complément le vend à l'unité.
  */
  const proposables = addonsProposables(
    addons,
    (configuration?.selected?.components ?? []).map((composant) => composant.productSlug),
  )

  if (proposables.length === 0) return null

  const selectionnables = proposables.filter(
    (addon) => addon.fitment !== 'INCOMPATIBLE' && isPurchasable(addon.availability),
  )
  const retenus = selectionnables.filter((addon) => selection.includes(addon.slug))
  const total = retenus.reduce((somme, addon) => somme + addon.priceCents, 0)

  function basculer(slug: string) {
    setFeedback(null)
    setSelection((courant) =>
      courant.includes(slug) ? courant.filter((item) => item !== slug) : [...courant, slug],
    )
  }

  function ajouter() {
    if (retenus.length === 0) return
    setFeedback(null)

    startTransition(async () => {
      const echecs: Array<{ slug: string; message: string }> = []
      const remarques: string[] = []

      for (const addon of retenus) {
        const result = await addToCart({ variantId: addon.variantId, quantity: 1 })
        if (result.ok) {
          if (result.message) remarques.push(result.message)
        } else {
          echecs.push({ slug: addon.slug, message: `${addon.name} : ${result.error}` })
        }
      }

      const ajoutes = retenus.length - echecs.length

      // Ce qui est parti sort de la sélection ; ce qui a échoué reste coché,
      // pour que le client voie exactement ce qu'il reste à régler.
      setSelection(echecs.map((echec) => echec.slug))
      if (ajoutes > 0) router.refresh()

      if (echecs.length > 0) {
        setFeedback({
          tone: 'danger',
          text: [
            ajoutes > 0
              ? `${ajoutes} sur ${retenus.length} ajoutés.`
              : 'Aucun complément n’a été ajouté.',
            ...echecs.map((echec) => echec.message),
          ].join(' '),
        })
      } else {
        setFeedback({
          tone: 'ok',
          text: [
            ajoutes > 1
              ? `${ajoutes} compléments ajoutés au panier.`
              : 'Complément ajouté au panier.',
            ...remarques,
          ].join(' '),
        })
      }
    })
  }

  return (
    <>
      {/* .extra-grid : deux colonnes au-delà du basculement. */}
      <ul className="grid grid-cols-1 gap-3 fiche:grid-cols-2 fiche:gap-5">
        {proposables.map((addon) => {
          const incompatible = addon.fitment === 'INCOMPATIBLE'
          const disponible = isPurchasable(addon.availability)
          const selectionnable = disponible && !incompatible
          const coche = selection.includes(addon.slug)

          return (
            <li key={addon.slug}>
              {/* .extra-card : la carte entière est l'étiquette de la case. */}
              <label
                className={cn(
                  'relative flex items-center gap-[18px] rounded-[9px] border p-[13px] fiche:gap-[14px] fiche:p-4 min-[1101px]:gap-5',
                  coche ? 'border-brand bg-[#fdf9f8]' : 'border-[#e0e0e0]',
                  selectionnable ? 'cursor-pointer' : 'cursor-default opacity-75',
                )}
              >
                <input
                  type="checkbox"
                  className="absolute size-px opacity-0"
                  checked={coche}
                  disabled={!selectionnable || pending}
                  onChange={() => basculer(addon.slug)}
                />

                {/* .extra-art : panneau sombre, le visuel réel du complément. */}
                <span className="relative grid h-[108px] w-[105px] shrink-0 place-items-center overflow-hidden rounded-[5px] bg-[#202429] fiche:w-[100px] min-[1101px]:h-[119px] min-[1101px]:w-[124px]">
                  {addon.image ? (
                    <Image
                      src={addon.image.url}
                      alt=""
                      fill
                      sizes="124px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="px-2 text-center text-[8px] text-white/70">{addon.name}</span>
                  )}
                </span>

                {/* .extra-copy : surtitre, intitulé, description, prix. */}
                <span className="flex min-w-0 flex-col gap-1.5 pr-2.5 fiche:pr-2">
                  <small className="text-[7px] tracking-[1.1px] text-[#909090] uppercase">
                    {addon.variantName}
                  </small>
                  <strong className="text-[12px] tracking-[-0.2px] min-[1101px]:text-[13px]">
                    {addon.name}
                  </strong>
                  {addon.tagline ? (
                    <span className="text-[9px] leading-[1.5] text-[#828282] fiche:text-[8px] min-[1101px]:text-[9px]">
                      {addon.tagline}
                    </span>
                  ) : null}

                  {/* Statut seulement s'il a été établi pour CE complément. */}
                  {addon.fitment ? (
                    <FitmentBadge status={addon.fitment} short className="w-fit" />
                  ) : null}

                  <b className="mt-1 text-[13px]">
                    {formatPrice(addon.priceCents)}
                    <em className="ml-[3px] text-[8px] font-normal text-[#8c8c8c] not-italic">
                      {PACKAGING_LABELS[addon.packaging]}
                      {addon.hasOtherPackagings ? ' · autres conditionnements sur la fiche' : null}
                    </em>
                  </b>

                  {!selectionnable ? (
                    <span className="text-[9px] text-muted-strong">
                      {incompatible ? (
                        <>
                          Ne convient pas au véhicule retenu.{' '}
                          <Link
                            href={`/p/${addon.slug}`}
                            className="font-semibold underline underline-offset-2"
                          >
                            Voir la fiche
                          </Link>
                        </>
                      ) : (
                        availabilityLabel(addon.availability)
                      )}
                    </span>
                  ) : null}
                </span>

                {/* .extra-toggle : la case, dessinée. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-3 right-3 grid size-[18px] place-items-center rounded-[5px] border fiche:top-3.5 fiche:right-3.5 fiche:size-[21px]',
                    coche ? 'border-brand bg-brand text-white' : 'border-[#d4d4d4] bg-white',
                  )}
                >
                  {coche ? <IconCheck className="size-3.5" strokeWidth={2} /> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {/* .extras-summary : masquée tant que rien n'est coché. */}
      {retenus.length > 0 ? (
        <div className="mt-3.5 block items-center justify-between rounded-[7px] bg-[#f4f6f0] p-[17px] text-[10px] fiche:flex fiche:text-[11px]">
          <p>
            {retenus.length === 1
              ? `1 complément retenu : ${retenus[0].name}`
              : `${retenus.length} compléments retenus`}{' '}
            — <strong>{formatPrice(total)}</strong> à ajouter à votre panier.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={ajouter}
            className="mt-[9px] inline-flex min-h-11 items-center gap-2 text-[10px] font-bold hover:underline disabled:opacity-60 fiche:mt-0 fiche:min-h-0 fiche:text-[11px]"
          >
            {pending ? 'Ajout en cours…' : 'Ajouter les compléments sélectionnés'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}

      {feedback ? (
        <Alert
          tone={feedback.tone === 'ok' ? 'ok' : 'danger'}
          live={feedback.tone === 'danger' ? 'assertive' : 'polite'}
          className="mt-3.5"
        >
          {feedback.text}
          {feedback.tone === 'ok' ? (
            <>
              {' '}
              <Link href="/panier" className="font-semibold underline underline-offset-4">
                Voir le panier
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      {!vehicleSelected ? (
        <p className="mt-3 text-[8px] leading-[1.7] text-[#969696]">
          Aucun véhicule n&apos;est sélectionné : la compatibilité de ces compléments n&apos;est pas
          vérifiée.
        </p>
      ) : null}
    </>
  )
}
