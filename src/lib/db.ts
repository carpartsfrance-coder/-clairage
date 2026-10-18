import { PrismaClient } from '@prisma/client'
import 'server-only'

/**
 * Client Prisma unique. En développement, Next recharge les modules à chaque
 * édition : sans ce cache global on ouvrirait une connexion par rechargement
 * jusqu'à saturer le pool PostgreSQL.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
