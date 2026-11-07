import { PrismaClient } from '@prisma/client'
import 'server-only'

/**
 * Client Prisma unique. En développement, Next recharge les modules à chaque
 * édition : sans ce cache global on ouvrirait une connexion par rechargement
 * jusqu'à saturer le pool PostgreSQL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Taille du pool de connexions, quand l'adresse de la base n'en fixe pas.
 *
 * Par défaut, Prisma ouvre jusqu'à « deux fois le nombre de cœurs + 1 »
 * connexions par processus. Sur une machine de build Render, c'est près d'une
 * centaine par processus, et la base (offre basic-256mb) n'en accepte pas
 * autant : elle coupe les connexions et le build échoue (7 novembre 2026). Dix
 * suffisent largement à un processus ; un `connection_limit` écrit dans
 * DATABASE_URL reste prioritaire.
 */
export function avecLimiteDeConnexions(url: string | undefined, limite = 10): string | undefined {
  if (!url) return url
  try {
    const adresse = new URL(url)
    if (!adresse.searchParams.has('connection_limit')) {
      adresse.searchParams.set('connection_limit', String(limite))
    }
    return adresse.toString()
  } catch {
    return url
  }
}

/**
 * Pendant le build, deux connexions par processus suffisent : quelques pages
 * seulement sont pré-rendues, et la base sert en même temps le site en ligne.
 */
const LIMITE = process.env.NEXT_PHASE === 'phase-production-build' ? 2 : 10

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: avecLimiteDeConnexions(process.env.DATABASE_URL, LIMITE),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
