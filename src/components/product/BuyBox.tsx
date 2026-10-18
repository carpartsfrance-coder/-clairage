'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { VariantView } from '@/lib/queries/product'
import { buildDeliveryTeaser, type ShippingOffer } from '@/lib/delivery-teaser'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import { availabilityLabel, isPurchasable } from '@/lib/stock'
import { cn } from '@/lib/cn'
import { Alert } from '@/components/ui/Surface'
import { Badge, RoadApprovalNote } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  IconCart,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconTruck,
  IconWrench,
} from '@/components/ui/icons'

const PACKAGING_LABELS: Record<VariantView['packaging'], string> = {
  UNIT: "Vendu à l'unité",
  PAIR: 'Vendu par paire',
  PACK: 'Vendu en pack',
  KIT: 'Kit complet',
}

/**
 * Bloc d'achat de la fiche produit (02-fiche-produit.png, colonne de droite).
 *
 * Trois règles s'y appliquent, et elles passent avant la conversion :
 *
 * 1. Sans véhicule sélectionné, aucun conditionnement n'est « recommandé » et
 *    aucune compatibilité n'est affirmée. On demande le véhicule, c'est tout.
 * 2. Un accessoire rendu nécessaire par le montage est PROPOSÉ, coché par
 *    personne. Rien ne part au panier que le client n'ait vu et accepté.
 * 3. Quand la pièce est incompatible avec le véhicule retenu, l'achat est
 *    bloqué et on dit pourquoi, avec une porte de sortie. Vendre une pièce
 *    qu'on sait inadaptée coûte un retour et un client.
 */
export function BuyBox({
  variants,
  recommendedVariantId,
  vehicleLabel,
  shippingOffers,
  returnWindowDays,
  contentAnchor = '#contenu',
}: {
  variants: VariantView[]
  recommendedVariantId: string | null
  /** Null quand aucun véhicule n'est sélectionné. */
  vehicleLabel: string | null
  /** Règles de livraison configurées, rejouées à chaque changement de total. */
  shippingOffers: ShippingOffer[]
  returnWindowDays: number | null
  contentAnchor?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  // Ordre de préférence : la recommandation faite pour le véhicule, sinon le
  // kit complet — c'est l'offre qui contient tout ce qu'il faut, et le client
  // qui n'a pas encore dit son véhicule ne peut pas savoir ce qui lui manque.
  // Le conditionnement moins cher reste visible juste en dessous, avec son prix.
  const [selectedId, setSelectedId] = useState(
    () =>
      recommendedVariantId ??
      variants.find(
        (variant) => variant.components.length > 0 && isPurchasable(variant.availability),
      )?.id ??
      variants.find((variant) => isPurchasable(variant.availability))?.id ??
      variants[0]?.id ??
      '',
  )
  const [acceptedAccessories, setAcceptedAccessories] = useState<string[]>([])

  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0]

  const accessories = selected?.missingAccessories ?? []
  const accessoriesTotal = useMemo(
    () =>
      accessories
        .filter((accessory) => acceptedAccessories.includes(accessory.variantId))
        .reduce((sum, accessory) => sum + accessory.priceCents * accessory.quantity, 0),
    [accessories, acceptedAccessories],
  )

  if (!selected) return null

  const total = selected.priceCents + accessoriesTotal

  // L'accroche de livraison suit le total réel : passer du kit aux ampoules
  // seules peut faire repasser sous le seuil de franchise, et cela doit se voir
  // tout de suite plutôt qu'au paiement.
  const delivery = buildDeliveryTeaser(shippingOffers, total)
  const incompatible = selected.fitment.status === 'INCOMPATIBLE'
  const purchasable = isPurchasable(selected.availability) && !incompatible

  /** « 2 × Ampoules LED H7 + 2 × Adaptateur… », construit depuis la vraie composition. */
  const compositionSummary = selected.components
    .map((component) =>
      component.quantity > 1
        ? `${component.quantity} × ${component.productName}`
        : component.productName,
    )
    .join(' + ')

  function submit() {
    setFeedback(null)
    startTransition(async () => {
      const result = await addToCart({
        variantId: selected.id,
        quantity: 1,
        extraVariantIds: acceptedAccessories,
      })
      if (result.ok) {
        setFeedback({
          tone: 'ok',
          text: result.message ?? 'Ajouté au panier.',
        })
        // Rafraîchit le compteur du header, qui est rendu côté serveur.
        router.refresh()
      } else {
        setFeedback({ tone: 'danger', text: result.error })
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Compatibilité pour le véhicule retenu ---- */}
      {vehicleLabel && selected.fitment.status === 'CONFIRMED' ? (
        <div className="flex items-start gap-3 rounded-md border border-ok-border bg-ok-soft px-4 py-3.5">
          <IconCheckCircle className="mt-0.5 size-6 shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="font-bold">La configuration pour votre {vehicleLabel}</p>
            {compositionSummary ? (
              <p className="mt-0.5 text-sm text-muted-strong">{compositionSummary}</p>
            ) : selected.fitment.quantity > 1 ? (
              <p className="mt-0.5 text-sm text-muted-strong">
                {selected.fitment.quantity} nécessaires pour cet emplacement
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {vehicleLabel && selected.fitment.status === 'UNKNOWN' ? (
        <Alert tone="warn" title="Compatibilité non établie pour votre véhicule.">
          Nous n&apos;avons pas l&apos;information nécessaire pour confirmer que cette référence
          convient à votre {vehicleLabel}. Une donnée manquante ne vaut pas compatibilité —{' '}
          <Link href="/contact" className="font-semibold underline underline-offset-4">
            demandez-nous de vérifier
          </Link>{' '}
          avant d&apos;acheter.
        </Alert>
      ) : null}

      {incompatible ? (
        <Alert tone="danger" title="Cette référence ne convient pas à votre véhicule.">
          {selected.fitment.restrictions ??
            "L'équipement d'origine du véhicule sélectionné n'accepte pas cette référence."}{' '}
          <Link href="/vehicule/resultats" className="font-semibold underline underline-offset-4">
            Voir ce qui convient à votre véhicule
          </Link>
          .
        </Alert>
      ) : null}

      {!vehicleLabel ? (
        <Alert tone="info" title="Indiquez votre véhicule.">
          Le bon éclairage dépend du bloc optique et de l&apos;équipement d&apos;origine, pas
          seulement du culot.{' '}
          <Link href="/vehicule" className="font-semibold underline underline-offset-4">
            Choisir mon véhicule
          </Link>{' '}
          pour savoir si cette référence vous convient.
        </Alert>
      ) : null}

      {/* ---- Choix du conditionnement ---- */}
      {variants.length > 1 ? (
        <fieldset>
          <div className="mb-3 flex items-center justify-between gap-4">
            <legend className="text-[1.0625rem] font-bold">Choisissez votre kit</legend>
            <a
              href={contentAnchor}
              className="flex shrink-0 items-center gap-1.5 text-sm underline underline-offset-4 hover:text-brand"
            >
              Voir le contenu
              <IconChevronRight className="size-4" />
            </a>
          </div>

          <div className="flex flex-col gap-2.5">
            {variants.map((variant) => {
              const active = variant.id === selected.id
              const recommended = variant.id === recommendedVariantId
              const available = isPurchasable(variant.availability)
              return (
                <label
                  key={variant.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3.5 transition-colors',
                    active
                      ? 'border-brand bg-brand-soft'
                      : 'border-line-strong bg-white hover:border-slate-ink',
                    !available && 'opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name="conditionnement"
                    value={variant.id}
                    checked={active}
                    disabled={!available}
                    onChange={() => {
                      setSelectedId(variant.id)
                      // Les accessoires acceptés dépendent du conditionnement :
                      // changer de conditionnement remet le choix à zéro plutôt
                      // que de traîner une case cochée pour un autre contenu.
                      setAcceptedAccessories([])
                      setFeedback(null)
                    }}
                    className="mt-1 size-5 shrink-0 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    {recommended ? (
                      <Badge tone="danger" className="mb-1.5">
                        Recommandé pour votre véhicule
                      </Badge>
                    ) : null}
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">{variant.name}</span>
                      <span className="shrink-0 text-[1.0625rem] font-bold">
                        {formatPrice(variant.priceCents)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-strong">
                      {variant.components.length > 0
                        ? 'Ampoules + accessoires nécessaires'
                        : variant.missingAccessories.length > 0
                          ? 'Vous possédez déjà les accessoires'
                          : PACKAGING_LABELS[variant.packaging]}
                    </span>
                    {!available ? (
                      <span className="mt-1 block text-sm font-semibold text-muted">
                        {availabilityLabel(variant.availability)}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {selected.components.length > 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-ok">
          <IconCheckCircle className="size-4 shrink-0" />
          {selected.components
            .filter((component) => component.required)
            .map((component) => component.productName)
            .join(' et ')}{' '}
          inclus
        </p>
      ) : null}

      {/* ---- Accessoires nécessaires non inclus : proposés, jamais cochés ---- */}
      {accessories.length > 0 ? (
        <fieldset className="rounded-md border border-warn-border bg-warn-soft px-4 py-3.5">
          <legend className="px-1 text-sm font-bold">
            Nécessaire pour ce montage, non inclus
          </legend>
          <p className="mb-3 text-sm text-muted-strong">
            Ce conditionnement ne contient pas ces pièces. Elles ne sont ajoutées que si vous les
            cochez.
          </p>
          <div className="flex flex-col gap-2">
            {accessories.map((accessory) => (
              <label key={accessory.variantId} className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedAccessories.includes(accessory.variantId)}
                  onChange={(event) =>
                    setAcceptedAccessories((current) =>
                      event.target.checked
                        ? [...current, accessory.variantId]
                        : current.filter((id) => id !== accessory.variantId),
                    )
                  }
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {accessory.quantity > 1 ? `${accessory.quantity} × ` : ''}
                      {accessory.productName}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {formatPrice(accessory.priceCents * accessory.quantity)}
                    </span>
                  </span>
                  {accessory.note ? (
                    <span className="block text-muted-strong">{accessory.note}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* ---- Total et achat ---- */}
      <div className="border-t border-line pt-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-strong">Total</p>
            <p className="text-[1.875rem] font-extrabold leading-tight">
              {formatPrice(total)} <span className="text-xl">TTC</span>
            </p>
          </div>
          <p
            className={cn(
              'flex shrink-0 items-center gap-2 text-sm font-semibold',
              purchasable ? 'text-ok' : 'text-muted',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2.5 rounded-full',
                purchasable ? 'bg-ok' : 'bg-line-strong',
              )}
            />
            {availabilityLabel(selected.availability)}
          </p>
        </div>

        <Button
          size="lg"
          block
          className="mt-4"
          disabled={!purchasable || pending}
          onClick={submit}
          iconLeft={<IconCart className="size-6 shrink-0" />}
          iconRight={<IconChevronRight className="ml-auto size-5 shrink-0" />}
        >
          {pending
            ? 'Ajout en cours…'
            : incompatible
              ? 'Incompatible avec votre véhicule'
              : `Ajouter ${selected.name.toLowerCase()}`}
        </Button>

        {feedback ? (
          <Alert
            tone={feedback.tone === 'ok' ? 'ok' : 'danger'}
            live={feedback.tone === 'danger' ? 'assertive' : 'polite'}
            className="mt-3"
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
      </div>

      {/*
        Barre d'achat fixe du mobile.

        Elle reflète la sélection en cours — même variante, mêmes accessoires
        cochés, même total — parce qu'elle appelle exactement la même fonction
        que le bouton principal. Une barre qui ajouterait « le produit » sans
        tenir compte du conditionnement choisi serait un piège.
        Elle disparaît dès lg : sur grand écran le bloc d'achat reste visible.
      */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 py-3 shadow-pop lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-strong">{selected.name}</p>
            <p className="text-lg font-extrabold leading-tight">{formatPrice(total)}</p>
          </div>
          <Button
            size="md"
            className="shrink-0"
            disabled={!purchasable || pending}
            onClick={submit}
            iconLeft={<IconCart className="size-5 shrink-0" />}
          >
            {pending ? 'Ajout…' : incompatible ? 'Incompatible' : 'Ajouter'}
          </Button>
        </div>
      </div>

      {/* ---- Livraison, retours, assistance ---- */}
      <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm">
        {delivery ? (
          <p className="flex items-start gap-2.5">
            <IconTruck className="mt-0.5 size-5 shrink-0 text-muted-strong" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{delivery.priceLabel}</span>
              {delivery.delayLabel ? (
                <span className="text-muted-strong"> · {delivery.delayLabel}</span>
              ) : null}
              {delivery.missingForFreeCents ? (
                <span className="block text-xs text-muted">
                  Plus que {formatPrice(delivery.missingForFreeCents)} pour la livraison offerte.
                </span>
              ) : null}
            </span>
            <Link
              href="/livraison-retours"
              className="flex shrink-0 items-center gap-1 underline underline-offset-4 hover:text-brand"
            >
              Voir les détails
              <IconChevronRight className="size-4" />
            </Link>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {returnWindowDays ? (
            <p className="flex items-center gap-2.5">
              <IconClock className="size-5 shrink-0 text-muted-strong" />
              Retours sous {returnWindowDays} jours
            </p>
          ) : null}
          <p className="flex items-center gap-2.5 sm:border-l sm:border-line sm:pl-4">
            <IconWrench className="size-5 shrink-0 text-muted-strong" />
            <Link href="/contact" className="underline underline-offset-4 hover:text-brand">
              Assistance au montage
            </Link>
          </p>
        </div>

        <RoadApprovalNote
          status={selected.fitment.roadApproval}
          market={selected.fitment.approvalMarket}
          note={selected.fitment.approvalNote}
        />
      </div>
    </div>
  )
}
