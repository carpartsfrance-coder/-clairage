'use client'

import { leVehicule, typeHorsAmpoules } from '@/lib/types-produit'
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
import { nomUtileDuConditionnement } from '@/lib/nom-conditionnement'
import {
  IconCart,
  IconMinus,
  IconPlus,
  IconCheck,
  IconInfo,
  IconShield,
  IconLock,
  IconCheckCircle,
  IconChevronRight,
  IconReturn,
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
 * Écart au seuil de livraison offerte en dessous duquel la jauge s'affiche :
 * 25 €, le prix d'un petit pack. Au-delà, le seuil est annoncé sans barre.
 */
const ECART_MAX_JAUGE_CENTS = 2500

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
  garantie = null,
  concuPour = null,
  moto = false,
  contentAnchor = '#dans-votre-kit',
  vehiculeDesComplements = null,
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
  /** « 5 ans » : la garantie commerciale, annoncée en premier. */
  garantie?: string | null
  /** « Toyota Hilux 8 (2015–2025) » quand la fiche est composée pour un véhicule. */
  concuPour?: string | null
  /** Fiche moto : « la Yamaha », pas « le Yamaha ». */
  moto?: boolean
  contentAnchor?: string
  /**
   * Nom du véhicule quand la fiche propose d'autres packs pour lui
   * (section `#completer`). Null : pas de lien vers ces packs.
   */
  vehiculeDesComplements?: string | null
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
  /* Le nom du conditionnement ne s'affiche que s'il dit autre chose que le titre. */
  const conditionnementAffiche = nomUtileDuConditionnement(selected.name, productName)

  // L'accroche de livraison suit le total réel : passer du kit aux ampoules
  // seules peut faire repasser sous le seuil de franchise, et cela doit se voir
  // tout de suite plutôt qu'au paiement.
  const sousTotal = total * quantite
  const delivery = buildDeliveryTeaser(shippingOffers, sousTotal)
  /*
    La jauge ne sert que quand le seuil est à portée : « plus que 51 € »
    décourage plus qu'il n'aide. Au-delà de cet écart, une ligne simple
    annonce le seuil, sans barre.
  */
  const ecartManquant = delivery?.missingForFreeCents ?? null
  const jaugeAPortee = ecartManquant !== null && ecartManquant <= ECART_MAX_JAUGE_CENTS
  const seuilFranchiseCents = ecartManquant !== null ? sousTotal + ecartManquant : null
  /* Remplissage de la jauge de livraison offerte, en pourcentage. */
  const progressionFranchise = !delivery
    ? 0
    : delivery.missingForFreeCents
      ? Math.min(100, Math.round((sousTotal / (sousTotal + delivery.missingForFreeCents)) * 100))
      : 100
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

  const libelleBouton = pending
    ? 'Ajout en cours…'
    : incompatible
      ? 'Incompatible avec votre véhicule'
      : 'Ajouter au panier'

  function submit() {
    setFeedback(null)
    startTransition(async () => {
      const result = await addToCart({
        variantId: selected.id,
        quantity: quantite,
        extraVariantIds: acceptedAccessories,
      })
      if (result.ok) {
        setFeedback({
          tone: 'ok',
          text: [result.message ?? 'Ajouté au panier.', result.livraison].filter(Boolean).join(' '),
        })
        // Rafraîchit le compteur du header, qui est rendu côté serveur.
        router.refresh()
      } else {
        setFeedback({ tone: 'danger', text: result.error })
      }
    })
  }

  return (
    <div>
      {/*
        .fit-note — refonte LEDVROOM : une seule ligne.

        La composition (« 2 × … + 2 × … ») n'est plus répétée ici : elle est
        dans la vue « Dans le pack » de la galerie et dans la section du
        contenu, et elle allongeait le bloc d'achat avant même le prix.
      */}
      {vehicleLabel && selected.fitment.status === 'CONFIRMED' ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-ok-border bg-ok-soft px-3.5 py-3 text-[14px] text-[#1f5a39]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ok text-white">
            <IconCheck className="size-3.5" strokeWidth={2.5} />
          </span>
          <strong className="min-w-0 flex-1 leading-[1.35]">
            Compatible avec votre {vehicleLabel}
          </strong>
          <Link
            href="/vehicule"
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-ink"
          >
            Changer
          </Link>
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
        <div className="mb-4 rounded-xl bg-warn-soft p-3.5 text-[#7a4a1c]">
          <p className="flex items-center gap-2.5 text-[14px] font-bold">
            <IconInfo className="size-4 shrink-0" />
            Compatibilité à vérifier pour votre {vehicleLabel}.
          </p>
          <details className="group mt-1.5">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-[13px] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              Pourquoi
              <span aria-hidden="true" className="ml-1.5 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-1 text-[13px] leading-[1.6]">
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

      {!vehicleLabel && concuPour ? (
        <Alert
          tone="ok"
          title={
            typeHorsAmpoules(productName)
              ? `Prévu pour ${leVehicule(concuPour, moto)}.`
              : `Pack composé pour ${leVehicule(concuPour, moto)}.`
          }
          className="mb-5"
        >
          {typeHorsAmpoules(productName)
            ? 'Ce produit est choisi pour ce véhicule.'
            : 'Les ampoules et les LED sont choisies pour ce véhicule.'}{' '}
          <Link href="/vehicule" className="font-semibold underline underline-offset-4">
            Indiquez votre véhicule
          </Link>{' '}
          pour confirmer qu&apos;il correspond à votre version et à son équipement d&apos;origine.
        </Alert>
      ) : null}

      {!vehicleLabel && !concuPour ? (
        <Alert tone="info" title="Indiquez votre véhicule." className="mb-5">
          Le bon éclairage dépend du bloc optique et de l&apos;équipement d&apos;origine, pas
          seulement du culot.{' '}
          <Link href="/vehicule" className="font-semibold underline underline-offset-4">
            Choisir mon véhicule
          </Link>{' '}
          pour savoir si cette référence vous convient.
        </Alert>
      ) : null}

      {/* ---- Options (type de ballast, couleur…) : une liste par option ---- */}
      {variants.length > 1 && optionsDesVariantes(variants) ? (
        <ChoixDOptions
          variants={variants}
          selectedId={selected.id}
          onChange={(id) => {
            setSelectedId(id)
            setAcceptedAccessories([])
            setFeedback(null)
          }}
        />
      ) : null}

      {/* ---- .pack-heading + .pack-options ---- */}
      {variants.length > 1 && !optionsDesVariantes(variants) ? (
        <fieldset>
          <div className="mb-2.5 flex items-center justify-between gap-4 text-[15px] font-bold">
            <legend>Choisissez votre kit</legend>
            <a
              href={contentAnchor}
              className="shrink-0 text-[13px] font-normal text-[#55585b] underline underline-offset-2 hover:text-ink"
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
                    'flex cursor-pointer items-center gap-3 rounded-xl transition-colors',
                    // Le contour de focus de l'étiquette : voir globals.css.
                    'choix-conditionnement',
                    active
                      ? 'border-2 border-brand bg-[#fdf6f5] px-[13px] py-[13px]'
                      : 'border border-[#dcdcdc] px-[14px] py-[14px]',
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
                      'relative block size-[18px] shrink-0 rounded-full border',
                      active
                        ? 'border-brand after:absolute after:inset-[4px] after:rounded-full after:bg-brand'
                        : 'border-[#b3b3b3]',
                    )}
                  />

                  <span className="flex min-w-0 flex-col gap-px">
                    {recommended ? (
                      <span className="mb-0.5 text-[11px] font-bold tracking-[0.5px] text-brand uppercase">
                        Recommandé pour votre véhicule
                      </span>
                    ) : null}
                    <strong className="text-[15px]">{variant.name}</strong>
                    <small className="text-[13px] text-[#5f6266]">
                      {variant.components.length > 0
                        ? 'Ampoules + accessoires nécessaires'
                        : variant.missingAccessories.length > 0
                          ? 'Vous possédez déjà les accessoires'
                          : PACKAGING_LABELS[variant.packaging]}
                    </small>
                    {!available ? (
                      <small className="text-[13px] font-semibold text-muted">
                        {availabilityLabel(variant.availability)}
                      </small>
                    ) : null}
                  </span>

                  <span className="ml-auto shrink-0 text-[15px] font-bold whitespace-nowrap">
                    {formatPrice(variant.priceCents)}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {/* .pack-explanation : réserve sa ligne même quand elle est vide. */}
      <p className="mt-2.5 mb-4 flex items-center gap-1.5 text-[13px] leading-[1.5] text-[#2f6a45] empty:hidden">
        {selected.components.length > 0 ? (
          <>
            <IconCheckCircle className="size-4 shrink-0" />
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
        <fieldset className="mb-4 rounded-xl border border-warn-border bg-warn-soft px-3.5 py-3">
          <legend className="px-1 text-[13px] font-bold">
            Nécessaire pour ce montage, non inclus
          </legend>
          <p className="mb-2 text-[13px] text-muted-strong">
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
                <span className="min-w-0 flex-1 text-[13px]">
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
      <div className="mb-3 flex items-end justify-between gap-5">
        <div>
          <strong className="block text-[34px] leading-[1.05] font-bold tracking-[-1.2px] fiche:text-[40px] fiche:tracking-[-1.5px]">
            {formatPrice(total)}
          </strong>
          <span className="mt-1.5 block text-[13px] text-[#6b6d70]">
            TTC{conditionnementAffiche ? ` · ${conditionnementAffiche.toLowerCase()}` : null}
            {accessoriesTotal > 0 ? ' et accessoires cochés' : null}
          </span>
          {/*
            Le prix affiché reste celui d'UN conditionnement : le total part
            sur sa propre ligne, nommé, quand la quantité dépasse un.
          */}
          {quantite > 1 ? (
            <span className="mt-1 block text-[13px] font-semibold text-ink">
              {quantite} × {formatPrice(total)} = {formatPrice(total * quantite)}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-[14px] font-semibold',
            purchasable ? 'text-ok' : 'text-muted',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', purchasable ? 'bg-ok' : 'bg-line-strong')}
          />
          {availabilityLabel(selected.availability)}
        </span>
      </div>

      {/*
        Livraison offerte — refonte LEDVROOM.

        Le seuil de franchise se lit AVANT le bouton : c'est là qu'il pèse sur
        la décision. Il suit le total réel (conditionnement, accessoires
        cochés, quantité) et disparaît quand aucune franchise n'est configurée.

        Trois états : seuil atteint (une ligne verte), seuil à portée (la
        jauge), seuil lointain (une ligne neutre). Tant qu'il n'est pas
        atteint, un lien mène aux autres packs du même véhicule.
      */}
      {delivery && delivery.isSettled ? (
        <p className="mb-3.5 flex items-center gap-2 text-[14px] font-bold text-[#1f5a39]">
          <IconTruck className="size-[18px] shrink-0" />
          La livraison est offerte
        </p>
      ) : null}
      {delivery && ecartManquant !== null && seuilFranchiseCents !== null ? (
        jaugeAPortee ? (
          <div className="mb-3.5 rounded-xl bg-[#f5f6f7] px-3.5 py-3 text-[14px]">
            <p>
              Plus que <strong>{formatPrice(ecartManquant)}</strong> pour la livraison offerte
            </p>
            <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e1e3e6]">
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${progressionFranchise}%` }}
              />
            </div>
            {vehiculeDesComplements ? (
              <a
                href="#completer"
                className="mt-2 inline-flex min-h-6 items-center gap-1 text-[13px] font-bold text-ink underline underline-offset-2 hover:text-brand-dark"
              >
                Voir les packs pour votre {vehiculeDesComplements}
                <IconChevronRight className="size-3.5" />
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mb-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#3c4047]">
            <IconTruck className="size-[18px] shrink-0 text-[#6b6f75]" />
            <span>
              Livraison offerte dès <strong className="text-ink">{formatPrice(seuilFranchiseCents)}</strong>
            </span>
            {vehiculeDesComplements ? (
              <a
                href="#completer"
                className="inline-flex min-h-6 items-center gap-1 text-[13px] font-bold text-ink underline underline-offset-2 hover:text-brand-dark"
              >
                Voir les packs pour votre {vehiculeDesComplements}
                <IconChevronRight className="size-3.5" />
              </a>
            ) : null}
          </p>
        )
      ) : null}

      {/*
        .primary.add-main — 56 px, pleine largeur.

        L'ordre des trois cas est une décision : la rupture passe avant la
        compatibilité non établie (rien à vendre, l'alerte de retour est la
        seule action utile), et une compatibilité non établie met la
        vérification en avant — l'achat reste possible juste dessous, nommé
        pour ce qu'il est.
      */}
      {rupture ? (
        <StockAlertForm variantId={selected.id} />
      ) : inconnu ? (
        <div className="flex flex-col gap-2">
          <Link
            href={lienVerification}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-brand px-5 py-3 text-[16px] font-bold text-white transition-colors hover:bg-brand-dark"
          >
            <IconShield className="size-5 shrink-0" />
            <span className="flex-1">Faire vérifier mon véhicule</span>
            <IconChevronRight className="ml-auto size-[18px] shrink-0" />
          </Link>

          <div className="flex gap-2.5">
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
              className="flex min-h-14 flex-1 items-center justify-center gap-3 rounded-xl border border-[#c4c4c4] bg-white px-4 py-2.5 text-[14px] font-semibold transition-colors hover:border-slate-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconCart className="size-[18px] shrink-0" />
              {pending ? 'Ajout en cours…' : 'Commander sans attendre la vérification'}
            </button>
          </div>
        </div>
      ) : (
        /* .buy-actions : la quantité à gauche, le bouton occupe le reste. */
        <div className="flex gap-2.5">
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
            className="flex min-h-14 flex-1 items-center justify-center gap-3 rounded-xl bg-brand px-5 py-3 text-[16px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb] fiche:text-[17px]"
          >
            <IconCart className="size-5 shrink-0" />
            <span>{libelleBouton}</span>
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

      {/* ---- .shipping : le délai, et le lien vers les conditions ---- */}
      {delivery ? (
        <p className="mt-3.5 flex items-start gap-2 text-[14px] text-[#3c4047]">
          <IconTruck className="mt-0.5 size-[18px] shrink-0 text-ok" />
          <span className="min-w-0 flex-1">
            <strong className="text-ink">{delivery.priceLabel}</strong>
            {delivery.delayLabel ? ` · ${delivery.delayLabel}` : null}
          </span>
          <Link
            href="/livraison-retours"
            className="shrink-0 text-[13px] text-[#55585b] underline underline-offset-2 hover:text-ink"
          >
            Détails
          </Link>
        </p>
      ) : null}

      {/* ---- .purchase-reassurance ---- */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-4 text-[13px] text-[#3c4047]">
        {garantie ? (
          <Link href="/garanties" className="flex items-center gap-1.5 font-semibold text-ink hover:underline">
            <IconShield className="size-4 shrink-0 text-ok" />
            Garantie {garantie}
          </Link>
        ) : null}
        {returnWindowDays ? (
          <span className="flex items-center gap-1.5">
            <IconReturn className="size-4 shrink-0" />
            Retours sous {returnWindowDays} jours
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <IconLock className="size-4 shrink-0" />
          Paiement sécurisé
        </span>
        <Link href="/contact" className="flex items-center gap-1.5 hover:underline">
          <IconWrench className="size-4 shrink-0" />
          Assistance au montage
        </Link>
      </div>

      {/*
        ---- .road-note : seulement quand l'article N'EST PAS homologué ----

        Consigne de l'exploitant (7 novembre 2026) : l'homologation des
        ampoules ne s'affiche pas sur les fiches. « Homologation à confirmer »,
        qui sortait sur toutes les fiches faute de donnée, laissait en plus
        croire l'inverse pour des ampoules qui le sont. Un article déclaré non
        homologué en back-office, lui, reste signalé : le client doit le
        savoir avant d'acheter.
      */}
      {selected.fitment.roadApproval === 'NOT_APPROVED' ? (
        <div className="mt-3 text-[13px]">
          <RoadApprovalNote
            status={selected.fitment.roadApproval}
            market={selected.fitment.approvalMarket}
            note={selected.fitment.approvalNote}
          />
        </div>
      ) : null}

      {/*
        .sticky-buy — posée en bas en mobile, révélée au défilement au-delà du
        basculement. Même fonction d'ajout que le bouton principal.
      */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 border-t border-[#e1e1e1] bg-white/95 shadow-[0_-6px_20px_rgb(17_18_20/0.08)] backdrop-blur-xl transition-[translate] duration-200',
          barreVisible ? 'translate-y-0' : 'max-fiche:translate-y-0 fiche:translate-y-[110%]',
        )}
      >
        <div className="container-page flex min-h-[76px] items-center justify-between gap-3.5 pb-[env(safe-area-inset-bottom)] fiche:min-h-[78px] fiche:gap-6">
          {/* .sticky-product : masqué en mobile, où la place manque. */}
          <div className="hidden items-center gap-3 fiche:flex">
            {thumbnail ? (
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-[#f2f2f2]">
                <Image src={thumbnail.url} alt="" fill sizes="48px" className="object-cover" />
              </span>
            ) : (
              <IconCart className="size-5 shrink-0 text-brand" />
            )}
            <div className="min-w-0">
              <strong className="block text-[14px] leading-[1.3]">{productName}</strong>
              <span className="mt-0.5 block text-[12px] text-[#6b6d70]">
                {selected.name}
                {vehicleLabel ? ` · ${vehicleLabel}` : null}
              </span>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-3.5 fiche:w-auto fiche:gap-6">
            <div className="shrink-0">
              <strong className="block text-[21px] leading-[1.15] tracking-[-0.6px] fiche:text-[24px]">
                {formatPrice(total)}
              </strong>
              <span className="mt-0.5 block text-[11px] leading-[1.4] whitespace-nowrap text-[#6b6d70] fiche:text-[12px]">
                TTC{delivery?.priceLabel ? ` · ${delivery.priceLabel.toLowerCase()}` : null}
              </span>
            </div>

            {/* La barre fixe ne propose rien d'autre que le bloc d'achat. */}
            {inconnu ? (
              <Link
                href={lienVerification}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-brand-dark fiche:min-w-[240px] fiche:flex-none"
              >
                <IconShield className="size-[18px] shrink-0" />
                <span className="truncate">Faire vérifier mon véhicule</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={!purchasable || pending}
                onClick={submit}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#bbb] fiche:min-w-[240px] fiche:flex-none"
              >
                <IconCart className="size-[18px] shrink-0" />
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
      className="flex h-14 w-[104px] shrink-0 items-center justify-between rounded-xl border border-[#d5d7db]"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, valeur - 1))}
        disabled={disabled || valeur <= 1}
        aria-label="Diminuer la quantité"
        className="grid h-full w-[38px] place-items-center text-muted-strong transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMinus className="size-[13px]" strokeWidth={2} />
      </button>

      {/*
        `output` avec `aria-live` : la valeur change sans que le focus bouge,
        et un lecteur d'écran doit l'entendre sans avoir à relire la ligne.
      */}
      <output aria-live="polite" className="min-w-[20px] text-center text-[16px] font-bold">
        {valeur}
      </output>

      <button
        type="button"
        onClick={() => onChange(Math.min(plafond, valeur + 1))}
        disabled={disabled || valeur >= plafond}
        aria-label="Augmenter la quantité"
        className="grid h-full w-[38px] place-items-center text-muted-strong transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconPlus className="size-[13px]" strokeWidth={2} />
      </button>
    </div>
  )
}


/*
  Variantes « à options » : leur nom suit la forme
  « Ballasts : Slim Canbus Pro 35W · Température de couleur : 5000K (blanc pur) ».
  Toutes les variantes ont alors les mêmes libellés d'option, et la fiche montre
  une liste déroulante par option (comme le configurateur du concurrent) plutôt
  qu'une carte par combinaison.
*/
type VarianteNommee = { id: string; name: string; priceCents: number }

function decouper(nom: string): [string, string][] | null {
  const parts = nom.split(' · ').map((x) => x.split(' : '))
  if (parts.some((x) => x.length !== 2 || !x[0] || !x[1])) return null
  return parts.map(([l, v]) => [l.trim(), v.trim()])
}

function optionsDesVariantes(variants: VarianteNommee[]) {
  const d = variants.map((v) => decouper(v.name))
  if (d.some((x) => !x)) return null
  const libelles = d[0]!.map(([l]) => l)
  if (d.some((x) => x!.length !== libelles.length || x!.some(([l], i) => l !== libelles[i]))) return null
  return { libelles, valeurs: d as [string, string][][] }
}

function ChoixDOptions({
  variants,
  selectedId,
  onChange,
}: {
  variants: VarianteNommee[]
  selectedId: string
  onChange: (id: string) => void
}) {
  const o = optionsDesVariantes(variants)!
  const index = Math.max(0, variants.findIndex((v) => v.id === selectedId))
  const courant = o.valeurs[index]
  const choisir = (rang: number, valeur: string) => {
    const voulu = courant.map(([, v], i) => (i === rang ? valeur : v))
    // La combinaison exacte, sinon la première qui garde les choix jusqu'à cette option.
    let i = o.valeurs.findIndex((x) => x.every(([, v], k) => v === voulu[k]))
    if (i < 0) i = o.valeurs.findIndex((x) => x.slice(0, rang + 1).every(([, v], k) => v === voulu[k]))
    if (i >= 0) onChange(variants[i].id)
  }
  return (
    <fieldset className="rounded-xl bg-[#111214] p-4 text-white">
      <legend className="sr-only">Configuration</legend>
      <p className="text-[15px] font-bold">Configuration</p>
      <p className="mt-1 mb-3 text-[13px] text-[#c9ccd1]">Le prix change selon les options choisies.</p>
      <div className="grid gap-2.5">
        {o.libelles.map((libelle, rang) => {
          // Les valeurs possibles, compte tenu des choix des options précédentes.
          const possibles = [
            ...new Set(
              o.valeurs
                .filter((x) => x.slice(0, rang).every(([, v], k) => v === courant[k][1]))
                .map((x) => x[rang][1]),
            ),
          ]
          return (
            <label key={libelle} className="grid gap-1 text-[13px] font-semibold sm:grid-cols-[150px_1fr] sm:items-center">
              <span>{libelle}</span>
              <select
                value={courant[rang][1]}
                onChange={(e) => choisir(rang, e.target.value)}
                className="min-h-10 rounded-[6px] bg-white px-2.5 text-[14px] font-normal text-ink"
              >
                {possibles.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
