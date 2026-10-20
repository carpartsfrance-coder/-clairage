'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { VariantView } from '@/lib/queries/product'
import { buildDeliveryTeaser, type ShippingOffer } from '@/lib/delivery-teaser'
import { addToCart } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import { availabilityLabel, isPurchasable } from '@/lib/stock'
import { defaultVariantId, useProductConfiguration } from './ProductConfiguration'
import { StockAlertForm } from './StockAlertForm'
import { cn } from '@/lib/cn'
import { Alert } from '@/components/ui/Surface'
import { RoadApprovalNote } from '@/components/ui/Badge'
import {
  IconCart,
  IconMinus,
  IconPlus,
  IconCheck,
  IconInfo,
  IconShield,
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
 * Bloc d'achat — `.buybox` et `.sticky-buy` du code de référence.
 *
 * Valeurs reprises de `styles.css` : note de compatibilité verte de 11/12 px,
 * options de kit à filet de 8 px de rayon (1,5 px rouge sur fond #fdf6f5 pour
 * celle retenue), prix à 32 px, bouton principal de 51 px, puis livraison,
 * réassurance et mention d'homologation. La barre fixe fait 74 px, apparaît
 * au défilement sur grand écran et reste posée en bas en mobile.
 *
 * Trois règles s'y appliquent, et elles passent avant la conversion :
 *
 * 1. Sans véhicule sélectionné, aucun conditionnement n'est « recommandé » et
 *    aucune compatibilité n'est affirmée. On demande le véhicule, c'est tout.
 * 2. Un accessoire rendu nécessaire par le montage est PROPOSÉ, coché par
 *    personne. Rien ne part au panier que le client n'ait vu et accepté.
 * 3. Quand la pièce est incompatible avec le véhicule retenu, l'achat est
 *    bloqué et on dit pourquoi, avec une porte de sortie.
 *
 * La barre fixe appelle exactement la même fonction que le bouton principal :
 * même variante, mêmes accessoires cochés, même total. Une barre qui
 * ajouterait « le produit » sans tenir compte du conditionnement choisi serait
 * un piège.
 */
export function BuyBox({
  productName,
  thumbnail,
  variants,
  recommendedVariantId,
  vehicleLabel,
  shippingOffers,
  returnWindowDays,
  contentAnchor = '#dans-votre-kit',
}: {
  productName: string
  /** Premier visuel du produit : la barre fixe rappelle ce qu'on achète. */
  thumbnail: { url: string; alt: string } | null
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

  /*
    Le conditionnement choisi est partagé avec le reste de la fiche
    (`ProductConfigurationProvider`) : le contenu du kit et la section
    Installation décrivent CE conditionnement, pas le produit en général.

    Le repli local garde le bloc d'achat utilisable hors de ce contexte — un
    rendu isolé, un test — plutôt que de lever.
  */
  const configuration = useProductConfiguration()
  const [fallbackId, setFallbackId] = useState(() =>
    defaultVariantId(variants, recommendedVariantId),
  )
  const selectedId = configuration?.selectedId ?? fallbackId
  const choisirConditionnement = configuration?.setSelectedId ?? setFallbackId
  const setSelectedId = (id: string) => {
    choisirConditionnement(id)
    setQuantite(1)
  }

  const [acceptedAccessories, setAcceptedAccessories] = useState<string[]>([])

  /*
    Quantité demandée. Elle était figée à 1 : le bouton envoyait toujours une
    unité, quel que soit l'écran. La maquette V2 pose un sélecteur à gauche du
    bouton, et le serveur, lui, savait déjà recevoir une quantité, la borner au
    stock vendable et le dire quand il en accorde moins.

    Elle revient à 1 dès que le conditionnement change : une quantité de cinq
    retenue sur un conditionnement en stock n'a aucune raison d'être reportée
    sur un autre qui n'en a que deux.
  */
  const [quantite, setQuantite] = useState(1)

  /*
    Apparition de la barre fixe sur grand écran.

    La référence la révèle une fois le bouton principal dépassé. En dessous du
    basculement elle est posée en permanence, donc l'observateur ne sert plus à
    rien : l'état reste vrai.
  */
  const boutonRef = useRef<HTMLButtonElement | null>(null)
  const [barreVisible, setBarreVisible] = useState(false)

  useEffect(() => {
    const bouton = boutonRef.current
    if (!bouton) return

    /*
      Visible seulement quand le bouton est sorti par le HAUT.

      Un `IntersectionObserver` ne convient pas ici : il ne se déclenche qu'au
      franchissement d'un bord. Un saut de défilement — une ancre, un retour
      depuis le panier — fait passer le bouton du dessous au-dessus de la
      fenêtre sans qu'il la traverse, le rapport d'intersection reste à zéro,
      et la barre garde l'état qu'elle avait. On lit donc la position à chaque
      défilement, groupée par image pour ne pas relire la mise en page à
      chaque événement.
    */
    let prevu = 0
    const juger = () => {
      prevu = 0
      setBarreVisible(bouton.getBoundingClientRect().bottom < 0)
    }
    const planifier = () => {
      if (prevu) return
      prevu = requestAnimationFrame(juger)
    }

    juger()
    window.addEventListener('scroll', planifier, { passive: true })
    window.addEventListener('resize', planifier)
    return () => {
      if (prevu) cancelAnimationFrame(prevu)
      window.removeEventListener('scroll', planifier)
      window.removeEventListener('resize', planifier)
    }
  }, [])

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
  /*
    Compatibilité non établie : l'achat reste autorisé — c'est la règle métier
    existante, et refuser la vente d'une pièce dont on ignore seulement si elle
    convient serait aussi faux que l'affirmer. Mais ce n'est plus l'action mise
    en avant : vérifier passe devant, acheter reste possible et le dit.
  */
  const inconnu = Boolean(vehicleLabel) && selected.fitment.status === 'UNKNOWN'
  const purchasable = isPurchasable(selected.availability) && !incompatible
  /*
    Rupture au sens strict : ni stock, ni vente à découvert. Une pièce
    incompatible n'est pas une rupture — proposer d'être prévenu du retour
    d'une pièce qui ne se monte pas serait absurde.
  */
  const rupture = selected.availability.state === 'OUT_OF_STOCK' && !incompatible
  const lienVerification = `/verification?variante=${encodeURIComponent(selected.id)}`

  /** « 2 × Ampoules LED H7 + 2 × Adaptateur… », construit depuis la vraie composition. */
  const compositionSummary = selected.components
    .map((component) =>
      component.quantity > 1
        ? `${component.quantity} × ${component.productName}`
        : component.productName,
    )
    .join(' + ')

  const libelleBouton = pending
    ? 'Ajout en cours…'
    : incompatible
      ? 'Incompatible avec votre véhicule'
      : `Ajouter ${selected.name.toLowerCase()}`

  function submit() {
    setFeedback(null)
    startTransition(async () => {
      const result = await addToCart({
        variantId: selected.id,
        quantity: quantite,
        extraVariantIds: acceptedAccessories,
      })
      if (result.ok) {
        setFeedback({ tone: 'ok', text: result.message ?? 'Ajouté au panier.' })
        // Rafraîchit le compteur du header, qui est rendu côté serveur.
        router.refresh()
      } else {
        setFeedback({ tone: 'danger', text: result.error })
      }
    })
  }

  return (
    <div>
      {/* ---- .fit-note : compatibilité pour le véhicule retenu ---- */}
      {vehicleLabel && selected.fitment.status === 'CONFIRMED' ? (
        <div className="mb-[19px] flex items-center gap-2.5 rounded-[7px] bg-ok-soft p-3 text-[#2a6441] fiche:mb-5 fiche:px-3 fiche:py-[11px]">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white">
            <IconCheck className="size-[13px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <strong className="mb-px block text-[11px] min-[1101px]:text-[10px] min-[1281px]:text-[11px]">
              La configuration pour votre {vehicleLabel}
            </strong>
            {compositionSummary ? (
              <span className="block text-[10px] text-[#4a7359]">{compositionSummary}</span>
            ) : selected.fitment.quantity > 1 ? (
              <span className="block text-[10px] text-[#4a7359]">
                {selected.fitment.quantity} nécessaires pour cet emplacement
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/*
        Compatibilité non établie.

        Le bandeau faisait un paragraphe au-dessus du prix et renvoyait vers
        une page de contact non construite ; pendant ce temps le bouton
        principal restait « Ajouter au panier ». La phrase tient maintenant en
        une ligne, le détail est accessible juste dessous, et c'est la
        vérification qui devient l'action principale (plus bas).
      */}
      {vehicleLabel && inconnu ? (
        <div className="mb-5 rounded-[7px] bg-warn-soft p-3 text-[#8d5420]">
          <p className="flex items-center gap-2.5 text-[11px] font-bold">
            <IconInfo className="size-4 shrink-0" />
            Compatibilité à vérifier pour votre {vehicleLabel}.
          </p>
          <details className="group mt-1.5">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-[10px] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              Pourquoi
              <span aria-hidden="true" className="ml-1.5 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-1 text-[10px] leading-[1.7]">
              Nous n&apos;avons pas l&apos;information nécessaire pour confirmer que cette
              référence convient à ce véhicule et à son équipement d&apos;origine. Une donnée
              manquante ne vaut pas compatibilité : nous préférons le dire et vérifier.
            </p>
          </details>
        </div>
      ) : null}

      {incompatible ? (
        <Alert
          tone="danger"
          title="Cette référence ne convient pas à votre véhicule."
          className="mb-5"
        >
          {selected.fitment.restrictions ??
            "L'équipement d'origine du véhicule sélectionné n'accepte pas cette référence."}{' '}
          <Link href="/vehicule/resultats" className="font-semibold underline underline-offset-4">
            Voir ce qui convient à votre véhicule
          </Link>
          .
        </Alert>
      ) : null}

      {!vehicleLabel ? (
        <Alert tone="info" title="Indiquez votre véhicule." className="mb-5">
          Le bon éclairage dépend du bloc optique et de l&apos;équipement d&apos;origine, pas
          seulement du culot.{' '}
          <Link href="/vehicule" className="font-semibold underline underline-offset-4">
            Choisir mon véhicule
          </Link>{' '}
          pour savoir si cette référence vous convient.
        </Alert>
      ) : null}

      {/* ---- .pack-heading + .pack-options ---- */}
      {variants.length > 1 ? (
        <fieldset>
          <div className="mb-2.5 flex items-center justify-between gap-4 text-[12px] font-bold fiche:text-[11px]">
            <legend>Choisissez votre kit</legend>
            <a
              href={contentAnchor}
              className="shrink-0 text-[10px] text-[#6b6d70] underline underline-offset-2 hover:text-ink"
            >
              Voir le contenu
            </a>
          </div>

          <div className="grid gap-2">
            {variants.map((variant) => {
              const active = variant.id === selected.id
              const recommended = variant.id === recommendedVariantId
              const available = isPurchasable(variant.availability)
              return (
                <label
                  key={variant.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-[11px] rounded-lg transition-colors fiche:gap-2.5',
                    // Le contour de focus de l'étiquette : voir globals.css.
                    'choix-conditionnement',
                    active
                      ? 'border-[1.5px] border-brand bg-[#fdf6f5] px-[12.5px] py-[14.5px] fiche:px-[9.5px] fiche:py-[12.5px] min-[1101px]:px-[13.5px]'
                      : 'border border-[#ddddda] px-[13px] py-[15px] fiche:px-2.5 fiche:py-[13px] min-[1101px]:px-3.5',
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
                    className="absolute size-px opacity-0"
                  />

                  {/* .radio-dot : le bouton radio, dessiné. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative block size-[15px] shrink-0 rounded-full border',
                      active
                        ? 'border-brand after:absolute after:inset-[3px] after:rounded-full after:bg-brand'
                        : 'border-[#b5b5b1]',
                    )}
                  />

                  <span className="flex min-w-0 flex-col gap-px">
                    {recommended ? (
                      <span className="mb-0.5 text-[6.5px] font-bold tracking-[0.5px] text-brand uppercase fiche:text-[6px] min-[1101px]:text-[7px] min-[1101px]:tracking-[0.7px]">
                        Recommandé pour votre véhicule
                      </span>
                    ) : null}
                    <strong className="text-[13px] fiche:text-[12px]">{variant.name}</strong>
                    <small className="text-[10px] text-[#777974] fiche:text-[9px] min-[1281px]:text-[10px]">
                      {variant.components.length > 0
                        ? 'Ampoules + accessoires nécessaires'
                        : variant.missingAccessories.length > 0
                          ? 'Vous possédez déjà les accessoires'
                          : PACKAGING_LABELS[variant.packaging]}
                    </small>
                    {!available ? (
                      <small className="text-[10px] font-semibold text-muted">
                        {availabilityLabel(variant.availability)}
                      </small>
                    ) : null}
                  </span>

                  <span className="ml-auto shrink-0 text-[13px] font-bold whitespace-nowrap">
                    {formatPrice(variant.priceCents)}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {/* .pack-explanation : réserve sa ligne même quand elle est vide. */}
      <p className="my-[9px] mb-[19px] flex min-h-3.5 items-center gap-1.5 text-[9px] leading-[1.5] text-[#52705c] fiche:mb-[18px]">
        {selected.components.length > 0 ? (
          <>
            <IconCheckCircle className="size-3 shrink-0" />
            {selected.components
              .filter((component) => component.required)
              .map((component) => component.productName)
              .join(' et ')}{' '}
            inclus. Aucun accessoire à rechercher.
          </>
        ) : null}
      </p>

      {/* ---- Accessoires nécessaires non inclus : proposés, jamais cochés ---- */}
      {accessories.length > 0 ? (
        <fieldset className="mb-[18px] rounded-[7px] border border-warn-border bg-warn-soft px-3 py-3">
          <legend className="px-1 text-[10px] font-bold">
            Nécessaire pour ce montage, non inclus
          </legend>
          <p className="mb-2 text-[10px] text-muted-strong">
            Ce conditionnement ne contient pas ces pièces. Elles ne sont ajoutées que si vous les
            cochez.
          </p>
          <div className="flex flex-col gap-1.5">
            {accessories.map((accessory) => (
              <label key={accessory.variantId} className="flex cursor-pointer items-start gap-2.5">
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
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="min-w-0 flex-1 text-[10px]">
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

      {/* ---- .price-row ---- */}
      <div className="mb-[15px] flex items-center justify-between gap-5">
        <div>
          <strong className="block text-[33px] leading-[1.1] font-bold tracking-[-1.5px] fiche:text-[35px]">
            {formatPrice(total)}
          </strong>
          <span className="mt-[5px] block text-[10px] text-[#8e9686] min-[1450px]:text-[11px]">
            TTC · {selected.name.toLowerCase()}
            {accessoriesTotal > 0 ? ' et accessoires cochés' : null}
          </span>
          {/*
            Le prix affiché reste celui d'UN conditionnement. Multiplier le
            grand chiffre par la quantité ferait lire « 299,70 € » comme le
            prix du pack, ce qu'il n'est pas ; le total part donc sur sa propre
            ligne, nommé.
          */}
          {quantite > 1 ? (
            <span className="mt-[3px] block text-[10px] font-semibold text-ink">
              {quantite} × {formatPrice(total)} = {formatPrice(total * quantite)}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-[10px] fiche:text-[9px]',
            purchasable ? 'text-ok' : 'text-muted',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-[5px] rounded-full', purchasable ? 'bg-ok' : 'bg-line-strong')}
          />
          {availabilityLabel(selected.availability)}
        </span>
      </div>

      {/*
        .primary.add-main — 51 px, pleine largeur.

        Quand la compatibilité n'est pas établie, c'est la vérification qui
        occupe cette place : proposer d'abord « Ajouter au panier » sur une
        pièce dont on ignore si elle se monte revient à faire porter le risque
        au client. L'achat reste possible juste en dessous, nommé pour ce
        qu'il est.
      */}
      {/*
        L'ordre de ces trois cas est une décision, pas une commodité.

        La rupture passe AVANT la compatibilité non établie : quand il n'y a
        rien à vendre, proposer « Faire vérifier mon véhicule » puis
        « Commander sans attendre la vérification » conduit le client vers un
        bouton qui ne peut rien faire. L'alerte de retour est la seule action
        utile des deux côtés, et la vérification reste joignable par le bloc
        d'avertissement au-dessus.
      */}
      {rupture ? (
        <StockAlertForm variantId={selected.id} />
      ) : inconnu ? (
        <div className="flex flex-col gap-2">
          <Link
            href={lienVerification}
            className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-[7px] bg-brand px-[22px] py-3 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark fiche:min-h-[51px]"
          >
            <IconShield className="size-[19px] shrink-0" />
            <span className="flex-1">Faire vérifier mon véhicule</span>
            <IconChevronRight className="ml-auto size-[17px] shrink-0" />
          </Link>

          <div className="flex gap-[9px]">
            <SelecteurQuantite
              valeur={quantite}
              onChange={setQuantite}
              maximum={selected.availability.sellable}
              disabled={!purchasable || pending}
            />
            <button
              ref={boutonRef}
              type="button"
              disabled={!purchasable || pending}
              onClick={submit}
              className="flex min-h-[50px] flex-1 items-center justify-center gap-3 rounded-md border border-[#c7c9c0] bg-white px-[17px] py-2.5 text-[11px] font-semibold transition-colors hover:border-slate-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconCart className="size-4 shrink-0" />
              {pending ? 'Ajout en cours…' : 'Commander sans attendre la vérification'}
            </button>
          </div>
        </div>
      ) : (
        /* .buy-actions : la quantité à gauche, le bouton occupe le reste. */
        <div className="flex gap-[9px] fiche:gap-[10px]">
          <SelecteurQuantite
            valeur={quantite}
            onChange={setQuantite}
            maximum={selected.availability.sellable}
            disabled={!purchasable || pending}
          />
          <button
            ref={boutonRef}
            type="button"
            disabled={!purchasable || pending}
            onClick={submit}
            className="flex min-h-[50px] flex-1 items-center justify-center gap-3 rounded-md bg-brand px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb] fiche:min-h-[51px] fiche:px-5"
          >
            <IconCart className="size-[18px] shrink-0" />
            <span className="flex-1 text-center">{libelleBouton}</span>
            <IconChevronRight className="size-[17px] shrink-0" />
          </button>
        </div>
      )}

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

      {/* ---- .shipping ---- */}
      {delivery ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-[7px] gap-y-[3px] text-[9px] text-[#696b68] fiche:mt-3 min-[1101px]:text-[8px] min-[1281px]:text-[9px]">
          <IconTruck className="size-[15px] shrink-0 text-ok" />
          <span>
            <strong className="text-[#365d42]">{delivery.priceLabel}</strong>
            {delivery.delayLabel ? ` · ${delivery.delayLabel}` : null}
            {delivery.missingForFreeCents ? (
              <span className="block">
                Plus que {formatPrice(delivery.missingForFreeCents)} pour la livraison offerte.
              </span>
            ) : null}
          </span>
          <Link
            href="/livraison-retours"
            className="ml-auto shrink-0 text-[8px] text-[#6b6d70] underline underline-offset-2 hover:text-ink fiche:text-[9px]"
          >
            Détails
          </Link>
        </p>
      ) : null}

      {/* ---- .purchase-reassurance ---- */}
      <div className="mt-4 flex justify-center gap-5 border-b border-line pb-[15px] text-[9px] text-[#6a6c6c] fiche:mt-3.5 fiche:gap-[23px]">
        {returnWindowDays ? (
          <span className="flex items-center gap-1.5">
            <IconClock className="size-[13px] shrink-0" />
            Retours sous {returnWindowDays} jours
          </span>
        ) : null}
        <Link href="/contact" className="flex items-center gap-1.5 hover:underline">
          <IconWrench className="size-[13px] shrink-0" />
          Assistance au montage
        </Link>
      </div>

      {/* ---- .road-note : l'homologation, dite telle qu'elle est connue ---- */}
      <div className="mt-2.5 text-[8px] text-[#85837e]">
        <RoadApprovalNote
          status={selected.fitment.roadApproval}
          market={selected.fitment.approvalMarket}
          note={selected.fitment.approvalNote}
        />
      </div>

      {/*
        .sticky-buy — posée en bas en mobile, révélée au défilement au-delà du
        basculement. Même fonction d'ajout que le bouton principal.
      */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 border-t border-[#e2e3df] bg-white/93 backdrop-blur-xl transition-[translate] duration-200',
          barreVisible ? 'translate-y-0' : 'max-fiche:translate-y-0 fiche:translate-y-[110%]',
        )}
      >
        <div className="container-page flex min-h-[77px] items-center justify-between gap-3.5 pb-[env(safe-area-inset-bottom)] fiche:min-h-[78px] fiche:gap-[25px]">
          {/* .sticky-product : masqué en mobile, où la place manque. */}
          <div className="hidden items-center gap-3 fiche:flex">
            {/*
              .sticky-thumb — la barre rappelle ce qu'on achète. Une icône de
              panier ne le disait pas : elle désignait l'action, pas l'article,
              et deux fiches ouvertes côte à côte se ressemblaient.
            */}
            {thumbnail ? (
              <span className="relative size-[46px] shrink-0 overflow-hidden rounded-[5px] bg-[#f1f4eb]">
                <Image
                  src={thumbnail.url}
                  alt=""
                  fill
                  sizes="46px"
                  className="object-cover mix-blend-multiply"
                />
              </span>
            ) : (
              <IconCart className="size-5 shrink-0 text-brand" />
            )}
            <div className="min-w-0">
              <strong className="block text-[11px] leading-[1.3] min-[1101px]:text-[12px]">
                {productName}
              </strong>
              <span className="mt-[3px] block text-[9px] text-[#99a48e]">
                {selected.name}
                {vehicleLabel ? ` · ${vehicleLabel}` : null}
              </span>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-3.5 fiche:w-auto fiche:gap-[25px]">
            <div className="shrink-0">
              <strong className="block text-[24px] leading-[1.2] tracking-[-0.9px] fiche:text-[25px] fiche:tracking-[-1px]">
                {formatPrice(total)}
              </strong>
              <span className="mt-[1px] block text-[7px] leading-[1.4] whitespace-nowrap text-[#94a387] fiche:text-[8px]">
                TTC{delivery?.priceLabel ? ` · ${delivery.priceLabel.toLowerCase()}` : null}
              </span>
            </div>

            {/* La barre fixe ne peut pas proposer autre chose que le bloc
                d'achat : une compatibilité non établie n'y devient pas un
                « Ajouter » tranquille. */}
            {inconnu ? (
              <Link
                href={lienVerification}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-[7px] rounded-md bg-brand px-3 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-dark fiche:min-h-[45px] fiche:min-w-[210px] fiche:flex-none fiche:gap-3 fiche:text-[12px] min-[1101px]:min-w-[236px]"
              >
                <IconShield className="size-[17px] shrink-0" />
                <span className="truncate">Faire vérifier mon véhicule</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={!purchasable || pending}
                onClick={submit}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-[7px] rounded-md bg-brand px-3 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb] fiche:min-h-[45px] fiche:min-w-[210px] fiche:flex-none fiche:gap-3 fiche:text-[12px] min-[1101px]:min-w-[236px]"
              >
                <IconCart className="size-[17px] shrink-0" />
                <span className="truncate">{libelleBouton}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Sélecteur de quantité — `.quantity` de la maquette V2 : 100 × 51 px, filet
 * à 6 px de rayon, moins / valeur / plus.
 *
 * Le maximum vient du stock réellement vendable. `null` signifie que la vente
 * à découvert est ouverte : il n'y a alors pas de borne à poser côté client,
 * et c'est le serveur qui tranchera de toute façon — il borne déjà la quantité
 * demandée et dit quand il en accorde moins.
 */
function SelecteurQuantite({
  valeur,
  onChange,
  maximum,
  disabled,
}: {
  valeur: number
  onChange: (valeur: number) => void
  maximum: number | null
  disabled: boolean
}) {
  // Garde-fou d'interface, pas de règle commerciale : au-delà, on passe par le
  // devis plutôt que par un champ.
  const plafond = Math.min(maximum ?? 99, 99)

  return (
    <div
      role="group"
      aria-label="Quantité"
      className="flex h-[50px] w-[87px] shrink-0 items-center justify-between rounded-md border border-[#dfe4d9] fiche:h-[51px] fiche:w-[100px]"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, valeur - 1))}
        disabled={disabled || valeur <= 1}
        aria-label="Diminuer la quantité"
        className="grid h-full w-[33px] place-items-center text-muted-strong transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMinus className="size-[13px]" strokeWidth={2} />
      </button>

      {/*
        `output` avec `aria-live` : la valeur change sans que le focus bouge,
        et un lecteur d'écran doit l'entendre sans avoir à relire la ligne.
      */}
      <output aria-live="polite" className="min-w-[17px] text-center text-[12px] font-bold">
        {valeur}
      </output>

      <button
        type="button"
        onClick={() => onChange(Math.min(plafond, valeur + 1))}
        disabled={disabled || valeur >= plafond}
        aria-label="Augmenter la quantité"
        className="grid h-full w-[33px] place-items-center text-muted-strong transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconPlus className="size-[13px]" strokeWidth={2} />
      </button>
    </div>
  )
}
