import 'server-only'
import { redirect } from 'next/navigation'
import type { Prisma, StaffRole } from '@prisma/client'
import { prisma } from '../db'
import { getCurrentUser } from '../auth/session'
import { callerIp } from '../auth/throttle'
import { can, type Permission } from './permissions'

/**
 * Garde d'accès du back-office.
 *
 * Toute page et toute action d'administration commence par `requireStaff`. Le
 * contrôle est fait au moment du rendu côté serveur : masquer un bouton ne
 * protège rien, puisque l'action reste atteignable par une requête directe.
 *
 * C'est pour cela que les actions appellent elles aussi `requireStaff`, même
 * quand la page qui les affiche l'a déjà fait. Une action de serveur est un
 * point d'entrée public.
 */

export type StaffUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: StaffRole
}

/** Membre de l'équipe connecté, ou null. */
export async function getStaffUser(): Promise<StaffUser | null> {
  const user = await getCurrentUser()
  if (!user?.staffRole) return null
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.staffRole,
  }
}

/**
 * Exige un membre de l'équipe, et le droit demandé.
 *
 * Un client connecté qui tombe sur /admin est renvoyé à l'accueil, pas à la
 * page de connexion : il est déjà identifié, lui redemander ses identifiants
 * laisserait croire qu'un autre compte lui ouvrirait la porte.
 */
export async function requireStaff(permission: Permission): Promise<StaffUser> {
  const staff = await getStaffUser()

  if (!staff) {
    const user = await getCurrentUser()
    redirect(user ? '/' : '/connexion?next=/admin')
    throw new Error('unreachable')
  }

  if (!can(staff.role, permission)) {
    // On trace : une tentative d'accès hors droits est une information utile,
    // qu'elle vienne d'une erreur de navigation ou d'autre chose.
    await audit(staff, 'access.denied', 'Permission', permission, null, null).catch(() => {})
    redirect('/admin?refus=' + encodeURIComponent(permission))
    throw new Error('unreachable')
  }

  return staff
}

/**
 * Journalise une action d'administration.
 *
 * Le brief demande que les actions importantes soient traçables. On enregistre
 * l'état avant et après quand il est connu : sans l'avant, un journal ne permet
 * pas de comprendre ce qui a changé, seulement que quelque chose a changé.
 */
export async function audit(
  staff: StaffUser,
  action: string,
  entity: string,
  entityId: string | null,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: staff.id,
        action,
        entity,
        entityId,
        before: before ?? undefined,
        after: after ?? undefined,
        ip: await callerIp(),
      },
    })
  } catch (error) {
    // Un échec de journalisation ne doit pas annuler l'action elle-même, mais
    // il doit se voir dans les journaux du serveur.
    console.error('[admin] journalisation impossible', error)
  }
}

/** Nom affichable d'un membre de l'équipe. */
export function staffName(staff: StaffUser): string {
  const full = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim()
  return full || staff.email
}
