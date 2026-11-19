import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'

/**
 * Lecture de la mesure d'audience pour le back-office (/admin/statistiques).
 * Tout est compté en visites distinctes quand c'est possible : une personne
 * qui recharge dix fois sa fiche produit reste une visite.
 *
 * **Deux âges de données.** Avant le 19 novembre 2026, la mesure ne gardait
 * que les pages et les clics. Depuis, elle garde aussi le temps passé, le
 * défilement, les gestes métier et la position des clics. Les écrans qui
 * reposent sur ces nouveautés le disent (`mesureApprofondieDepuis`) : un
 * temps médian calculé sur trois jours ne doit pas se lire comme un chiffre
 * de trente.
 */

export type Periode = { jours: number; depuis: Date }

export function periode(jours: number): Periode {
  const j = [1, 7, 30, 90].includes(jours) ? jours : 7
  return { jours: j, depuis: new Date(Date.now() - j * 24 * 3600 * 1000) }
}

/** Les écrans, tels que la mesure les range. */
export type Ecran = 'mobile' | 'tablette' | 'ordinateur'
export const ECRANS: readonly Ecran[] = ['mobile', 'tablette', 'ordinateur']

/** Les largeurs de fenêtre de chaque écran (mêmes seuils que `ecran()` côté navigateur). */
export const LARGEURS: Record<Ecran, { min: number; max: number; apercu: number }> = {
  mobile: { min: 0, max: 639, apercu: 390 },
  tablette: { min: 640, max: 1023, apercu: 820 },
  ordinateur: { min: 1024, max: 20_000, apercu: 1440 },
}

/* -------------------------------------------------------------------------- */
/* Les conditions qui reconnaissent une étape                                 */
/* -------------------------------------------------------------------------- */

/*
  Écrites une fois, réutilisées partout : l'entonnoir, les provenances, les
  pages d'atterrissage et la liste des visites doivent compter exactement la
  même chose, sinon on ne sait plus quel chiffre croire.
*/
const EST_VEHICULE = Prisma.sql`(kind = 'page' AND (path LIKE '/vehicule/resultats%' OR path LIKE '/packs/%/%/%'))`
const EST_FICHE = Prisma.sql`(kind = 'page' AND path LIKE '/p/%')`
const EST_AJOUT = Prisma.sql`(kind = 'event' AND name IN ('ajout-panier', 'ajout-pack'))`
const EST_PANIER = Prisma.sql`(kind = 'page' AND path = '/panier')`
const EST_COMMANDE = Prisma.sql`(kind = 'page' AND path = '/commande')`
const EST_ENVOI = Prisma.sql`(kind = 'event' AND name = 'commande-envoyee')`
// La page de confirmation s'affiche aussi quand le paiement échoue ou attend :
// seule celle d'un paiement encaissé porte ce repère.
const EST_PAYEE = Prisma.sql`(kind = 'page' AND path LIKE '/commande/%/confirmation' AND label = 'commande-payee')`
const EST_GENE = Prisma.sql`(kind = 'event' AND name IN ('clic-rage', 'clic-mort', 'erreur-formulaire', 'commande-refusee', 'ajout-panier-refuse', 'code-promo-refuse'))`

/**
 * Les étapes de l'achat, dans l'ordre où l'entonnoir les affiche.
 *
 * `geste` : l'étape est reconnue à un geste (un ajout au panier réussi, une
 * commande validée), mesuré seulement depuis la mesure approfondie — et non à
 * une page vue, mesurée depuis le lancement. Sur une période qui commence
 * avant, ces étapes ne comptent qu'une partie des visites.
 */
export const ETAPES = [
  { cle: 'visites', label: 'Visite du site', court: 'Visites', geste: false },
  { cle: 'fiche', label: 'A ouvert une fiche produit', court: 'Fiche', geste: false },
  { cle: 'ajout', label: 'A ajouté au panier', court: 'Ajout panier', geste: true },
  { cle: 'panier', label: 'A ouvert son panier', court: 'Panier', geste: false },
  { cle: 'commande', label: 'A commencé la commande', court: 'Commande', geste: false },
  { cle: 'envoyee', label: 'A validé la commande (vers le paiement)', court: 'Validée', geste: true },
  { cle: 'payee', label: 'Commande payée', court: 'Payée', geste: false },
] as const

export type CleEtape = (typeof ETAPES)[number]['cle']

/** Une ligne d'entonnoir : un écran, ou tous (`device = 'tous'`). */
export type LigneEntonnoir = { device: string; vehicule: number } & Record<CleEtape, number>

/** Le parcours d'achat d'une provenance (pub Google, accès direct…). */
export type ParcoursProvenance = {
  source: string
  visites: number
  fiche: number
  ajout: number
  panier: number
  commande: number
  payees: number
  msMedian: number | null
}

/* -------------------------------------------------------------------------- */
/* La page principale                                                         */
/* -------------------------------------------------------------------------- */

export async function lireStatistiques(p: Periode, page: string | null) {
  const { depuis } = p
  const [
    resume,
    duree,
    entonnoir,
    pages,
    sorties,
    atterrissages,
    clics,
    recherches,
    sources,
    jours,
    evenements,
    precisions,
    approfondie,
    ventes,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ visites: number; pages: number; clics: number }>>`
      SELECT count(DISTINCT visit)::int AS visites,
             count(*) FILTER (WHERE kind = 'page')::int AS pages,
             count(*) FILTER (WHERE kind = 'click')::int AS clics
      FROM "VisitEvent" WHERE at >= ${depuis}`,

    // Durée d'une visite et rebond. Ne compte que les visites dont on connaît
    // la durée : celles d'avant le 19 novembre n'en ont pas.
    prisma.$queryRaw<Array<{ mesurees: number; msMedian: number | null; rebonds: number }>>`
      WITH v AS (
        SELECT visit,
               count(*) FILTER (WHERE kind = 'page') AS pages,
               sum(ms) FILTER (WHERE kind = 'sortie') AS ms
        FROM "VisitEvent" WHERE at >= ${depuis}
        GROUP BY visit
      )
      SELECT count(*) FILTER (WHERE ms IS NOT NULL)::int AS mesurees,
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL))::int AS "msMedian",
             count(*) FILTER (WHERE ms IS NOT NULL AND pages <= 1 AND ms < 10000)::int AS rebonds
      FROM v`,

    // L'entonnoir, écran par écran, avec une ligne « tous » en tête.
    prisma.$queryRaw<LigneEntonnoir[]>`
      WITH v AS (
        SELECT visit,
               max(device) AS device,
               bool_or(${EST_VEHICULE}) AS vehicule,
               bool_or(${EST_FICHE}) AS fiche,
               bool_or(${EST_AJOUT}) AS ajout,
               bool_or(${EST_PANIER}) AS panier,
               bool_or(${EST_COMMANDE}) AS commande,
               bool_or(${EST_ENVOI}) AS envoyee,
               bool_or(${EST_PAYEE}) AS payee
        FROM "VisitEvent" WHERE at >= ${depuis}
        GROUP BY visit
      )
      SELECT CASE WHEN GROUPING(device) = 1 THEN 'tous' ELSE coalesce(device, 'inconnu') END AS device,
             count(*)::int AS visites,
             count(*) FILTER (WHERE vehicule)::int AS vehicule,
             count(*) FILTER (WHERE fiche)::int AS fiche,
             count(*) FILTER (WHERE ajout)::int AS ajout,
             count(*) FILTER (WHERE panier)::int AS panier,
             count(*) FILTER (WHERE commande)::int AS commande,
             count(*) FILTER (WHERE envoyee)::int AS envoyee,
             count(*) FILTER (WHERE payee)::int AS payee
      FROM v
      GROUP BY ROLLUP (device)
      ORDER BY GROUPING(device) DESC, count(*) DESC`,

    // Pages vues, et ce qu'on en a fait : temps passé, défilement.
    prisma.$queryRaw<
      Array<{
        path: string
        vues: number
        visites: number
        mesurees: number | null
        msMedian: number | null
        scrollMedian: number | null
        moins5s: number | null
      }>
    >`
      WITH vues AS (
        SELECT path, count(*)::int AS vues, count(DISTINCT visit)::int AS visites
        FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'page'
        GROUP BY path
      ), s AS (
        SELECT visit, path, sum(ms) AS ms, max(scroll) AS scroll
        FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'sortie'
        GROUP BY visit, path
      ), t AS (
        SELECT path,
               count(*)::int AS mesurees,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY ms))::int AS "msMedian",
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY scroll))::int AS "scrollMedian",
               count(*) FILTER (WHERE ms < 5000)::int AS "moins5s"
        FROM s GROUP BY path
      )
      SELECT vues.path, vues.vues, vues.visites, t.mesurees, t."msMedian", t."scrollMedian", t."moins5s"
      FROM vues LEFT JOIN t USING (path)
      ORDER BY vues.visites DESC LIMIT 40`,

    // La dernière page de chaque visite : là où les gens s'arrêtent.
    prisma.$queryRaw<Array<{ path: string; sorties: number }>>`
      SELECT path, count(*)::int AS sorties FROM (
        SELECT DISTINCT ON (visit) visit, path FROM "VisitEvent"
        WHERE at >= ${depuis} AND kind = 'page' ORDER BY visit, at DESC
      ) d GROUP BY path ORDER BY sorties DESC LIMIT 25`,

    /*
      La première page de chaque visite : là où les gens arrivent. Pour une
      campagne Shopping, c'est le tableau qui compte — chaque ligne est une
      fiche que la publicité a choisie pour vous, et dit ce qu'elle en a fait.
    */
    prisma.$queryRaw<
      Array<{
        path: string
        visites: number
        unePage: number
        mesurees: number
        rebonds: number
        msMedian: number | null
        ajouts: number
        payees: number
        pub: number
      }>
    >`
      WITH entree AS (
        SELECT DISTINCT ON (visit) visit, path FROM "VisitEvent"
        WHERE at >= ${depuis} AND kind = 'page' ORDER BY visit, at
      ), v AS (
        SELECT visit,
               count(*) FILTER (WHERE kind = 'page') AS pages,
               sum(ms) FILTER (WHERE kind = 'sortie') AS ms,
               bool_or(${EST_AJOUT}) AS ajout,
               bool_or(${EST_PAYEE}) AS payee,
               bool_or(source = 'google (publicité)') AS pub
        FROM "VisitEvent" WHERE at >= ${depuis}
        GROUP BY visit
      )
      SELECT entree.path,
             count(*)::int AS visites,
             count(*) FILTER (WHERE v.pages <= 1)::int AS "unePage",
             count(*) FILTER (WHERE v.ms IS NOT NULL)::int AS mesurees,
             count(*) FILTER (WHERE v.ms IS NOT NULL AND v.pages <= 1 AND v.ms < 10000)::int AS rebonds,
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY v.ms) FILTER (WHERE v.ms IS NOT NULL))::int AS "msMedian",
             count(*) FILTER (WHERE v.ajout)::int AS ajouts,
             count(*) FILTER (WHERE v.payee)::int AS payees,
             count(*) FILTER (WHERE v.pub)::int AS pub
      FROM entree JOIN v USING (visit)
      GROUP BY entree.path ORDER BY visites DESC LIMIT 30`,

    prisma.$queryRaw<
      Array<{ zone: string | null; label: string | null; target: string | null; clics: number; visites: number }>
    >`
      SELECT zone, label, target, count(*)::int AS clics, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'click'
        ${page ? Prisma.sql`AND path = ${page}` : Prisma.empty}
      GROUP BY zone, label, target ORDER BY clics DESC LIMIT 80`,

    prisma.$queryRaw<Array<{ query: string; fois: number }>>`
      SELECT lower(query) AS query, count(DISTINCT visit)::int AS fois
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'page' AND query IS NOT NULL
      GROUP BY lower(query) ORDER BY fois DESC LIMIT 40`,

    // Pour chaque provenance, jusqu'où ses visites sont allées. La provenance
    // est notée sur la première page de la visite.
    prisma.$queryRaw<ParcoursProvenance[]>`
      WITH v AS (
        SELECT visit, max(source) AS source FROM "VisitEvent"
        WHERE at >= ${depuis} AND source IS NOT NULL
        GROUP BY visit
      ), e AS (
        SELECT visit,
               bool_or(${EST_FICHE}) AS fiche,
               bool_or(${EST_AJOUT}) AS ajout,
               bool_or(${EST_PANIER}) AS panier,
               bool_or(${EST_COMMANDE}) AS commande,
               bool_or(${EST_PAYEE}) AS payee,
               sum(ms) FILTER (WHERE kind = 'sortie') AS ms
        FROM "VisitEvent" WHERE at >= ${depuis}
        GROUP BY visit
      )
      SELECT v.source,
             count(*)::int AS visites,
             count(*) FILTER (WHERE e.fiche)::int AS fiche,
             count(*) FILTER (WHERE e.ajout)::int AS ajout,
             count(*) FILTER (WHERE e.panier)::int AS panier,
             count(*) FILTER (WHERE e.commande)::int AS commande,
             count(*) FILTER (WHERE e.payee)::int AS payees,
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY e.ms) FILTER (WHERE e.ms IS NOT NULL))::int AS "msMedian"
      FROM v JOIN e USING (visit)
      GROUP BY v.source ORDER BY visites DESC LIMIT 25`,

    prisma.$queryRaw<Array<{ jour: Date; visites: number }>>`
      SELECT date_trunc('day', at) AS jour, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis}
      GROUP BY 1 ORDER BY 1`,

    // Les gestes métier : combien de fois, combien de visites.
    prisma.$queryRaw<Array<{ name: string; fois: number; visites: number; total: number }>>`
      SELECT name, count(*)::int AS fois, count(DISTINCT visit)::int AS visites,
             coalesce(sum(value), 0)::bigint::float8 AS total
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'event' AND name IS NOT NULL
      GROUP BY name ORDER BY fois DESC`,

    // Et ce qu'ils précisent : quel produit, quelle raison, quel champ.
    prisma.$queryRaw<Array<{ name: string; label: string; fois: number }>>`
      SELECT name, label, count(*)::int AS fois
      FROM "VisitEvent"
      WHERE at >= ${depuis} AND kind = 'event' AND name IS NOT NULL AND label IS NOT NULL
      GROUP BY name, label ORDER BY fois DESC LIMIT 300`,

    prisma.$queryRaw<Array<{ depuis: Date | null }>>`
      SELECT min(at) AS depuis FROM "VisitEvent" WHERE kind IN ('sortie', 'event')`,

    lireVentesParProvenance(depuis),
  ])

  const tous = entonnoir.find((l) => l.device === 'tous')
  return {
    resume: resume[0] ?? { visites: 0, pages: 0, clics: 0 },
    duree: duree[0] ?? { mesurees: 0, msMedian: null, rebonds: 0 },
    entonnoir: tous ?? null,
    entonnoirParEcran: entonnoir.filter((l) => l.device !== 'tous'),
    pages,
    sorties,
    atterrissages,
    clics,
    recherches,
    sources,
    jours,
    evenements,
    precisions: regrouperPrecisions(precisions),
    mesureApprofondieDepuis: approfondie[0]?.depuis ?? null,
    ventes,
  }
}

/** Les cinq précisions les plus fréquentes de chaque geste. */
function regrouperPrecisions(lignes: Array<{ name: string; label: string; fois: number }>) {
  const parNom = new Map<string, Array<{ label: string; fois: number }>>()
  for (const l of lignes) {
    const liste = parNom.get(l.name) ?? []
    if (liste.length < 5) liste.push({ label: l.label, fois: l.fois })
    parNom.set(l.name, liste)
  }
  return Object.fromEntries(parNom)
}

/* -------------------------------------------------------------------------- */
/* Les ventes, par provenance                                                 */
/* -------------------------------------------------------------------------- */

export type VentesProvenance = {
  source: string
  commandes: number
  chiffreCents: number
  panierMoyenCents: number
}

/**
 * Chiffre d'affaires par provenance, lu dans les commandes elles-mêmes.
 *
 * Mêmes critères que le tableau de bord (lib/admin/metrics.ts) : commandes
 * payées à la date du paiement, paiements de test écartés. Ce chiffre ne
 * dépend ni de la mesure d'audience ni du consentement publicitaire : c'est
 * celui qu'il faut croire quand il contredit Google Ads.
 */
export async function lireVentesParProvenance(depuis: Date): Promise<VentesProvenance[]> {
  const lignes = await prisma.order.groupBy({
    by: ['source'],
    where: {
      paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
      placedAt: { gte: depuis },
      payments: { none: { status: 'PAID', isTestMode: true } },
    },
    _count: true,
    _sum: { totalCents: true },
  })
  return lignes
    .map((l) => ({
      source: l.source ?? 'inconnue (commande d’avant le 19 novembre 2026)',
      commandes: l._count,
      chiffreCents: l._sum.totalCents ?? 0,
      panierMoyenCents: l._count > 0 ? Math.round((l._sum.totalCents ?? 0) / l._count) : 0,
    }))
    .sort((a, b) => b.chiffreCents - a.chiffreCents)
}

/* -------------------------------------------------------------------------- */
/* Les visites, une par une                                                   */
/* -------------------------------------------------------------------------- */

export const FILTRES_VISITES = {
  toutes: 'Toutes',
  pub: 'Venues de la publicité Google',
  panier: 'Ont ajouté ou ouvert le panier',
  commande: 'Ont commencé la commande',
  gene: 'Ont rencontré une gêne',
  longues: 'Plus d’une minute',
  rebonds: 'Rebonds (une page, moins de 10 s)',
  detail: 'Enregistrées en détail (rejouables)',
} as const

export type FiltreVisites = keyof typeof FILTRES_VISITES

export type ResumeVisite = {
  visit: string
  debut: Date
  fin: Date
  source: string | null
  device: string | null
  largeur: number | null
  pages: number
  clics: number
  evenements: number
  ms: number | null
  ajout: boolean
  panier: boolean
  commande: boolean
  payee: boolean
  gene: boolean
  entree: string | null
  sortie: string | null
  points: number
}

const PAR_PAGE = 50

export async function listerVisites(
  p: Periode,
  filtre: FiltreVisites,
  ecran: Ecran | null,
  rang: number,
): Promise<{ visites: ResumeVisite[]; total: number; parPage: number }> {
  const { depuis } = p
  const condition = {
    toutes: Prisma.sql`TRUE`,
    pub: Prisma.sql`v.source = 'google (publicité)'`,
    panier: Prisma.sql`(v.ajout OR v.panier)`,
    commande: Prisma.sql`v.commande`,
    gene: Prisma.sql`v.gene`,
    longues: Prisma.sql`v.ms >= 60000`,
    rebonds: Prisma.sql`(v.ms IS NOT NULL AND v.pages <= 1 AND v.ms < 10000)`,
    detail: Prisma.sql`coalesce(tr.points, 0) > 0`,
  }[filtre]
  const surEcran = ecran ? Prisma.sql`AND v.device = ${ecran}` : Prisma.empty

  const base = Prisma.sql`
    WITH v AS (
      SELECT visit,
             min(at) AS debut, max(at) AS fin,
             max(source) AS source, max(device) AS device, max(w) AS largeur,
             count(*) FILTER (WHERE kind = 'page')::int AS pages,
             count(*) FILTER (WHERE kind = 'click')::int AS clics,
             count(*) FILTER (WHERE kind = 'event')::int AS evenements,
             sum(ms) FILTER (WHERE kind = 'sortie')::int AS ms,
             bool_or(${EST_AJOUT}) AS ajout,
             bool_or(${EST_PANIER}) AS panier,
             bool_or(${EST_COMMANDE}) AS commande,
             bool_or(${EST_PAYEE}) AS payee,
             bool_or(${EST_GENE}) AS gene
      FROM "VisitEvent" WHERE at >= ${depuis}
      GROUP BY visit
    ), entree AS (
      SELECT DISTINCT ON (visit) visit, path FROM "VisitEvent"
      WHERE at >= ${depuis} AND kind = 'page' ORDER BY visit, at
    ), sortie AS (
      SELECT DISTINCT ON (visit) visit, path FROM "VisitEvent"
      WHERE at >= ${depuis} AND kind = 'page' ORDER BY visit, at DESC
    ), tr AS (
      SELECT visit, count(*)::int AS points FROM "VisitTrace"
      WHERE at >= ${depuis} GROUP BY visit
    )`

  const [visites, compte] = await Promise.all([
    prisma.$queryRaw<ResumeVisite[]>`
      ${base}
      SELECT v.visit, v.debut, v.fin, v.source, v.device, v.largeur, v.pages, v.clics,
             v.evenements, v.ms, v.ajout, v.panier, v.commande, v.payee, v.gene,
             entree.path AS entree, sortie.path AS sortie, coalesce(tr.points, 0)::int AS points
      FROM v
      LEFT JOIN entree ON entree.visit = v.visit
      LEFT JOIN sortie ON sortie.visit = v.visit
      LEFT JOIN tr ON tr.visit = v.visit
      WHERE ${condition} ${surEcran}
      ORDER BY v.debut DESC
      LIMIT ${PAR_PAGE} OFFSET ${Math.max(0, rang) * PAR_PAGE}`,
    prisma.$queryRaw<Array<{ n: number }>>`
      ${base}
      SELECT count(*)::int AS n FROM v
      LEFT JOIN tr ON tr.visit = v.visit
      WHERE ${condition} ${surEcran}`,
  ])
  return { visites, total: compte[0]?.n ?? 0, parPage: PAR_PAGE }
}

export type GesteVisite = {
  id: string
  at: Date
  kind: string
  path: string
  target: string | null
  label: string | null
  zone: string | null
  query: string | null
  source: string | null
  device: string | null
  name: string | null
  value: number | null
  ms: number | null
  scroll: number | null
  x: number | null
  y: number | null
  w: number | null
  h: number | null
}

export type PointTrace = {
  at: Date
  path: string
  kind: string
  t: number
  x: number
  y: number
  w: number
  h: number
  doc: number
}

/** Tout ce qu'on sait d'une visite, dans l'ordre où cela s'est passé. */
export async function lireVisite(visit: string) {
  const [gestes, traces] = await Promise.all([
    prisma.visitEvent.findMany({
      where: { visit },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
      take: 5000,
    }),
    prisma.visitTrace.findMany({
      where: { visit },
      orderBy: [{ at: 'asc' }, { t: 'asc' }],
      select: { at: true, path: true, kind: true, t: true, x: true, y: true, w: true, h: true, doc: true },
      take: 50_000,
    }),
  ])
  return { gestes: gestes as GesteVisite[], traces: traces as PointTrace[] }
}

/* -------------------------------------------------------------------------- */
/* La carte des clics                                                         */
/* -------------------------------------------------------------------------- */

export type PointClic = {
  x: number
  y: number
  w: number
  kind: string
  name: string | null
  label: string | null
}

/** Les pages qui ont des clics positionnés, pour choisir laquelle afficher. */
export async function pagesAvecClics(p: Periode, ecran: Ecran) {
  const l = LARGEURS[ecran]
  return prisma.$queryRaw<Array<{ path: string; clics: number; visites: number }>>`
    SELECT path, count(*)::int AS clics, count(DISTINCT visit)::int AS visites
    FROM "VisitEvent"
    WHERE at >= ${p.depuis} AND x IS NOT NULL AND y IS NOT NULL
      AND w BETWEEN ${l.min} AND ${l.max}
      AND (kind = 'click' OR (kind = 'event' AND name IN ('clic-rage', 'clic-mort')))
    GROUP BY path ORDER BY clics DESC LIMIT 60`
}

/** Les clics d'une page, sur un écran, avec leur position. */
export async function lireCarteClics(p: Periode, path: string, ecran: Ecran) {
  const l = LARGEURS[ecran]
  const [points, profondeur] = await Promise.all([
    prisma.$queryRaw<PointClic[]>`
      SELECT x, y, w, kind, name, label FROM "VisitEvent"
      WHERE at >= ${p.depuis} AND path = ${path} AND x IS NOT NULL AND y IS NOT NULL
        AND w BETWEEN ${l.min} AND ${l.max}
        AND (kind = 'click' OR (kind = 'event' AND name IN ('clic-rage', 'clic-mort')))
      ORDER BY at DESC LIMIT 4000`,
    /*
      Jusqu'où les visiteurs de cette page sont descendus, par tranche de
      10 % : la « carte de défilement ». Elle dit si le bloc d'achat, la FAQ
      ou les avis sont seulement vus.
    */
    prisma.$queryRaw<Array<{ tranche: number; visites: number }>>`
      WITH s AS (
        SELECT visit, max(scroll) AS scroll FROM "VisitEvent"
        WHERE at >= ${p.depuis} AND path = ${path} AND kind = 'sortie'
          AND w BETWEEN ${l.min} AND ${l.max} AND scroll IS NOT NULL
        GROUP BY visit
      )
      SELECT t.tranche, count(s.visit)::int AS visites
      FROM generate_series(0, 100, 10) AS t(tranche)
      LEFT JOIN s ON s.scroll >= t.tranche
      GROUP BY t.tranche ORDER BY t.tranche`,
  ])
  return { points, profondeur }
}

/* -------------------------------------------------------------------------- */
/* Les paniers                                                                */
/* -------------------------------------------------------------------------- */

export type EtatPanier = 'actif' | 'abandonne' | 'commande'

/**
 * Les paniers qui contiennent quelque chose, du plus récent au plus ancien.
 *
 * Un panier n'est pas une personne : c'est un jeton dans un cookie, posé au
 * premier ajout. Il n'a de nom que si un client connecté l'a rempli. Les
 * autres restent des paniers sans visage — on sait ce qu'il y avait dedans,
 * pas qui l'a rempli, et c'est très bien ainsi.
 *
 * L'état est déduit, pas stocké :
 * - « commandé » si une commande a été créée depuis ce panier (`cartToken`) ;
 * - « actif » s'il a bougé depuis moins d'une heure ;
 * - « abandonné » sinon.
 */
export async function lirePaniers(p: Periode) {
  const paniers = await prisma.cart.findMany({
    where: { updatedAt: { gte: p.depuis }, lines: { some: {} } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      token: true,
      createdAt: true,
      updatedAt: true,
      promotionCode: true,
      user: { select: { email: true, firstName: true, lastName: true } },
      configuration: {
        select: {
          generation: {
            select: { name: true, model: { select: { name: true, make: { select: { name: true } } } } },
          },
        },
      },
      lines: {
        orderBy: { createdAt: 'asc' },
        select: {
          quantity: true,
          createdAt: true,
          variant: {
            select: {
              name: true,
              priceCents: true,
              product: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  })

  const commandes = await prisma.order.findMany({
    where: { cartToken: { in: paniers.map((c) => c.token) } },
    select: { cartToken: true, reference: true, paymentStatus: true, id: true },
  })
  const parJeton = new Map(commandes.map((o) => [o.cartToken, o]))
  const ilYaUneHeure = Date.now() - 3600 * 1000

  return paniers.map((c) => {
    const commande = parJeton.get(c.token) ?? null
    const totalCents = c.lines.reduce((s, l) => s + l.variant.priceCents * l.quantity, 0)
    const etat: EtatPanier = commande
      ? 'commande'
      : c.updatedAt.getTime() > ilYaUneHeure
        ? 'actif'
        : 'abandonne'
    const g = c.configuration?.generation
    return {
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      etat,
      totalCents,
      articles: c.lines.reduce((s, l) => s + l.quantity, 0),
      lignes: c.lines.map((l) => ({
        produit: l.variant.product.name,
        slug: l.variant.product.slug,
        variante: l.variant.name,
        quantite: l.quantity,
        prixCents: l.variant.priceCents,
      })),
      client: c.user
        ? {
            email: c.user.email,
            nom: [c.user.firstName, c.user.lastName].filter(Boolean).join(' ') || null,
          }
        : null,
      vehicule: g ? [g.model.make.name, g.model.name, g.name].join(' ') : null,
      promotionCode: c.promotionCode,
      commande: commande
        ? { id: commande.id, reference: commande.reference, paiement: commande.paymentStatus }
        : null,
    }
  })
}
