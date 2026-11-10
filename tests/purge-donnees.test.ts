import { describe, expect, it, vi } from 'vitest'
import { purgerDonnees, seuilsDePurge } from '../src/lib/purge-donnees'

describe('purge des données périmées', () => {
  it('calcule les seuils à partir de maintenant', () => {
    const s = seuilsDePurge(new Date('2026-11-30T12:00:00Z'))
    expect(s.ilYaUnJour.toISOString()).toBe('2026-11-29T12:00:00.000Z')
    expect(s.ilYa30Jours.toISOString()).toBe('2026-10-31T12:00:00.000Z')
    expect(s.ilYa60Jours.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })

  it("n'efface que des données périmées, et rend le bilan", async () => {
    const appel = (count: number) => vi.fn().mockResolvedValue({ count })
    const prisma = {
      session: { deleteMany: appel(2), updateMany: appel(1) },
      auditLog: { updateMany: appel(3) },
      passwordReset: { deleteMany: appel(0) },
      cart: { deleteMany: appel(5) },
      stockAlert: { deleteMany: appel(0) },
      rateLimit: { deleteMany: appel(4) },
      visitEvent: { deleteMany: appel(6) },
    }
    const maintenant = new Date('2026-11-30T12:00:00Z')
    const bilan = await purgerDonnees(prisma as never, maintenant)
    expect(bilan).toEqual({ mesure: 6, sessions: 2, ipSessions: 1, ipJournal: 3, motsDePasse: 0, paniers: 5, alertesStock: 0, compteurs: 4 })
    // Le journal d'administration garde ses lignes : seule l'adresse IP part.
    expect(prisma.auditLog.updateMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-10-31T12:00:00Z') }, ip: { not: null } },
      data: { ip: null },
    })
    // Un panier encore valide n'est jamais visé.
    const panier = prisma.cart.deleteMany.mock.calls[0][0]
    expect(panier.where.OR[0]).toEqual({ expiresAt: { lt: maintenant } })
  })
})
