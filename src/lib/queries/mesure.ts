import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'

/**
 * Lecture de la mesure d'audience pour le back-office (/admin/statistiques).
 * Tout est compté en visites distinctes quand c'est possible : une personne
 * qui recharge dix fois sa fiche produit reste une visite.
 */

export type Periode = { jours: number; depuis: Date }

export function periode(jours: number): Periode {
  const j = [1, 7, 30, 90].includes(jours) ? jours : 7
  return { jours: j, depuis: new Date(Date.now() - j * 24 * 3600 * 1000) }
}

/** Les étapes de l'achat, reconnues aux pages visitées. */
const ETAPES: Array<{ cle: string; label: string; condition: Prisma.Sql }> = [
  { cle: 'visite', label: 'Visite du site', condition: Prisma.sql`TRUE` },
  {
    cle: 'vehicule',
    label: 'A choisi un véhicule ou ouvert une page véhicule',
    condition: Prisma.sql`(path LIKE '/vehicule/resultats%' OR path LIKE '/packs/%/%/%')`,
  },
  { cle: 'fiche', label: 'A ouvert une fiche produit', condition: Prisma.sql`path LIKE '/p/%'` },
  { cle: 'panier', label: 'A ouvert son panier', condition: Prisma.sql`path = '/panier'` },
  { cle: 'commande', label: 'A commencé la commande', condition: Prisma.sql`path = '/commande'` },
  {
    cle: 'confirmee',
    label: 'Commande payée',
    condition: Prisma.sql`path LIKE '/commande/%/confirmation'`,
  },
]

export async function lireStatistiques(p: Periode, page: string | null) {
  const { depuis } = p
  const [resume, etapes, pages, sorties, clics, recherches, sources, appareils, jours] = await Promise.all([
    prisma.$queryRaw<Array<{ visites: number; pages: number; clics: number }>>`
      SELECT count(DISTINCT visit)::int AS visites,
             count(*) FILTER (WHERE kind = 'page')::int AS pages,
             count(*) FILTER (WHERE kind = 'click')::int AS clics
      FROM "VisitEvent" WHERE at >= ${depuis}`,
    Promise.all(
      ETAPES.map(async (e) => {
        const [r] = await prisma.$queryRaw<Array<{ n: number }>>`
          SELECT count(DISTINCT visit)::int AS n FROM "VisitEvent"
          WHERE at >= ${depuis} AND kind = 'page' AND ${e.condition}`
        return { ...e, condition: undefined, visites: r?.n ?? 0 }
      }),
    ),
    prisma.$queryRaw<Array<{ path: string; vues: number; visites: number }>>`
      SELECT path, count(*)::int AS vues, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'page'
      GROUP BY path ORDER BY visites DESC LIMIT 40`,
    // La dernière page de chaque visite : là où les gens s'arrêtent.
    prisma.$queryRaw<Array<{ path: string; sorties: number }>>`
      SELECT path, count(*)::int AS sorties FROM (
        SELECT DISTINCT ON (visit) visit, path FROM "VisitEvent"
        WHERE at >= ${depuis} AND kind = 'page' ORDER BY visit, at DESC
      ) d GROUP BY path ORDER BY sorties DESC LIMIT 25`,
    prisma.$queryRaw<Array<{ zone: string | null; label: string | null; target: string | null; clics: number; visites: number }>>`
      SELECT zone, label, target, count(*)::int AS clics, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'click'
        ${page ? Prisma.sql`AND path = ${page}` : Prisma.empty}
      GROUP BY zone, label, target ORDER BY clics DESC LIMIT 80`,
    prisma.$queryRaw<Array<{ query: string; fois: number }>>`
      SELECT lower(query) AS query, count(DISTINCT visit)::int AS fois
      FROM "VisitEvent" WHERE at >= ${depuis} AND kind = 'page' AND query IS NOT NULL
      GROUP BY lower(query) ORDER BY fois DESC LIMIT 40`,
    prisma.$queryRaw<Array<{ source: string; visites: number }>>`
      SELECT source, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis} AND source IS NOT NULL
      GROUP BY source ORDER BY visites DESC LIMIT 20`,
    prisma.$queryRaw<Array<{ device: string; visites: number }>>`
      SELECT coalesce(device, 'inconnu') AS device, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis}
      GROUP BY 1 ORDER BY visites DESC`,
    prisma.$queryRaw<Array<{ jour: Date; visites: number }>>`
      SELECT date_trunc('day', at) AS jour, count(DISTINCT visit)::int AS visites
      FROM "VisitEvent" WHERE at >= ${depuis}
      GROUP BY 1 ORDER BY 1`,
  ])
  return {
    resume: resume[0] ?? { visites: 0, pages: 0, clics: 0 },
    etapes,
    pages,
    sorties,
    clics,
    recherches,
    sources,
    appareils,
    jours,
  }
}
