import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { StripeDriver } from '../src/lib/payments/stripe'

/**
 * Vérification de signature du webhook.
 *
 * Ce que ces tests protègent : sans vérification, n'importe qui pouvant
 * atteindre l'URL publique du webhook pourrait marquer une commande payée et
 * se faire expédier la marchandise. C'est la faille la plus banale d'une
 * boutique en ligne, et elle ne se voit pas depuis l'interface.
 *
 * Aucun appel réseau : `constructEventAsync` ne fait que du calcul local.
 */

const SECRET = 'whsec_test_000000000000000000000000'
const KEY = 'sk_test_000000000000000000000000'

/**
 * Stripe refuse aussi les horodatages trop anciens (rejeu). Par défaut on signe
 * donc à l'instant présent, pour que les tests portent sur la SIGNATURE et non
 * sur l'ancienneté — c'est la différence entre un test qui vérifie ce qu'il
 * annonce et un test qui passe par accident.
 */
function signedHeader(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

/**
 * Le pilote reçoit désormais les en-têtes en bloc et y cherche lui-même ce dont
 * il a besoin : Stripe sa signature, Mollie rien du tout.
 */
function headersWith(signature: string | null): Headers {
  return new Headers(signature === null ? {} : { 'stripe-signature': signature })
}

const sessionPayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        payment_status: 'paid',
        amount_total: 9990,
        ...overrides,
      },
    },
  })

describe('StripeDriver.parseWebhook', () => {
  it('refuse un appel sans signature', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    await expect(driver.parseWebhook(sessionPayload(), headersWith(null))).rejects.toThrow()
  })

  it('refuse une signature fabriquée avec un autre secret', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const payload = sessionPayload()
    const forged = signedHeader(payload, 'whsec_un_autre_secret')
    await expect(driver.parseWebhook(payload, headersWith(forged))).rejects.toThrow()
  })

  it('refuse un corps modifié après signature', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const original = sessionPayload()
    const header = signedHeader(original)
    // Un attaquant qui gonflerait le montant après coup.
    const tampered = original.replace('"amount_total":9990', '"amount_total":1')
    await expect(driver.parseWebhook(tampered, headersWith(header))).rejects.toThrow()
  })

  it('refuse quand aucun secret de webhook n’est configuré', async () => {
    const driver = new StripeDriver(KEY, null)
    const payload = sessionPayload()
    await expect(driver.parseWebhook(payload, headersWith(signedHeader(payload)))).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    )
  })

  it('refuse un horodatage trop ancien (rejeu)', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const payload = sessionPayload()
    // Signature parfaitement valide, mais vieille d'une heure.
    const stale = signedHeader(payload, SECRET, Math.floor(Date.now() / 1000) - 3600)
    await expect(driver.parseWebhook(payload, headersWith(stale))).rejects.toThrow(/timestamp/i)
  })

  it('accepte une signature valide et normalise l’événement', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const payload = sessionPayload()

    const event = await driver.parseWebhook(payload, headersWith(signedHeader(payload)))

    expect(event).not.toBeNull()
    expect(event!.providerRef).toBe('cs_test_123')
    expect(event!.outcome).toBe('paid')
    expect(event!.amountCents).toBe(9990)
  })

  it("ne retient pas une session complétée mais non encaissée", async () => {
    const driver = new StripeDriver(KEY, SECRET)
    // payment_status 'unpaid' : virement ou prélèvement encore en attente.
    // C'est le cas qui ferait expédier une commande avant d'avoir l'argent.
    const payload = sessionPayload({ payment_status: 'unpaid' })

    const event = await driver.parseWebhook(payload, headersWith(signedHeader(payload)))

    expect(event).toBeNull()
  })

  it('normalise une expiration de session', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const payload = JSON.stringify({
      id: 'evt_2',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_456' } },
    })

    const event = await driver.parseWebhook(payload, headersWith(signedHeader(payload)))

    expect(event?.outcome).toBe('expired')
    expect(event?.providerRef).toBe('cs_test_456')
  })

  it('ignore un type d’événement qui ne nous concerne pas', async () => {
    const driver = new StripeDriver(KEY, SECRET)
    const payload = JSON.stringify({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1' } },
    })

    expect(await driver.parseWebhook(payload, headersWith(signedHeader(payload)))).toBeNull()
  })

  it('déduit le mode test de la clé, pas d’une variable séparée', () => {
    expect(new StripeDriver('sk_test_abc', SECRET).isTestMode).toBe(true)
    expect(new StripeDriver('sk_live_abc', SECRET).isTestMode).toBe(false)
  })
})
