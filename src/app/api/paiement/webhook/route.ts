import { NextResponse } from 'next/server'
import { resolvePaymentDriver } from '@/lib/payments'
import { applyPaymentOutcome } from '@/lib/orders'

export const dynamic = 'force-dynamic'
// Le corps doit rester tel quel : la signature porte sur les octets envoyés.
// Toute normalisation (parsing JSON puis re-sérialisation) la casserait.
export const runtime = 'nodejs'

/**
 * Webhook de paiement.
 *
 * Trois règles non négociables :
 *
 * 1. **Rien n'est cru sans signature.** Le corps brut est vérifié contre le
 *    secret partagé. Sans secret configuré, on refuse : un webhook non vérifié
 *    permettrait à n'importe qui de marquer une commande payée.
 * 2. **Le traitement est idempotent.** Les prestataires rejouent leurs
 *    événements — c'est normal, pas un incident. `applyPaymentOutcome` ignore
 *    un paiement déjà traité.
 * 3. **On répond 200 dès que l'événement est compris**, même s'il ne nous
 *    concerne pas. Un code d'erreur déclencherait des relances inutiles chez
 *    le prestataire. Seule une signature invalide vaut 400.
 */
export async function POST(request: Request) {
  const signature =
    request.headers.get('stripe-signature') ?? request.headers.get('Stripe-Signature')

  // Lu en premier et une seule fois : le flux n'est pas rejouable.
  const rawBody = await request.text()

  let event
  try {
    const driver = resolvePaymentDriver()
    event = await driver.parseWebhook(rawBody, signature)
  } catch (error) {
    // Signature absente, invalide, ou horodatage hors fenêtre.
    console.error('[webhook] vérification refusée', error)
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 })
  }

  if (!event) {
    // Événement légitime mais sans effet pour nous (abonnement, litige, type
    // non géré). On accuse réception pour éviter les relances.
    return NextResponse.json({ received: true, handled: false })
  }

  try {
    const result = await applyPaymentOutcome(
      event.providerRef,
      event.outcome,
      event.amountCents,
      event.raw,
    )

    if (!result.applied) {
      console.info(
        `[webhook] ${event.outcome} ${event.providerRef} non appliqué : ${result.reason}`,
      )
    }

    return NextResponse.json({
      received: true,
      handled: result.applied,
      reason: result.reason ?? null,
    })
  } catch (error) {
    // Erreur de notre côté : on renvoie 500 pour que le prestataire relance.
    console.error('[webhook] application de l’issue impossible', error)
    return NextResponse.json({ error: 'Traitement impossible.' }, { status: 500 })
  }
}
