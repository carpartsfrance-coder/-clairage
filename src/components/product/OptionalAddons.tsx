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
import { Button } from '@/components/ui/Button'
import { FitmentBadge } from '@/components/ui/Badge'
import { IconCart } from '@/components/ui/icons'

const PACKAGING_LABELS: Record<ProductView['variants'][number]['packaging'], string> = {
  UNIT: "À l'unité",
  PAIR: 'La paire',
  PACK: 'Le pack',
  KIT: 'Le kit',
}

/**
 * Compléments facultatifs : pack intérieur, éclairage de plaque, etc.
 *
 * Trois règles, et la première prime sur les deux autres :
 *
 * 1. **Rien n'est ajouté sans un geste.** Aucune case cochée d'avance, aucun
 *    article glissé dans le panier au passage. Chaque complément a son propre
 *    bouton, et c'est le seul chemin.
 * 2. **On ne prétend pas que c'est compatible.** Le statut affiché vient du
 *    moteur de compatibilité, résolu pour le complément lui-même et pas hérité
 *    du produit principal. Sans véhicule sélectionné, aucun statut n'est
 *    affiché : on invite à le renseigner. Un complément déclaré incompatible
 *    n'est pas proposé à l'achat.
 * 3. **Ce ne sont pas les accessoires du montage.** Les adaptateurs et
 *    décodeurs exigés par le kit vivent dans le bloc d'achat, avec leur propre
 *    traitement : les mélanger ici ferait passer une pièce indispensable pour
 *    une suggestion.
 *
 * Après un ajout, on reste sur la fiche : le compteur du panier est rafraîchi
 * et une confirmation s'affiche à côté du complément concerné.
 */
export function OptionalAddons({
  addons,
  vehicleSelected,
}: {
  addons: ProductView['optionalAddons']
  vehicleSelected: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    slug: string
    tone: 'ok' | 'danger'
    text: string
  } | null>(null)

  if (addons.length === 0) return null

  function ajouter(addon: ProductView['optionalAddons'][number]) {
    setBusySlug(addon.slug)
    setFeedback(null)

    startTransition(async () => {
      const result = await addToCart({ variantId: addon.variantId, quantity: 1 })
      setBusySlug(null)

      if (!result.ok) {
        setFeedback({ slug: addon.slug, tone: 'danger', text: result.error })
        return
      }

      setFeedback({
        slug: addon.slug,
        tone: 'ok',
        // Le message du serveur s'il en donne un (stock ajusté, par exemple),
        // sinon une confirmation simple. On ne réécrit pas ce qu'il dit.
        text: result.message ?? `${addon.name} ajouté au panier.`,
      })
      // Rafraîchit le compteur du panier dans le header sans quitter la fiche.
      router.refresh()
    })
  }

  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {addons.map((addon) => {
        const incompatible = addon.fitment === 'INCOMPATIBLE'
        const disponible = isPurchasable(addon.availability)
        const achetable = disponible && !incompatible
        const retour = feedback?.slug === addon.slug ? feedback : null

        return (
          <li
            key={addon.slug}
            className="flex flex-col rounded-md border border-line bg-white"
          >
            <Link
              href={`/p/${addon.slug}`}
              className="group flex flex-1 flex-col rounded-t-md transition-colors hover:bg-surface-soft"
            >
              <span className="relative block aspect-[4/3] overflow-hidden rounded-t-md">
                {addon.image ? (
                  <Image
                    src={addon.image.url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 640px) 45vw, 90vw"
                    className="object-contain p-3"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center bg-surface-muted text-xs text-muted">
                    {addon.name}
                  </span>
                )}
              </span>

              <span className="flex flex-1 flex-col gap-1.5 border-t border-line p-3">
                {/* Statut seulement s'il a été établi pour CE complément. */}
                {addon.fitment ? (
                  <FitmentBadge status={addon.fitment} short className="w-fit" />
                ) : null}

                <span className="text-sm font-bold leading-snug">{addon.name}</span>

                {addon.tagline ? (
                  <span className="line-clamp-2 text-xs text-muted">{addon.tagline}</span>
                ) : null}

                {/* Le nom du conditionnement répète souvent son intitulé
                    (« Le pack · Le pack ») : on ne l'ajoute que s'il apprend
                    quelque chose. */}
                <span className="mt-auto pt-1 text-xs text-muted">
                  {addon.variantName &&
                  addon.variantName.toLowerCase() !== PACKAGING_LABELS[addon.packaging].toLowerCase()
                    ? `${PACKAGING_LABELS[addon.packaging]} · ${addon.variantName}`
                    : PACKAGING_LABELS[addon.packaging]}
                </span>

                <span className="flex items-baseline gap-2">
                  <span className="text-[1.05rem] font-bold">{formatPrice(addon.priceCents)}</span>
                  {addon.hasOtherPackagings ? (
                    <span className="text-xs text-muted">autres conditionnements sur la fiche</span>
                  ) : null}
                </span>

                <span
                  className={disponible ? 'text-xs text-ok' : 'text-xs text-muted'}
                >
                  {availabilityLabel(addon.availability)}
                </span>
              </span>
            </Link>

            <div className="border-t border-line p-3">
              {retour ? (
                <Alert tone={retour.tone} live="polite" className="mb-3 text-xs">
                  {retour.text}
                </Alert>
              ) : null}

              {incompatible ? (
                /* On ne propose pas d'ajouter ce qu'on sait inadapté. */
                <p className="text-xs text-muted-strong">
                  Ne convient pas au véhicule retenu.{' '}
                  <Link href={`/p/${addon.slug}`} className="font-semibold underline underline-offset-2">
                    Voir la fiche
                  </Link>
                </p>
              ) : achetable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  block
                  disabled={pending && busySlug === addon.slug}
                  onClick={() => ajouter(addon)}
                  iconLeft={<IconCart className="size-4" />}
                >
                  {pending && busySlug === addon.slug ? 'Ajout…' : 'Ajouter'}
                </Button>
              ) : (
                <p className="text-xs text-muted-strong">
                  Indisponible pour le moment.
                </p>
              )}

              {!vehicleSelected ? (
                <p className="mt-2 text-xs text-muted">
                  Compatibilité non vérifiée : ajoutez votre véhicule.
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
