import { NextResponse } from 'next/server'
import { resolvePaymentDriver } from '@/lib/payments'
import { WebhookRefusedError } from '@/lib/payments/errors'
import { throttle } from '@/lib/auth/throttle'
import { applyPaymentOutcome } from '@/lib/orders'

/*
  Réponse unique à tous les appels compris.

  Le corps ne dit RIEN de ce qui s'est passé, et c'est délibéré. Il a d'abord
  renvoyé `handled` et le motif, ce qui en faisait un oracle : quiconque
  possède un identifiant de paiement — une capture du tableau de bord du
  prestataire, une ligne de journal, une pièce jointe de SAV — pouvait POSTer
  cet identifiant et apprendre, sans compte ni jeton, si le paiement est l'un
  des nôtres, s'il a déjà été appliqué, ou si nous avons relevé un écart de
  montant. Le code de réponse était bien uniformisé ; le corps rétablissait la
  distinction que ce fichier dit éviter.

  Ce qui s'est passé reste dans les journaux, côté serveur.
*/
const RECEIVED = { received: true } as const

export const dynamic = 'force-dynamic'
// Le corps doit rester tel quel : la signature porte sur les octets envoyés.
// Toute normalisation (parsing JSON puis re-sérialisation) la casserait.
export const runtime = 'nodejs'

/**
 * Webhook de paiement.
 *
 * Quatre règles, et la première change de forme selon le prestataire.
 *
 * 1. **Le corps du webhook n'est jamais cru sur parole.** Comment on s'en
 *    assure dépend du prestataire, et les deux voies sont également sûres :
 *
 *    - **Stripe** signe le corps. On vérifie la signature contre le secret
 *      partagé, et un appel non signé est refusé.
 *    - **Mollie** ne signe rien : il POSTe `id=tr_xxx` et rien d'autre. La
 *      garantie vient d'ailleurs — on va relire le paiement par l'API, avec
 *      notre clé secrète. Un faux appel ne peut donc rien affirmer : au mieux
 *      il nous fait relire la vérité. La documentation de Mollie le dit
 *      elle-même : « fake calls to your webhook will never result in orders
 *      being processed without being actually paid. »
 *
 * 2. **Le traitement est idempotent.** Les prestataires rejouent leurs appels
 *    — c'est normal, pas un incident. Mollie rappelle jusqu'à dix fois tant
 *    qu'il n'a pas reçu un 200, et une fois par changement d'état.
 *    `applyPaymentOutcome` ignore un paiement déjà traité.
 *
 * 3. **On répond 200 dès que l'appel est compris**, même s'il ne nous concerne
 *    pas — y compris pour un identifiant inconnu. C'est ce que demande Mollie,
 *    et pour une bonne raison : un 404 sur un identifiant inconnu dirait à un
 *    tiers lesquels existent chez nous.
 *
 * 4. **Un refus vaut 400, une panne vaut 500.** Mollie relance sur tout ce qui
 *    n'est pas 200, dix fois, puis abandonne définitivement au bout de 26 h
 *    sans possibilité de redéclencher. Répondre 400 à une panne passagère
 *    gâcherait une de ces tentatives.
 *
 * Mollie coupe l'appel au bout de 15 secondes et compte le dépassement comme
 * un échec : tout ce qui est fait ici doit rester bref. C'est pourquoi le
 * pilote Mollie borne ses propres appels à 10 secondes.
 */
export async function POST(request: Request) {
  /*
    Limitation par adresse.

    Le webhook de Mollie n'est pas signé et son URL est devinable : sans
    plafond, un tiers peut nous faire appeler l'API du prestataire en boucle.
    Il n'y gagne rien, mais nous y perdons du quota et des instances.

    On répond 429 — ce qui, pour un prestataire, vaut relance : un vrai webhook
    pris dans le plafond sera rappelé, il n'est pas perdu.
  */
  const limite = await throttle('paymentWebhook')
  if (!limite.allowed) {
    console.warn('[webhook] plafond d’appels atteint')
    return NextResponse.json(
      { error: 'Trop d’appels.' },
      { status: 429, headers: { 'retry-after': String(limite.retryAfterSeconds) } },
    )
  }

  // Lu en premier et une seule fois : le flux n'est pas rejouable.
  const rawBody = await request.text()

  let event
  try {
    const driver = resolvePaymentDriver()
    // Les en-têtes passent en bloc : c'est au pilote de savoir ce qu'il doit y
    // chercher. Stripe y lit sa signature, Mollie n'y lit rien.
    event = await driver.parseWebhook(rawBody, request.headers)
  } catch (error) {
    if (error instanceof WebhookRefusedError) {
      // Appel non authentique : signature absente, fausse, ou horodatage hors
      // fenêtre. 400, et aucune relance souhaitée : il n'y a rien à rejouer.
      console.error('[webhook] appel refusé', error.message)
      return NextResponse.json({ error: 'Appel refusé.' }, { status: 400 })
    }

    // Autre chose : prestataire injoignable, délai dépassé, panne de notre
    // côté. 500 pour que l'appel soit RELANCÉ — chez Mollie c'est la seule
    // façon d'obtenir une seconde chance, et il abandonne au bout de 26 h.
    console.error('[webhook] lecture impossible, relance attendue', error)
    return NextResponse.json({ error: 'Traitement impossible.' }, { status: 500 })
  }

  if (!event) {
    // Appel légitime mais sans effet pour nous : identifiant inconnu, statut
    // non définitif, type non géré. On accuse réception pour éviter les
    // relances, avec le MÊME corps que dans tous les autres cas compris.
    return NextResponse.json(RECEIVED)
  }

  try {
    const result = await applyPaymentOutcome(
      event.providerRef,
      event.outcome,
      event.amountCents,
      event.raw,
      { currency: event.currency, amountKnown: event.amountKnown },
    )

    if (!result.applied) {
      console.info(
        `[webhook] ${event.outcome} ${event.providerRef} non appliqué : ${result.reason}`,
      )
    }

    return NextResponse.json(RECEIVED)
  } catch (error) {
    // Erreur de notre côté : on renvoie 500 pour que le prestataire relance.
    console.error('[webhook] application de l’issue impossible', error)
    return NextResponse.json({ error: 'Traitement impossible.' }, { status: 500 })
  }
}
