import type { PrismaClient } from '@prisma/client'

/**
 * Effacement automatique des données dont la durée de conservation est
 * écoulée — ce que promet la page « Confidentialité » (article 6).
 *
 * Ne touche qu'aux données de courte durée, sans valeur une fois périmées :
 *
 * | Donnée                                   | Effacée                              |
 * |------------------------------------------|--------------------------------------|
 * | Sessions de connexion                    | à leur expiration ou révocation      |
 * | Adresse IP et navigateur (sessions)      | après 30 jours                       |
 * | Adresse IP du journal d'administration   | après 30 jours (l'entrée reste)      |
 * | Liens de mot de passe oublié             | 1 jour après leur expiration         |
 * | Paniers abandonnés                       | à leur expiration (cookie de 30 j)   |
 * | Alertes de retour en stock               | 30 jours après l'envoi ou le retrait |
 * | Compteurs anti-abus                      | 1 jour après leur fenêtre            |
 *
 * Les commandes, factures, comptes et demandes de contact ont des durées de
 * plusieurs années : leur effacement sera ajouté avant la première échéance
 * (novembre 2029), avec les exceptions légales (factures : 10 ans).
 *
 * Lancé par `instrumentation.ts`, quelques minutes après le démarrage puis
 * toutes les six heures. Chaque effacement est idempotent : deux instances qui
 * le lancent en même temps ne se gênent pas.
 */

const JOUR = 24 * 60 * 60 * 1000

export function seuilsDePurge(maintenant: Date) {
  return {
    maintenant,
    ilYaUnJour: new Date(maintenant.getTime() - JOUR),
    ilYa30Jours: new Date(maintenant.getTime() - 30 * JOUR),
    ilYa60Jours: new Date(maintenant.getTime() - 60 * JOUR),
  }
}

export async function purgerDonnees(
  prisma: PrismaClient,
  maintenant = new Date(),
): Promise<Record<string, number>> {
  const s = seuilsDePurge(maintenant)
  const bilan: Record<string, number> = {}

  // Mesure d'audience : 13 mois au plus (recommandation de la CNIL).
  bilan.mesure = (
    await prisma.visitEvent.deleteMany({
      where: { at: { lt: new Date(s.maintenant.getTime() - 395 * 24 * 3600 * 1000) } },
    })
  ).count

  bilan.sessions = (
    await prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: s.maintenant } }, { revokedAt: { lt: s.ilYaUnJour } }] },
    })
  ).count

  bilan.ipSessions = (
    await prisma.session.updateMany({
      where: {
        createdAt: { lt: s.ilYa30Jours },
        OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
      },
      data: { ip: null, userAgent: null },
    })
  ).count

  bilan.ipJournal = (
    await prisma.auditLog.updateMany({
      where: { createdAt: { lt: s.ilYa30Jours }, ip: { not: null } },
      data: { ip: null },
    })
  ).count

  bilan.motsDePasse = (
    await prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: s.ilYaUnJour } } })
  ).count

  // Le cookie du panier vit 30 jours et n'est posé qu'à la création : passé
  // `expiresAt`, plus personne ne peut rouvrir ce panier. Un panier sans date
  // (créé avant qu'elle existe) part après 60 jours sans mouvement.
  bilan.paniers = (
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: s.maintenant } },
          { expiresAt: null, updatedAt: { lt: s.ilYa60Jours } },
        ],
      },
    })
  ).count

  bilan.alertesStock = (
    await prisma.stockAlert.deleteMany({
      where: {
        OR: [{ notifiedAt: { lt: s.ilYa30Jours } }, { cancelledAt: { lt: s.ilYa30Jours } }],
      },
    })
  ).count

  bilan.compteurs = (
    await prisma.rateLimit.deleteMany({
      where: {
        windowStart: { lt: s.ilYaUnJour },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: s.maintenant } }],
      },
    })
  ).count

  return bilan
}
