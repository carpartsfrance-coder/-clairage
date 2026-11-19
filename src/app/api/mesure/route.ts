import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  ETAPES_SIGNALEES,
  cheminSansIdentifiant,
  libelleSansDonneePerso,
} from '@/lib/mesure-chemins'
import { NOMS_EVENEMENTS } from '@/lib/mesure-evenements'

/**
 * Réception de la mesure d'audience (components/mesure/Mesure.tsx).
 *
 * Ne garde que ce qui est envoyé, tronqué, et rien de la requête elle-même :
 * ni adresse IP, ni navigateur. Les robots qui se déclarent sont écartés.
 * Les chemins et les textes cliqués sont nettoyés une seconde fois ici
 * (lib/mesure-chemins.ts) : un envoi ne prouve pas qu'il vient de notre script.
 * Répond toujours 204 : la mesure ne doit jamais gêner la navigation.
 *
 * Deux listes arrivent dans le même corps :
 * - `events`, les pages, sorties, clics et gestes métier, pour tout le monde ;
 * - `traces`, la trace fine du pointeur, qui n'est envoyée que par un
 *   navigateur où l'exploitant a allumé le mode détaillé. Rien ne distingue
 *   cet envoi côté serveur, et c'est voulu : le serveur ne doit pas avoir à
 *   reconnaître un navigateur pour décider. Ce qui protège les visiteurs est
 *   que le script ne produit jamais de trace chez eux ; ce qui protège la base
 *   est le plafond ci-dessous et la purge à sept jours.
 */

const ROBOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|pingdom|monitor/i
const KINDS = new Set(['page', 'sortie', 'click', 'event'])
const DEVICES = new Set(['mobile', 'tablette', 'ordinateur'])

/** Plafonds : au-delà, c'est une erreur ou un abus, pas une visite. */
const EVENEMENTS_PAR_ENVOI = 60
const TRACES_PAR_ENVOI = 400
const CORPS_MAX = 120_000

/** Un geste vieux de plus de 30 minutes n'est plus daté : il garde l'heure d'arrivée. */
const AGE_MAX_MS = 30 * 60 * 1000

const TRACE_KINDS = new Set(['move', 'down', 'scroll'])

const texte = (v: unknown, n: number) =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null

/** Un entier dans des bornes, ou rien. Protège aussi des `NaN` et des `Infinity`. */
const entier = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : null

export async function POST(request: Request) {
  const rien = new NextResponse(null, { status: 204 })
  if (ROBOT.test(request.headers.get('user-agent') ?? '')) return rien
  const brut = await request.text().catch(() => '')
  if (!brut || brut.length > CORPS_MAX) return rien

  /*
    L'heure d'un geste : celle du serveur, moins l'âge que le navigateur
    annonce. Voir `quand` dans components/mesure/file.ts — c'est ce qui garde
    l'ordre des gestes d'un même envoi, sans faire confiance à l'horloge du
    visiteur.
  */
  const maintenant = Date.now()
  const date = (age: unknown) => new Date(maintenant - (entier(age, 0, AGE_MAX_MS) ?? 0))

  let corps: { events?: unknown; traces?: unknown }
  try {
    corps = JSON.parse(brut)
  } catch {
    return rien
  }

  const lignes = Array.isArray(corps.events)
    ? corps.events.slice(0, EVENEMENTS_PAR_ENVOI).flatMap((e) => {
        if (typeof e !== 'object' || e === null) return []
        const x = e as Record<string, unknown>
        const kind = texte(x.kind, 10)
        const chemin = texte(x.path, 200)
        const visit = texte(x.visit, 64)
        if (!kind || !KINDS.has(kind) || !chemin || !chemin.startsWith('/') || !visit) return []
        if (chemin.startsWith('/admin') || chemin.startsWith('/api')) return []
        const path = cheminSansIdentifiant(chemin)
        const device = texte(x.device, 12)
        const cible = texte(x.target, 200)
        const libelle = texte(x.label, 80)
        // Un nom d'événement hors de la liste close est jeté : la liste est la
        // seule façon de garantir qu'on sait ce qu'on enregistre.
        const nom = kind === 'event' ? texte(x.name, 40) : null
        if (kind === 'event' && (!nom || !NOMS_EVENEMENTS.has(nom))) return []
        return [
          {
            at: date(x.age),
            kind,
            path,
            visit,
            target: cible?.startsWith('/') ? cheminSansIdentifiant(cible) : cible,
            // Sur une page vue, le libellé est l'étape signalée par la page,
            // rien d'autre. Sur une sortie, il n'y en a jamais.
            label:
              kind === 'page'
                ? libelle && ETAPES_SIGNALEES.has(libelle)
                  ? libelle
                  : null
                : kind === 'sortie'
                  ? null
                  : (libelleSansDonneePerso(path, libelle) ?? null),
            zone: texte(x.zone, 60),
            query: texte(x.query, 80),
            source: texte(x.source, 80),
            device: device && DEVICES.has(device) ? device : null,
            name: nom,
            // Quatre heures de plafond : au-delà, c'est un onglet oublié.
            value: entier(x.value, -100_000_000, 100_000_000),
            ms: kind === 'sortie' ? entier(x.ms, 0, 4 * 3600 * 1000) : null,
            scroll: kind === 'sortie' ? entier(x.scroll, 0, 100) : null,
            x: entier(x.x, 0, 100_000),
            y: entier(x.y, 0, 1_000_000),
            w: entier(x.w, 0, 20_000),
            h: entier(x.h, 0, 20_000),
          },
        ]
      })
    : []

  const traces = Array.isArray(corps.traces)
    ? corps.traces.slice(0, TRACES_PAR_ENVOI).flatMap((e) => {
        if (typeof e !== 'object' || e === null) return []
        const x = e as Record<string, unknown>
        const chemin = texte(x.path, 200)
        const visit = texte(x.visit, 64)
        if (!chemin || !chemin.startsWith('/') || !visit) return []
        if (chemin.startsWith('/admin') || chemin.startsWith('/api')) return []
        const px = entier(x.x, 0, 100_000)
        const py = entier(x.y, 0, 1_000_000)
        const w = entier(x.w, 1, 20_000)
        const h = entier(x.h, 1, 20_000)
        const doc = entier(x.doc, 1, 1_000_000)
        const t = entier(x.t, 0, 4 * 3600 * 1000)
        if (px === null || py === null || w === null || h === null || doc === null || t === null) {
          return []
        }
        const kind = texte(x.kind, 10)
        return [
          {
            at: date(x.age),
            visit,
            path: cheminSansIdentifiant(chemin),
            kind: kind && TRACE_KINDS.has(kind) ? kind : 'move',
            t,
            x: px,
            y: py,
            w,
            h,
            doc,
          },
        ]
      })
    : []

  if (lignes.length === 0 && traces.length === 0) return rien

  try {
    await Promise.all([
      lignes.length > 0 ? prisma.visitEvent.createMany({ data: lignes }) : null,
      traces.length > 0 ? prisma.visitTrace.createMany({ data: traces }) : null,
    ])
  } catch (error) {
    console.error('[mesure] enregistrement impossible', error)
  }
  return rien
}
