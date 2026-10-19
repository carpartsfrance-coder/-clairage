import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { getCart } from '@/lib/cart'
import { getDeliveryTeaser } from '@/lib/shipping'
import { getSelectedVehicle } from '@/lib/session'
import { paymentIsSimulated } from '@/lib/payments'
import { updateCartLine } from '@/lib/actions/cart'
import { formatPrice } from '@/lib/identity'
import { availabilityLabel, isPurchasable } from '@/lib/stock'
import { Alert, EmptyState } from '@/components/ui/Surface'
import { ButtonLink } from '@/components/ui/Button'
import { FitmentBadge } from '@/components/ui/Badge'
import { IconCart } from '@/components/ui/icons'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Panier',
  robots: { index: false, follow: false },
}

/**
 * Modification d'une ligne depuis un formulaire.
 *
 * `updateCartLine` attend un objet ; ce passe-plat traduit le FormData et rien
 * d'autre. Toute la validation (quantité possible, appartenance de la ligne au
 * panier de la session) reste dans l'action, côté serveur.
 */
async function modifierLigne(formData: FormData) {
  'use server'
  await updateCartLine({
    lineId: String(formData.get('lineId') ?? ''),
    quantity: Number(formData.get('quantity') ?? 0),
  })
  revalidatePath('/panier')
}

/**
 * Boutons de quantité.
 *
 * `.cart-item-controls button` de la référence mesure 23 × 22 px. C'est la
 * seule valeur qui n'est pas reprise : une cible de 22 px ne se touche pas.
 * 44 px au doigt, 36 px à partir de `sm`, avec le filet et le rayon de la
 * référence.
 */
const stepButton =
  'inline-flex size-11 items-center justify-center rounded-sm border border-[#dbe0d3] ' +
  'text-base leading-none text-slate-ink transition-colors ' +
  'hover:border-slate-ink hover:bg-surface-soft disabled:opacity-45 ' +
  'disabled:pointer-events-none sm:size-9'

/** `.cart-total-row` : 12 px, libellé à gauche, montant à droite. */
const totalRow = 'flex items-baseline justify-between gap-4 text-[12px]'

export default async function PanierPage() {
  const vehicle = await getSelectedVehicle()
  const cart = await getCart(vehicle?.configurationId ?? null)
  const teaser = cart.lines.length > 0 ? await getDeliveryTeaser(cart.subtotalCents) : null

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Panier' }]} />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Votre panier
        {cart.itemCount > 0 ? (
          <span className="ml-2 text-[12px] font-normal text-[#8a8e83]">
            ({cart.itemCount}
            {cart.itemCount > 1 ? ' articles' : ' article'})
          </span>
        ) : null}
      </h1>

      {cart.lines.length === 0 ? (
        /* .cart-empty : icône de 42 px, titre à 18 px, texte à 12 px. */
        <div className="px-4 py-[70px] text-center">
          <IconCart className="mx-auto size-[42px] text-[#a2a69a]" />
          <h2 className="mt-4 mb-[7px] text-[18px] font-bold">
            Votre passage au blanc commence ici.
          </h2>
          <p className="text-[12px] text-[#8c9184]">
            Partez de votre véhicule pour voir ce qui lui correspond.
          </p>
          <ButtonLink
            href="/vehicule"
            variant="secondary"
            className="mt-5 min-h-[42px] gap-4 rounded-md px-[17px] text-[11px]"
          >
            Choisir mon véhicule
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-8 fiche:flex-row fiche:items-start fiche:gap-[49px]">
          {/* ---------------------------------------------------------------
              Articles
              --------------------------------------------------------------- */}
          <section aria-labelledby="panier-articles" className="min-w-0 flex-1">
            <h2 id="panier-articles" className="sr-only">
              Articles du panier
            </h2>

            <VehicleBar vehicle={vehicle} className="mb-[18px]" />

            {cart.conflicts.length > 0 ? (
              <Alert
                tone="warn"
                title="Des articles ne sont pas confirmés pour le véhicule sélectionné."
                className="mb-[18px] text-[11px]"
              >
                <ul className="flex flex-col gap-2">
                  {cart.conflicts.map((conflict) => (
                    <li key={conflict.variantId} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-ink">{conflict.productName}</span>
                        <span className="text-muted">{conflict.variantName}</span>
                        <FitmentBadge status={conflict.status} short />
                      </span>
                      <span>{conflict.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  Rien n&apos;a été retiré de votre panier : la décision vous revient. Vous pouvez
                  conserver ces articles, les retirer ci-dessous, ou revenir sur le véhicule
                  sélectionné.
                </p>
              </Alert>
            ) : null}

            {cart.stockIssues.length > 0 ? (
              <Alert
                tone="danger"
                live="assertive"
                title="La quantité demandée dépasse le stock disponible."
                className="mb-[18px] text-[11px]"
              >
                <ul className="flex flex-col gap-1">
                  {cart.stockIssues.map((issue) => {
                    const line = cart.lines.find((entry) => entry.id === issue.lineId)
                    return (
                      <li key={issue.lineId}>
                        <span className="font-semibold text-slate-ink">{issue.productName}</span>
                        {' : '}
                        {line ? `${line.quantity} demandé${line.quantity > 1 ? 's' : ''}, ` : null}
                        {issue.sellable > 0
                          ? `${issue.sellable} réellement disponible${issue.sellable > 1 ? 's' : ''}.`
                          : 'plus aucun exemplaire disponible.'}
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2">Ajustez les quantités ci-dessous avant de poursuivre.</p>
              </Alert>
            ) : null}

            {/* .cart-line : vignette, intitulé, prix, commandes de quantité. */}
            <ul>
              {cart.lines.map((line) => {
                const purchasable = isPurchasable(line.availability)
                const atLimit =
                  line.availability.sellable !== null &&
                  line.quantity >= line.availability.sellable
                const premierRetrait = line.quantity <= 1

                return (
                  <li
                    key={line.id}
                    className="mb-[18px] flex items-start gap-3 border-b border-line pb-[18px] fiche:gap-[13px]"
                  >
                    {/*
                      75 × 76 px et rayon 6, comme la référence. Le recadrage,
                      lui, n'est pas repris : `object-cover` tronquerait une
                      pièce détourée, et le panier est l'écran où l'on vérifie
                      ce qu'on a mis.
                    */}
                    <div className="relative size-[75px] shrink-0 overflow-hidden rounded-md bg-surface-paper">
                      {line.image ? (
                        <Image
                          src={line.image.url}
                          alt={line.image.alt}
                          fill
                          sizes="75px"
                          className="object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[8px] leading-tight text-muted">
                          Visuel non disponible
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <h3 className="mb-[5px] text-[12px] leading-[1.4] font-semibold">
                            <Link
                              href={`/p/${line.productSlug}`}
                              className="underline-offset-[3px] hover:underline"
                            >
                              {line.productName}
                            </Link>
                          </h3>
                          <p className="my-0.5 text-[9px] text-[#818775]">
                            {line.variantName} · réf. {line.sku}
                          </p>
                          {line.requiredBy ? (
                            <p className="my-0.5 text-[9px] text-[#818775]">
                              Ajouté comme accessoire nécessaire
                            </p>
                          ) : null}
                        </div>

                        <div className="shrink-0 sm:text-right">
                          <strong className="block text-[12px]">
                            {formatPrice(line.lineTotalCents)}
                          </strong>
                          <span className="block text-[9px] text-[#818775]">
                            {formatPrice(line.unitPriceCents)} l&apos;unité
                          </span>
                        </div>
                      </div>

                      {line.components.length > 0 ? (
                        <details className="mt-2 text-[9px]">
                          <summary className="cursor-pointer text-[10px] font-semibold">
                            Contenu du kit
                          </summary>
                          <ul className="mt-1.5 flex flex-col gap-1 text-[#818775]">
                            {line.components.map((component) => (
                              <li key={component.sku}>
                                {component.quantity} × {component.productName}
                                <span> — {component.variantName}</span>
                                <span>
                                  {component.required ? ' · inclus' : ' · inclus, facultatif'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <p
                        className={cn(
                          'mt-2 text-[10px]',
                          purchasable ? 'text-[#818775]' : 'font-semibold text-danger',
                        )}
                      >
                        {availabilityLabel(line.availability)}
                      </p>

                      <form
                        action={modifierLigne}
                        className="mt-2.5 flex flex-wrap items-center gap-3"
                      >
                        <input type="hidden" name="lineId" value={line.id} />

                        <div className="flex items-center gap-3">
                          <button
                            type="submit"
                            name="quantity"
                            value={line.quantity - 1}
                            className={stepButton}
                            aria-label={
                              premierRetrait
                                ? `Retirer ${line.productName} du panier`
                                : `Diminuer la quantité de ${line.productName}`
                            }
                          >
                            −
                          </button>

                          <span className="min-w-6 text-center text-[10px] font-semibold">
                            <span className="sr-only">Quantité : </span>
                            {line.quantity}
                          </span>

                          <button
                            type="submit"
                            name="quantity"
                            value={line.quantity + 1}
                            disabled={atLimit || !purchasable}
                            className={stepButton}
                            aria-label={`Augmenter la quantité de ${line.productName}`}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="submit"
                          name="quantity"
                          value={0}
                          className="inline-flex min-h-11 items-center text-[9px] text-[#969c8c] underline underline-offset-2 hover:text-brand sm:min-h-0"
                          aria-label={`Retirer ${line.productName} du panier`}
                        >
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/*
              .cart-suggestion — la référence y met en dur « vous avez choisi
              les ampoules seules, les accessoires ne sont pas inclus ». Ici
              c'est calculé : pour chaque ligne, les accessoires que le montage
              exige et qu'aucune autre ligne ni aucun kit du panier n'apporte.
              Rien n'est ajouté : le client sait peut-être déjà qu'il les a.
            */}
            {cart.missingAccessories.length > 0 ? (
              <div className="mt-[22px] rounded-[7px] bg-[#f7f7f3] p-[15px]">
                <h3 className="mb-[7px] text-[12px] font-bold">
                  Votre montage demande des pièces que le panier ne contient pas.
                </h3>
                <ul className="flex flex-col gap-1.5 text-[10px] leading-[1.7] text-[#7f8775]">
                  {cart.missingAccessories.map((accessoire) => (
                    <li key={accessoire.variantId}>
                      <Link
                        href={`/p/${accessoire.productSlug}`}
                        className="font-semibold text-slate-ink underline underline-offset-2"
                      >
                        {accessoire.quantity} × {accessoire.productName}
                      </Link>
                      <span> — {accessoire.variantName}</span>
                      <span> · {formatPrice(accessoire.priceCents * accessoire.quantity)}</span>
                      <span className="block">
                        Exigé par {accessoire.requiredForName}
                        {accessoire.note ? ` — ${accessoire.note}` : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-[1.7] text-[#7f8775]">
                  Rien n&apos;est ajouté automatiquement : si vous les possédez déjà, poursuivez.
                </p>
              </div>
            ) : null}

            <p className="mt-6">
              <Link
                href="/c"
                className="text-[11px] font-semibold underline underline-offset-[3px] hover:text-brand"
              >
                Continuer mes achats
              </Link>
            </p>
          </section>

          {/* ---------------------------------------------------------------
              Récapitulatif
              --------------------------------------------------------------- */}
          <section
            aria-labelledby="panier-recapitulatif"
            className="fiche:sticky fiche:top-6 fiche:w-[370px] fiche:shrink-0"
          >
            <div className="rounded-[9px] border border-[#e2e3dc] p-5">
              <h2 id="panier-recapitulatif" className="text-[14px] font-bold">
                Récapitulatif
              </h2>

              <dl className="mt-3">
                <div className={cn(totalRow, 'my-3')}>
                  <dt>Sous-total TTC</dt>
                  <dd className="font-semibold">{formatPrice(cart.subtotalCents)}</dd>
                </div>

                <div className={cn(totalRow, 'my-3 text-[10px] text-muted')}>
                  <dt>dont TVA</dt>
                  <dd>{formatPrice(cart.vatCents)}</dd>
                </div>

                <div className="my-3">
                  <div className={totalRow}>
                    <dt>Livraison</dt>
                    <dd
                      className={cn(
                        'text-right font-semibold',
                        teaser?.priceLabel === 'Livraison offerte' && 'text-[11px] text-ok',
                      )}
                    >
                      {teaser ? teaser.priceLabel : 'calculée à l’étape suivante'}
                    </dd>
                  </div>
                  {teaser && !teaser.isSettled ? (
                    <p className="mt-1 text-right text-[9px] text-muted">
                      estimation, selon le mode choisi
                    </p>
                  ) : null}
                  {teaser?.delayLabel ? (
                    <p className="mt-1 text-right text-[9px] text-muted">{teaser.delayLabel}</p>
                  ) : null}
                  {teaser?.missingForFreeCents ? (
                    <p className="mt-1 text-right text-[9px] text-muted-strong">
                      Plus que {formatPrice(teaser.missingForFreeCents)} pour la livraison offerte.
                    </p>
                  ) : null}
                </div>

                {/*
                  Le total est nommé pour ce qu'il contient.

                  Il annonçait « Total » et, juste dessous, « les frais de
                  livraison ne sont pas compris dans ce total » — alors même que
                  la ligne au-dessus pouvait dire « Livraison offerte ». Les
                  deux ne peuvent pas être vrais ensemble.

                  Quand la franchise de port est atteinte, la livraison est
                  offerte et le total est complet : il s'appelle « Total ».
                  Sinon, il ne couvre que les articles, il le dit, et la note
                  explique ce qui reste à déterminer.
                */}
                <div className="mt-[18px] flex items-baseline justify-between gap-4 border-t border-line pt-[17px] text-[18px] font-bold">
                  <dt>{teaser?.isSettled ? 'Total' : 'Total des articles'}</dt>
                  <dd>{formatPrice(cart.subtotalCents)}</dd>
                </div>
              </dl>

              <p className="mt-2 text-[9px] leading-[1.8] text-[#8d9483]">
                {teaser?.isSettled
                  ? 'Livraison comprise pour la France. Ce total est celui que vous réglerez.'
                  : teaser
                    ? 'Les frais de livraison s’ajoutent à l’étape suivante : le montant exact dépend du mode de livraison choisi et de votre adresse.'
                    : 'Les frais de livraison seront calculés à l’étape suivante, une fois votre adresse connue.'}
              </p>

              <ButtonLink
                href="/commande"
                block
                className="mt-3 min-h-[51px] gap-3 rounded-[7px] text-[13px]"
              >
                Continuer ma commande
              </ButtonLink>

              {/* .cart-fineprint : centré, 9 px, interligne 1.8. */}
              <p className="mt-3 text-center text-[9px] leading-[1.8] text-[#8d9483]">
                {paymentIsSimulated()
                  ? 'Le tunnel de commande est en service, mais aucun prestataire de paiement n’est configuré sur cet environnement : la dernière étape simule l’issue du paiement et n’encaisse rien.'
                  : 'Paiement sécurisé à l’étape suivante. Rien n’est débité avant votre validation.'}
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
