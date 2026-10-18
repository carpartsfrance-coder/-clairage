import type { Metadata } from 'next'
import { getCart } from '@/lib/cart'
import { getSelectedVehicle } from '@/lib/session'
import { getShippingOffers } from '@/lib/shipping'
import { effectivePrice } from '@/lib/delivery-teaser'
import { paymentIsSimulated } from '@/lib/payments'
import { EmptyState } from '@/components/ui/Surface'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { CheckoutForm, type CheckoutShippingOption } from '@/components/checkout/CheckoutForm'

export const metadata: Metadata = {
  title: 'Commande',
  robots: { index: false, follow: false },
}

/**
 * Tunnel de commande — saisie.
 *
 * La page ne fait que lire : panier, modes de livraison applicables, et le prix
 * réellement appliqué à chacun pour ce sous-total (franchise de port comprise).
 * L'enregistrement de la commande appartient à l'action `submitOrder`, appelée
 * par le formulaire — une page ne doit jamais écrire.
 */
export default async function CommandePage() {
  const vehicle = await getSelectedVehicle()
  const cart = await getCart(vehicle?.configurationId ?? null)

  if (cart.lines.length === 0) {
    return (
      <div className="container-page py-8 lg:py-12">
        <Breadcrumb
          items={[{ label: 'Accueil', href: '/' }, { label: 'Panier', href: '/panier' }, { label: 'Commande' }]}
        />
        <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
          Votre commande
        </h1>
        <EmptyState
          className="mt-8"
          title="Votre panier est vide."
          description="Ajoutez un article avant de passer commande."
          action={{ label: 'Voir le catalogue', href: '/c' }}
        />
      </div>
    )
  }

  // Seule zone configurée pour l'instant ; le formulaire n'offre donc que la
  // France, et les tarifs affichés sont ceux de cette zone.
  const offers = await getShippingOffers('FR')
  const shippingOptions: CheckoutShippingOption[] = offers.map((offer) => ({
    code: offer.code,
    label: offer.label,
    carrier: offer.carrier,
    effectivePriceCents: effectivePrice(offer, cart.subtotalCents),
    minDays: offer.minDays,
    maxDays: offer.maxDays,
  }))

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[{ label: 'Accueil', href: '/' }, { label: 'Panier', href: '/panier' }, { label: 'Commande' }]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Votre commande
      </h1>

      <div className="mt-8">
        <CheckoutForm
          lines={cart.lines.map((line) => ({
            id: line.id,
            productName: line.productName,
            variantName: line.variantName,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
          }))}
          subtotalCents={cart.subtotalCents}
          vatCents={cart.vatCents}
          shippingOptions={shippingOptions}
          paymentSimulated={paymentIsSimulated()}
        />
      </div>
    </div>
  )
}
