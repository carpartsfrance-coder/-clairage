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
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
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
 * 44 px au doigt, 36 px à partir du breakpoint `sm` : la maquette demande des
 * boutons compacts, mais une cible tactile de 36 px ne se touche pas.
 */
const stepButton =
  'inline-flex size-11 items-center justify-center rounded-sm border border-line-strong ' +
  'text-lg font-semibold leading-none text-slate-ink transition-colors ' +
  'hover:border-slate-ink hover:bg-surface-soft disabled:opacity-45 ' +
  'disabled:pointer-events-none sm:size-9'

export default async function PanierPage() {
  const vehicle = await getSelectedVehicle()
  const cart = await getCart(vehicle?.configurationId ?? null)
  const teaser = cart.lines.length > 0 ? await getDeliveryTeaser(cart.subtotalCents) : null

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Panier' }]} />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Votre panier
      </h1>

      {cart.lines.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<IconCart className="size-8" />}
          title="Votre panier est vide."
          description="Partez de votre véhicule pour voir ce qui lui correspond."
          action={{ label: 'Choisir mon véhicule', href: '/vehicule' }}
        />
      ) : (
        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* ---------------------------------------------------------------
              Articles
              --------------------------------------------------------------- */}
          <section aria-labelledby="panier-articles" className="min-w-0 flex-1">
            <h2 id="panier-articles" className="text-lg font-bold">
              Articles{' '}
              <span className="font-normal text-muted">
                ({cart.itemCount}
                {cart.itemCount > 1 ? ' articles' : ' article'})
              </span>
            </h2>

            <VehicleBar vehicle={vehicle} className="mt-4" />

            {cart.conflicts.length > 0 ? (
              <Alert
                tone="warn"
                title="Des articles ne sont pas confirmés pour le véhicule sélectionné."
                className="mt-4"
              >
                <ul className="flex flex-col gap-2">
                  {cart.conflicts.map((conflict) => (
                    <li key={conflict.variantId} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-ink">
                          {conflict.productName}
                        </span>
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
                className="mt-4"
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
                <p className="mt-2">
                  Ajustez les quantités ci-dessous avant de poursuivre.
                </p>
              </Alert>
            ) : null}

            <ul className="mt-4 flex flex-col gap-4">
              {cart.lines.map((line) => {
                const purchasable = isPurchasable(line.availability)
                const atLimit =
                  line.availability.sellable !== null &&
                  line.quantity >= line.availability.sellable
                const premierRetrait = line.quantity <= 1

                return (
                  <Card as="li" key={line.id} className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      {/* Vignette : 96 px, objet entier visible, jamais rognée. */}
                      <div className="relative size-24 shrink-0 overflow-hidden rounded-sm border border-line bg-white">
                        {line.image ? (
                          <Image
                            src={line.image.url}
                            alt={line.image.alt}
                            fill
                            sizes="96px"
                            className="object-contain p-1.5"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-surface-muted px-1 text-center text-[0.65rem] leading-tight text-muted">
                            Visuel non disponible
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="font-semibold">
                              <Link
                                href={`/p/${line.productSlug}`}
                                className="underline-offset-4 hover:underline"
                              >
                                {line.productName}
                              </Link>
                            </h3>
                            <p className="mt-0.5 text-sm text-muted">
                              {line.variantName} · réf. {line.sku}
                            </p>
                            {line.requiredBy ? (
                              <p className="mt-1 text-xs text-muted">
                                Ajouté comme accessoire nécessaire
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 sm:text-right">
                            <p className="font-bold">{formatPrice(line.lineTotalCents)}</p>
                            <p className="text-xs text-muted">
                              {formatPrice(line.unitPriceCents)} l&apos;unité
                            </p>
                          </div>
                        </div>

                        {line.components.length > 0 ? (
                          <details className="mt-3 rounded-sm border border-line bg-surface-soft px-3 py-2">
                            <summary className="cursor-pointer text-sm font-semibold">
                              Contenu du kit
                            </summary>
                            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-strong">
                              {line.components.map((component) => (
                                <li key={component.sku}>
                                  {component.quantity} × {component.productName}
                                  <span className="text-muted"> — {component.variantName}</span>
                                  <span className="text-xs text-muted">
                                    {component.required ? ' · inclus' : ' · inclus, facultatif'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        <p
                          className={cn(
                            'mt-3 text-sm',
                            purchasable ? 'text-muted-strong' : 'font-semibold text-danger',
                          )}
                        >
                          {availabilityLabel(line.availability)}
                        </p>

                        <form action={modifierLigne} className="mt-3 flex flex-wrap items-center gap-3">
                          <input type="hidden" name="lineId" value={line.id} />

                          <div className="flex items-center gap-2">
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

                            <span className="min-w-8 text-center text-base font-semibold">
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
                            className="text-sm text-muted-strong underline underline-offset-4 hover:text-brand"
                            aria-label={`Retirer ${line.productName} du panier`}
                          >
                            Retirer
                          </button>
                        </form>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </ul>

            <p className="mt-6">
              <Link
                href="/c"
                className="text-sm font-semibold underline underline-offset-4 hover:text-brand"
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
            className="lg:sticky lg:top-6 lg:w-96 lg:shrink-0"
          >
            <Card className="p-5">
              <h2 id="panier-recapitulatif" className="text-lg font-bold">
                Récapitulatif
              </h2>

              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt>Sous-total TTC</dt>
                  <dd className="font-semibold">{formatPrice(cart.subtotalCents)}</dd>
                </div>

                <div className="flex items-baseline justify-between gap-4 text-sm text-muted">
                  <dt>dont TVA</dt>
                  <dd>{formatPrice(cart.vatCents)}</dd>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt>Livraison</dt>
                    <dd className="text-right font-semibold">
                      {teaser ? teaser.priceLabel : 'calculée à l’étape suivante'}
                    </dd>
                  </div>
                  {teaser?.delayLabel ? (
                    <p className="mt-1 text-right text-xs text-muted">{teaser.delayLabel}</p>
                  ) : null}
                  {teaser?.missingForFreeCents ? (
                    <p className="mt-1 text-right text-xs text-muted-strong">
                      Plus que {formatPrice(teaser.missingForFreeCents)} pour la livraison offerte.
                    </p>
                  ) : null}
                </div>

                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-4">
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-xl font-bold">{formatPrice(cart.subtotalCents)}</dd>
                </div>
              </dl>

              <p className="mt-2 text-xs text-muted">
                Les frais de livraison définitifs dépendent de l&apos;adresse de livraison et ne
                sont pas compris dans ce total.
              </p>

              <ButtonLink href="/commande" size="lg" block className="mt-5">
                Passer la commande
              </ButtonLink>

              <p className="mt-2 text-xs text-muted">
                {paymentIsSimulated()
                  ? 'Le tunnel de commande est en service, mais aucun prestataire de paiement n’est configuré sur cet environnement : la dernière étape simule l’issue du paiement et n’encaisse rien.'
                  : 'Paiement sécurisé à l’étape suivante. Rien n’est débité avant votre validation.'}
              </p>
            </Card>
          </section>
        </div>
      )}
    </div>
  )
}
