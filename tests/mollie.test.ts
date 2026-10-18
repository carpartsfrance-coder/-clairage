import { describe, expect, it, vi } from 'vitest'
import {
  MollieDriver,
  fromMollieAmount,
  outcomeFromStatus,
  publicWebhookUrl,
  toMollieAmount,
} from '../src/lib/payments/mollie'
import { resolveProviderChoice } from '../src/lib/payments/config'

/**
 * Pilote Mollie.
 *
 * Aucun appel réseau : `fetch` est injecté. Ce que ces tests protègent, par
 * ordre de gravité si on se trompe :
 *
 *  1. **Un statut non définitif pris pour un échec.** Chez Mollie, une
 *     tentative abandonnée ramène le paiement à `open`. Le lire comme un refus
 *     annulerait la commande d'un client en train de payer, et rendrait son
 *     stock à la vente.
 *  2. **`authorized` pris pour `paid`.** Les fonds sont réservés, pas
 *     encaissés. Expédier là-dessus sans capture, c'est livrer gratuitement.
 *  3. **Un montant mal converti.** Mollie parle en chaînes décimales, la
 *     boutique en centimes. Un aller-retour fautif fait passer un contrôle de
 *     cohérence qui devait précisément bloquer.
 *  4. **Un webhook cru sur parole.** Il n'est pas signé : seul l'appel à l'API
 *     fait foi.
 */

const TEST_KEY = 'test_000000000000000000000000000000'

/** Réponse Mollie minimale, telle que la documentation la décrit. */
function molliePayment(overrides: Record<string, unknown> = {}) {
  return {
    resource: 'payment',
    id: 'tr_WDqYK6vllg',
    status: 'open',
    amount: { currency: 'EUR', value: '20.80' },
    _links: { checkout: { href: 'https://www.mollie.com/checkout/select-method/WDqYK6vllg' } },
    ...overrides,
  }
}

/** `fetch` de laboratoire : enregistre les appels, rend ce qu'on lui dit. */
function fakeFetch(
  responder: (url: string, init?: RequestInit) => { status?: number; body?: unknown },
) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const { status = 200, body = null } = responder(url, init)
    return new Response(body === null ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

const baseInput = {
  orderId: 'cmd123',
  orderReference: 'CMD-2026-00005',
  email: 'client@example.com',
  amountCents: 2080,
  currency: 'EUR',
  lines: [{ label: 'Pack LED de plaque — La paire', unitPriceCents: 1490, quantity: 1 }],
  shippingCents: 590,
  accessToken: 'jeton-secret',
  successUrl: 'https://boutique.example/commande/cmd123/confirmation?t=jeton-secret',
  cancelUrl: 'https://boutique.example/commande/cmd123/paiement?abandon=1&t=jeton-secret',
  idempotencyKey: 'order_cmd123',
}

/* -------------------------------------------------------------------------- */
/* Montants                                                                   */
/* -------------------------------------------------------------------------- */

describe('conversion des montants', () => {
  it('écrit toujours deux décimales, séparées par un point', () => {
    expect(toMollieAmount(2080)).toBe('20.80')
    expect(toMollieAmount(800)).toBe('8.00')
    expect(toMollieAmount(5)).toBe('0.05')
    expect(toMollieAmount(0)).toBe('0.00')
    expect(toMollieAmount(100000)).toBe('1000.00')
  })

  it('ne perd pas un centime sur les montants où le flottant dérape', () => {
    // 1 cent de moins qu'un compte rond : le cas classique où 0.1 + 0.2 trahit.
    expect(toMollieAmount(1999999)).toBe('19999.99')
    expect(toMollieAmount(70)).toBe('0.70')
    expect(toMollieAmount(29)).toBe('0.29')
  })

  it('refuse un montant qui n’est pas un entier de centimes', () => {
    expect(() => toMollieAmount(20.8)).toThrow(/non entier/)
  })

  it('relit les montants de Mollie en centimes', () => {
    expect(fromMollieAmount('20.80')).toBe(2080)
    expect(fromMollieAmount('8.00')).toBe(800)
    expect(fromMollieAmount('0.05')).toBe(5)
    expect(fromMollieAmount('1000.00')).toBe(100000)
    // Mollie écrit avec un point ; on tolère la virgule sans la produire.
    expect(fromMollieAmount('20,80')).toBe(2080)
    expect(fromMollieAmount(' 20.80 ')).toBe(2080)
  })

  it('fait un aller-retour fidèle sur toute une plage de montants', () => {
    for (let cents = 0; cents < 2000; cents += 7) {
      expect(fromMollieAmount(toMollieAmount(cents))).toBe(cents)
    }
  })

  it('renvoie null sur ce qu’il ne sait pas lire, plutôt qu’une approximation', () => {
    // Un montant mal lu serait comparé au montant attendu, et cette
    // comparaison décide de valider la commande : mieux vaut « je ne sais pas ».
    for (const valeur of ['', 'gratuit', '20.805', '1e3', '--20.80', null, undefined]) {
      expect(fromMollieAmount(valeur as string)).toBeNull()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Statuts                                                                    */
/* -------------------------------------------------------------------------- */

describe('statuts Mollie', () => {
  it('applique une issue sur les quatre statuts définitifs', () => {
    expect(outcomeFromStatus('paid')).toBe('paid')
    expect(outcomeFromStatus('failed')).toBe('failed')
    expect(outcomeFromStatus('expired')).toBe('expired')
    expect(outcomeFromStatus('canceled')).toBe('canceled')
  })

  it('N’applique RIEN sur les statuts non définitifs', () => {
    // `open` est l'état où revient un paiement après une tentative abandonnée
    // sur l'écran multi-moyens : le client est invité à réessayer. Le prendre
    // pour un refus annulerait sa commande.
    expect(outcomeFromStatus('open')).toBeNull()
    // `pending` peut durer deux à trois jours ouvrés (virement instantané ou non).
    expect(outcomeFromStatus('pending')).toBeNull()
  })

  it('ne tient JAMAIS « authorized » pour un paiement encaissé', () => {
    // Les fonds sont réservés. Sans capture, l'autorisation expire — sept jours
    // sur Visa — et le paiement finit `expired`. Expédier là-dessus, c'est
    // livrer sans être payé.
    expect(outcomeFromStatus('authorized')).toBeNull()
    expect(outcomeFromStatus('authorized')).not.toBe('paid')
  })

  it('n’est pas piégé par l’orthographe de « canceled »', () => {
    // Mollie écrit « canceled », un seul « l ». Un test sur « cancelled » ne
    // correspondrait jamais et tomberait silencieusement dans le cas par défaut.
    expect(outcomeFromStatus('canceled')).toBe('canceled')
    expect(outcomeFromStatus('cancelled')).toBeNull()
  })

  it('n’invente pas d’issue pour un statut inconnu', () => {
    expect(outcomeFromStatus('something_new')).toBeNull()
    expect(outcomeFromStatus('')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* URL de webhook                                                             */
/* -------------------------------------------------------------------------- */

describe('publicWebhookUrl', () => {
  it('construit l’URL quand l’origine est publique', () => {
    expect(publicWebhookUrl('https://boutique.example')).toBe(
      'https://boutique.example/api/paiement/webhook',
    )
    expect(publicWebhookUrl('https://lumera.onrender.com/')).toBe(
      'https://lumera.onrender.com/api/paiement/webhook',
    )
  })

  it('renonce sur une origine que Mollie ne peut pas joindre', () => {
    // Mollie refuse une URL de webhook non publique. Mieux vaut omettre le
    // champ que faire échouer la création du paiement.
    for (const origine of [
      'http://localhost:3400',
      'http://127.0.0.1:3400',
      'http://lumera.localhost:3400',
      'http://lumera.test',
      'http://192.168.1.20:3400',
      'http://10.0.0.5:3400',
      'http://172.16.3.4:3400',
      'pas une URL',
    ]) {
      expect(publicWebhookUrl(origine), origine).toBeNull()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Création d'un paiement                                                     */
/* -------------------------------------------------------------------------- */

describe('MollieDriver.createSession', () => {
  it('envoie une requête conforme et renvoie l’URL de paiement', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    const session = await driver.createSession(baseInput)

    expect(session).toMatchObject({
      provider: 'mollie',
      providerRef: 'tr_WDqYK6vllg',
      redirectUrl: 'https://www.mollie.com/checkout/select-method/WDqYK6vllg',
      isTestMode: true,
      simulated: false,
    })

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.url).toBe('https://api.mollie.com/v2/payments')
    expect(call.init?.method).toBe('POST')

    const headers = new Headers(call.init?.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${TEST_KEY}`)
    expect(headers.get('content-type')).toBe('application/json')
    // Sans clé d'idempotence, un double-clic ouvre deux paiements.
    expect(headers.get('idempotency-key')).toBe('order_cmd123')

    const body = JSON.parse(String(call.init?.body))
    // Le montant est un OBJET, et sa valeur une CHAÎNE : Mollie refuse un nombre.
    expect(body.amount).toEqual({ currency: 'EUR', value: '20.80' })
    expect(typeof body.amount.value).toBe('string')
    expect(body.description).toBe('Commande CMD-2026-00005')
    expect(body.metadata).toEqual({ orderId: 'cmd123', orderReference: 'CMD-2026-00005' })
    expect(body.locale).toBe('fr_FR')
  })

  it('fait passer le retour par notre route, jeton compris', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    await driver.createSession(baseInput)
    const body = JSON.parse(String(calls[0].init?.body))

    // Une seule URL de retour : c'est le modèle Mollie, et c'est la route qui
    // interroge l'API avant de décider où envoyer le client.
    expect(body.redirectUrl).toBe(
      'https://boutique.example/api/paiement/retour?order=cmd123&t=jeton-secret',
    )
    // Sans le jeton, le client se verrait refuser l'accès à sa propre commande.
    expect(body.redirectUrl).toContain('t=jeton-secret')
  })

  it('demande un webhook quand le site est joignable', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    await driver.createSession(baseInput)
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.webhookUrl).toBe('https://boutique.example/api/paiement/webhook')
  })

  it('OMET le webhook en local, au lieu de faire échouer la création', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'http://localhost:3400',
    })

    await driver.createSession(baseInput)
    const body = JSON.parse(String(calls[0].init?.body))
    // Mollie refuse localhost : envoyer le champ ferait échouer tout le tunnel.
    expect(body).not.toHaveProperty('webhookUrl')
  })

  it('n’envoie ni `method`, ni `profileId`, ni `testmode`', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    await driver.createSession(baseInput)
    const body = JSON.parse(String(calls[0].init?.body))

    // `method` restreint l'écran de sélection, mais si le client renonce sur la
    // page du moyen imposé, Mollie n'envoie AUCUN webhook.
    expect(body).not.toHaveProperty('method')
    // Interdits avec une clé d'API : réservés aux identifiants d'organisation.
    expect(body).not.toHaveProperty('profileId')
    expect(body).not.toHaveProperty('testmode')
  })

  it('lit le mode dans la clé, pas dans une variable séparée', () => {
    const { impl } = fakeFetch(() => ({ status: 201, body: molliePayment() }))
    expect(new MollieDriver('test_abc', { fetchImpl: impl }).isTestMode).toBe(true)
    expect(new MollieDriver('live_abc', { fetchImpl: impl }).isTestMode).toBe(false)
  })

  it('remonte le message de Mollie plutôt qu’un code nu', async () => {
    const { impl } = fakeFetch(() => ({
      status: 422,
      body: {
        status: 422,
        title: 'Unprocessable Entity',
        detail: 'The webhook URL is invalid',
        field: 'webhookUrl',
      },
    }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    await expect(driver.createSession(baseInput)).rejects.toThrow(
      /422 The webhook URL is invalid.*webhookUrl/,
    )
  })

  it('refuse une réponse sans URL de paiement, en disant quoi vérifier', async () => {
    // Arrive quand aucun moyen de paiement n'est actif sur le profil : Mollie
    // crée le paiement mais n'a aucune page à présenter.
    const { impl } = fakeFetch(() => ({
      status: 201,
      body: molliePayment({ _links: { self: { href: 'x' } } }),
    }))
    const driver = new MollieDriver(TEST_KEY, {
      fetchImpl: impl,
      siteOrigin: 'https://boutique.example',
    })

    await expect(driver.createSession(baseInput)).rejects.toThrow(/moyen de paiement/)
  })
})

/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */

describe('MollieDriver.parseWebhook', () => {
  it('ne croit pas le corps : il relit le paiement par l’API', async () => {
    const { impl, calls } = fakeFetch(() => ({
      status: 200,
      body: molliePayment({ status: 'paid', amountCaptured: { currency: 'EUR', value: '20.80' } }),
    }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    const event = await driver.parseWebhook('id=tr_WDqYK6vllg', new Headers())

    // C'est l'appel à l'API qui est la source de vérité, pas le POST reçu.
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.mollie.com/v2/payments/tr_WDqYK6vllg')
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe(`Bearer ${TEST_KEY}`)

    expect(event).toMatchObject({ providerRef: 'tr_WDqYK6vllg', outcome: 'paid', amountCents: 2080 })
  })

  it('n’appelle même pas l’API pour un corps qui ne désigne pas un paiement', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 200, body: molliePayment() }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    for (const corps of ['', 'id=', 'id=nimporte_quoi', 'autre=tr_x', 'id=tr_x%20y']) {
      expect(await driver.parseWebhook(corps, new Headers())).toBeNull()
    }
    expect(calls).toHaveLength(0)
  })

  it('n’exige aucune signature : Mollie n’en envoie pas', async () => {
    const { impl } = fakeFetch(() => ({ status: 200, body: molliePayment({ status: 'paid' }) }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    // En-têtes vides : le pilote ne doit pas lever pour autant.
    const event = await driver.parseWebhook('id=tr_WDqYK6vllg', new Headers())
    expect(event?.outcome).toBe('paid')
  })

  it('reste sans effet quand le paiement est encore ouvert', async () => {
    const { impl } = fakeFetch(() => ({ status: 200, body: molliePayment({ status: 'open' }) }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    // Un faux appel sur un paiement réel ne peut donc rien déclencher : il nous
    // fait relire la vérité, qui est « pas encore payé ».
    expect(await driver.parseWebhook('id=tr_WDqYK6vllg', new Headers())).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Relecture                                                                  */
/* -------------------------------------------------------------------------- */

describe('MollieDriver.fetchOutcome', () => {
  it('retient le montant CAPTURÉ sur un paiement abouti', async () => {
    const { impl } = fakeFetch(() => ({
      status: 200,
      body: molliePayment({
        status: 'paid',
        amount: { currency: 'EUR', value: '20.80' },
        // Capture partielle : ne vaut pas la commande, et le contrôle de
        // cohérence de `applyPaymentOutcome` doit pouvoir le voir.
        amountCaptured: { currency: 'EUR', value: '10.00' },
      }),
    }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    const event = await driver.fetchOutcome('tr_WDqYK6vllg')
    expect(event?.amountCents).toBe(1000)
  })

  it('retombe sur le montant demandé quand rien n’est capturé', async () => {
    const { impl } = fakeFetch(() => ({
      status: 200,
      body: molliePayment({ status: 'paid' }),
    }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })
    expect((await driver.fetchOutcome('tr_WDqYK6vllg'))?.amountCents).toBe(2080)
  })

  it('ne transmet aucun montant sur une issue négative', async () => {
    const { impl } = fakeFetch(() => ({ status: 200, body: molliePayment({ status: 'failed' }) }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })

    const event = await driver.fetchOutcome('tr_WDqYK6vllg')
    expect(event).toMatchObject({ outcome: 'failed', amountCents: null })
  })

  it('ignore un paiement inconnu de cette clé', async () => {
    // 404 : ce paiement n'est pas le nôtre. Il n'y a rien à appliquer, et
    // surtout pas un échec.
    const { impl } = fakeFetch(() => ({ status: 404, body: { status: 404, detail: 'No payment exists' } }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })
    expect(await driver.fetchOutcome('tr_inexistant')).toBeNull()
  })

  it('LÈVE quand Mollie est injoignable, au lieu de conclure', async () => {
    // Un 503 ne veut pas dire « pas payé ». L'appelant doit pouvoir distinguer
    // « issue inconnue » d'« impossible de savoir ».
    const { impl } = fakeFetch(() => ({ status: 503, body: { status: 503, detail: 'Service unavailable' } }))
    const driver = new MollieDriver(TEST_KEY, { fetchImpl: impl })
    await expect(driver.fetchOutcome('tr_WDqYK6vllg')).rejects.toThrow(/503/)
  })
})

/* -------------------------------------------------------------------------- */
/* Choix du prestataire                                                       */
/* -------------------------------------------------------------------------- */

describe('resolveProviderChoice', () => {
  const original = { ...process.env }

  function env(values: Record<string, string | undefined>) {
    process.env = { ...original }
    for (const key of ['MOLLIE_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYMENT_PROVIDER']) {
      delete process.env[key]
    }
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value
    }
  }

  it('choisit Mollie sur la seule présence de sa clé', () => {
    env({ MOLLIE_API_KEY: TEST_KEY })
    expect(resolveProviderChoice()).toMatchObject({ kind: 'mollie', isTestMode: true })
  })

  it('déduit le mode du préfixe de la clé', () => {
    env({ MOLLIE_API_KEY: 'live_abc' })
    expect(resolveProviderChoice()).toMatchObject({ kind: 'mollie', isTestMode: false })
  })

  it('REFUSE une clé dont le préfixe ne dit pas le mode', () => {
    // Ne pas savoir si une clé encaisse réellement est exactement le cas où il
    // ne faut pas deviner.
    env({ MOLLIE_API_KEY: 'abc_inconnu' })
    const choice = resolveProviderChoice()
    expect(choice.kind).toBe('unusable')
    if (choice.kind === 'unusable') expect(choice.problem).toMatch(/test_|live_/)
  })

  it('REFUSE deux prestataires configurés sans arbitrage', () => {
    // Choisir en silence, c'est risquer d'encaisser chez l'un pendant qu'on
    // surveille l'autre.
    env({ MOLLIE_API_KEY: TEST_KEY, STRIPE_SECRET_KEY: 'sk_test_x' })
    const choice = resolveProviderChoice()
    expect(choice.kind).toBe('unusable')
    if (choice.kind === 'unusable') expect(choice.problem).toMatch(/PAYMENT_PROVIDER/)
  })

  it('tranche quand PAYMENT_PROVIDER le dit', () => {
    env({ MOLLIE_API_KEY: TEST_KEY, STRIPE_SECRET_KEY: 'sk_test_x', PAYMENT_PROVIDER: 'stripe' })
    expect(resolveProviderChoice().kind).toBe('stripe')
    env({ MOLLIE_API_KEY: TEST_KEY, STRIPE_SECRET_KEY: 'sk_test_x', PAYMENT_PROVIDER: 'MOLLIE' })
    expect(resolveProviderChoice().kind).toBe('mollie')
  })

  it('signale un PAYMENT_PROVIDER qui désigne un prestataire non configuré', () => {
    env({ MOLLIE_API_KEY: TEST_KEY, PAYMENT_PROVIDER: 'stripe' })
    const choice = resolveProviderChoice()
    expect(choice.kind).toBe('unusable')
    if (choice.kind === 'unusable') expect(choice.problem).toMatch(/STRIPE_SECRET_KEY/)
  })

  it('tombe sur la simulation hors production', () => {
    env({})
    expect(resolveProviderChoice().kind).toBe('simulation')
  })

  it('REFUSE la simulation en production', () => {
    // Le garde-fou qui compte : une boutique en production sans prestataire ne
    // doit pas confirmer de commandes. Le test précédent ne l'exerçait pas —
    // sous Vitest, NODE_ENV vaut « test » — et la garde aurait pu être retirée
    // sans qu'aucun test ne bronche.
    env({})
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const choice = resolveProviderChoice()
      expect(choice.kind).toBe('unusable')
      if (choice.kind === 'unusable') {
        expect(choice.problem).toMatch(/MOLLIE_API_KEY/)
        expect(choice.problem).toMatch(/simul/i)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('REFUSE aussi une configuration ambiguë en production', () => {
    env({ MOLLIE_API_KEY: TEST_KEY, STRIPE_SECRET_KEY: 'sk_live_x' })
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(resolveProviderChoice().kind).toBe('unusable')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('tient une clé blanche pour absente', () => {
    env({ MOLLIE_API_KEY: '   ' })
    expect(resolveProviderChoice().kind).toBe('simulation')
  })
})
