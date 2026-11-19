import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/db'
import { POST } from '../src/app/api/mesure/route'
import {
  listerVisites,
  lireCarteClics,
  lireStatistiques,
  lireVisite,
  periode,
} from '../src/lib/queries/mesure'
import { EVENEMENTS_INTENTION, NOMS_EVENEMENTS, estUnEvenement } from '../src/lib/mesure-evenements'

/**
 * La mesure approfondie (19 novembre 2026) : ce que /api/mesure accepte, ce
 * qu'il refuse, et ce que le back-office en relit.
 *
 * Touche une vraie base : les requêtes de statistiques sont du SQL écrit à la
 * main (percentile, ROLLUP, DISTINCT ON), et seul PostgreSQL dit si elles
 * comptent juste.
 */

const envoyer = (corps: unknown, ua = 'Mozilla/5.0 (iPhone)') =>
  POST(
    new Request('https://ledvroom.com/api/mesure', {
      method: 'POST',
      headers: { 'user-agent': ua, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    }),
  )

const base = { device: 'mobile', w: 390, h: 844 }

beforeEach(async () => {
  await prisma.visitTrace.deleteMany()
  await prisma.visitEvent.deleteMany()
})

afterAll(async () => {
  await prisma.visitTrace.deleteMany()
  await prisma.visitEvent.deleteMany()
  await prisma.$disconnect()
})

describe('la liste close des événements', () => {
  it('reconnaît les noms prévus et rien d’autre', () => {
    expect(estUnEvenement('ajout-panier')).toBe(true)
    expect(estUnEvenement('clic-rage')).toBe(true)
    expect(estUnEvenement('ajout_panier')).toBe(false)
    expect(estUnEvenement('')).toBe(false)
    expect(NOMS_EVENEMENTS.size).toBeGreaterThan(20)
  })

  it('range l’ajout au panier et la vente parmi les intentions d’achat', () => {
    expect(EVENEMENTS_INTENTION).toContain('ajout-panier')
    expect(EVENEMENTS_INTENTION).toContain('commande-payee')
    expect(EVENEMENTS_INTENTION).not.toContain('clic-rage')
  })
})

describe('/api/mesure', () => {
  it('répond toujours 204, même à un corps illisible', async () => {
    expect((await envoyer('pas du json')).status).toBe(204)
    const r = await POST(new Request('https://ledvroom.com/api/mesure', { method: 'POST', body: '{oups' }))
    expect(r.status).toBe(204)
    expect(await prisma.visitEvent.count()).toBe(0)
  })

  it('écarte les robots déclarés', async () => {
    await envoyer({ events: [{ ...base, kind: 'page', path: '/', visit: 'v1' }] }, 'Googlebot/2.1')
    expect(await prisma.visitEvent.count()).toBe(0)
  })

  it('jette un événement dont le nom est hors de la liste', async () => {
    await envoyer({
      events: [
        { ...base, kind: 'event', name: 'ajout-panier', path: '/p/x', visit: 'v1', value: 2590 },
        { ...base, kind: 'event', name: 'invente', path: '/p/x', visit: 'v1' },
        { ...base, kind: 'event', path: '/p/x', visit: 'v1' },
        { ...base, kind: 'inconnu', path: '/p/x', visit: 'v1' },
      ],
    })
    const lignes = await prisma.visitEvent.findMany()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ kind: 'event', name: 'ajout-panier', value: 2590 })
  })

  it('ne garde ni le back-office ni les identifiants de commande', async () => {
    await envoyer({
      events: [
        { ...base, kind: 'page', path: '/admin/statistiques', visit: 'v1' },
        { ...base, kind: 'page', path: '/commande/cmabc123/confirmation', visit: 'v1' },
      ],
      traces: [{ path: '/admin', visit: 'v1', t: 0, x: 1, y: 1, w: 390, h: 844, doc: 2000 }],
    })
    const lignes = await prisma.visitEvent.findMany()
    expect(lignes.map((l) => l.path)).toEqual(['/commande/…/confirmation'])
    expect(await prisma.visitTrace.count()).toBe(0)
  })

  it('ne garde le temps et le défilement que sur une sortie, et les borne', async () => {
    await envoyer({
      events: [
        { ...base, kind: 'sortie', path: '/p/x', visit: 'v1', ms: 12_345, scroll: 250 },
        { ...base, kind: 'page', path: '/p/x', visit: 'v1', ms: 999, scroll: 40, label: 'texte libre' },
        { ...base, kind: 'sortie', path: '/p/y', visit: 'v1', ms: -5, scroll: Number.NaN },
      ],
    })
    const lignes = await prisma.visitEvent.findMany({ orderBy: { path: 'asc' } })
    const sortieX = lignes.find((l) => l.kind === 'sortie' && l.path === '/p/x')!
    expect(sortieX).toMatchObject({ ms: 12_345, scroll: 100, label: null })
    const page = lignes.find((l) => l.kind === 'page')!
    // Sur une page vue : ni temps, ni défilement, ni libellé libre.
    expect(page).toMatchObject({ ms: null, scroll: null, label: null })
    const sortieY = lignes.find((l) => l.path === '/p/y')!
    expect(sortieY).toMatchObject({ ms: 0, scroll: null })
  })

  it('efface d’un libellé ce qui pourrait désigner quelqu’un', async () => {
    await envoyer({
      events: [
        { ...base, kind: 'event', name: 'champ-abandonne', path: '/commande', visit: 'v1', label: 'jean@exemple.fr' },
        { ...base, kind: 'event', name: 'erreur-formulaire', path: '/commande', visit: 'v1', label: 'shipping.postalCode' },
      ],
    })
    const lignes = await prisma.visitEvent.findMany({ orderBy: { name: 'asc' } })
    expect(lignes.find((l) => l.name === 'champ-abandonne')!.label).toBeNull()
    expect(lignes.find((l) => l.name === 'erreur-formulaire')!.label).toBe('shipping.postalCode')
  })

  it('date chaque geste par son âge, pour garder l’ordre d’un même envoi', async () => {
    const avant = Date.now()
    await envoyer({
      events: [
        { ...base, kind: 'page', path: '/p/x', visit: 'v1', age: 5000 },
        { ...base, kind: 'click', path: '/p/x', visit: 'v1', label: 'Ajouter au panier', age: 2000 },
        // Un âge absurde est ramené à 30 minutes au plus.
        { ...base, kind: 'click', path: '/p/x', visit: 'v1', label: 'vieux', age: 10 * 3600 * 1000 },
      ],
    })
    const lignes = await prisma.visitEvent.findMany({ orderBy: { at: 'asc' } })
    expect(lignes.map((l) => l.label)).toEqual(['vieux', null, 'Ajouter au panier'])
    const page = lignes.find((l) => l.kind === 'page')!
    expect(avant - page.at.getTime()).toBeGreaterThanOrEqual(4900)
    expect(avant - lignes[0].at.getTime()).toBeLessThanOrEqual(30 * 60 * 1000 + 1000)
  })

  it('enregistre la trace du pointeur, avec son type', async () => {
    await envoyer({
      traces: [
        { path: '/p/x', visit: 'v1', kind: 'scroll', t: 0, x: 0, y: 0, w: 390, h: 844, doc: 3000 },
        { path: '/p/x', visit: 'v1', kind: 'down', t: 800, x: 200, y: 900, w: 390, h: 844, doc: 3000 },
        { path: '/p/x', visit: 'v1', kind: 'nimporte', t: 900, x: 210, y: 910, w: 390, h: 844, doc: 3000 },
        { path: '/p/x', visit: 'v1', t: 1000, x: 'a', y: 1, w: 390, h: 844, doc: 3000 },
      ],
    })
    const traces = await prisma.visitTrace.findMany({ orderBy: { t: 'asc' } })
    expect(traces.map((t) => t.kind)).toEqual(['scroll', 'down', 'move'])
  })
})

describe('ce que le back-office en relit', () => {
  /** Deux visites : une qui achète presque, une qui rebondit. */
  async function deuxVisites() {
    await envoyer({
      events: [
        { ...base, kind: 'page', path: '/p/pack', visit: 'achat', source: 'google (publicité)', age: 60_000 },
        { ...base, kind: 'click', path: '/p/pack', visit: 'achat', label: 'Ajouter au panier', x: 200, y: 700, age: 50_000 },
        { ...base, kind: 'event', name: 'ajout-panier', path: '/p/pack', visit: 'achat', value: 2590, label: 'Pack', age: 49_000 },
        { ...base, kind: 'event', name: 'clic-mort', path: '/p/pack', visit: 'achat', label: 'photo', x: 180, y: 400, age: 48_000 },
        { ...base, kind: 'sortie', path: '/p/pack', visit: 'achat', ms: 30_000, scroll: 80, age: 40_000 },
        { ...base, kind: 'page', path: '/panier', visit: 'achat', age: 39_000 },
        { ...base, kind: 'sortie', path: '/panier', visit: 'achat', ms: 15_000, scroll: 100, age: 20_000 },
        { ...base, kind: 'page', path: '/p/pack', visit: 'rebond', source: 'direct', device: 'ordinateur', w: 1440, h: 900, age: 10_000 },
        { ...base, kind: 'sortie', path: '/p/pack', visit: 'rebond', device: 'ordinateur', w: 1440, h: 900, ms: 3_000, scroll: 30, age: 7_000 },
      ],
      traces: [
        { path: '/p/pack', visit: 'achat', kind: 'move', t: 1000, x: 100, y: 500, w: 390, h: 844, doc: 3000, age: 59_000 },
      ],
    })
  }

  it('compte l’entonnoir, la durée et le rebond', async () => {
    await deuxVisites()
    const s = await lireStatistiques(periode(7), null)
    expect(s.resume.visites).toBe(2)
    expect(s.entonnoir).toMatchObject({ visites: 2, fiche: 2, ajout: 1, panier: 1, commande: 0, payee: 0 })
    // Une visite de 45 s et une de 3 s : la médiane est entre les deux.
    expect(s.duree.mesurees).toBe(2)
    expect(s.duree.rebonds).toBe(1)
    expect(s.duree.msMedian).toBe(24_000)
    // Écran par écran : un téléphone, un ordinateur.
    expect(s.entonnoirParEcran.map((l) => l.device).sort()).toEqual(['mobile', 'ordinateur'])
    // La page d'arrivée commune aux deux visites.
    const arrivee = s.atterrissages.find((a) => a.path === '/p/pack')!
    expect(arrivee).toMatchObject({ visites: 2, ajouts: 1, rebonds: 1, pub: 1, unePage: 1 })
    // Temps médian sur la fiche : 30 s et 3 s.
    const fiche = s.pages.find((p) => p.path === '/p/pack')!
    expect(fiche.msMedian).toBe(16_500)
    expect(s.evenements.find((e) => e.name === 'ajout-panier')).toMatchObject({ fois: 1, total: 2590 })
    expect(s.precisions['clic-mort']).toEqual([{ label: 'photo', fois: 1 }])
    const pub = s.sources.find((x) => x.source === 'google (publicité)')!
    expect(pub).toMatchObject({ visites: 1, ajout: 1, panier: 1 })
  })

  it('liste les visites, et les filtre', async () => {
    await deuxVisites()
    const toutes = await listerVisites(periode(7), 'toutes', null, 0)
    expect(toutes.total).toBe(2)
    expect(toutes.visites[0].visit).toBe('rebond')
    const achat = toutes.visites.find((v) => v.visit === 'achat')!
    expect(achat).toMatchObject({ pages: 2, ajout: true, panier: true, gene: true, entree: '/p/pack', sortie: '/panier', points: 1, ms: 45_000 })
    expect((await listerVisites(periode(7), 'rebonds', null, 0)).visites.map((v) => v.visit)).toEqual(['rebond'])
    expect((await listerVisites(periode(7), 'detail', null, 0)).visites.map((v) => v.visit)).toEqual(['achat'])
    expect((await listerVisites(periode(7), 'pub', null, 0)).total).toBe(1)
    expect((await listerVisites(periode(7), 'toutes', 'ordinateur', 0)).visites.map((v) => v.visit)).toEqual(['rebond'])
  })

  it('relit une visite dans l’ordre', async () => {
    await deuxVisites()
    const { gestes, traces } = await lireVisite('achat')
    expect(gestes.map((g) => g.kind)).toEqual(['page', 'click', 'event', 'event', 'sortie', 'page', 'sortie'])
    expect(traces).toHaveLength(1)
  })

  it('place les clics et la profondeur sur la carte', async () => {
    await deuxVisites()
    const carte = await lireCarteClics(periode(7), '/p/pack', 'mobile')
    expect(carte.points.map((p) => p.kind).sort()).toEqual(['click', 'event'])
    const a = (t: number) => carte.profondeur.find((x) => x.tranche === t)!.visites
    expect(a(0)).toBe(1)
    expect(a(80)).toBe(1)
    expect(a(90)).toBe(0)
    // L'ordinateur ne voit pas les clics du téléphone.
    const grand = await lireCarteClics(periode(7), '/p/pack', 'ordinateur')
    expect(grand.points).toHaveLength(0)
  })
})
