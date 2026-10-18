import 'server-only'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'node:crypto'
import type { StaffRole } from '@prisma/client'
import { prisma } from '../db'

/**
 * Sessions.
 *
 * Le cookie porte un jeton aléatoire de 32 octets ; la base n'en stocke que le
 * condensé SHA-256. Une copie de la table ne permet donc pas de se connecter —
 * ce qui est tout l'intérêt par rapport à un identifiant de session stocké en
 * clair.
 *
 * SHA-256 suffit ici, contrairement aux mots de passe : le jeton est déjà
 * aléatoire et long, il n'y a rien à deviner par force brute.
 */

export const SESSION_COOKIE = 'lumera_session'
const SESSION_DAYS = 30

export type CurrentUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  staffRole: StaffRole | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  userId: string,
  context: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: context.userAgent?.slice(0, 255) ?? null,
      ip: context.ip ?? null,
      expiresAt,
    },
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

/**
 * Utilisateur de la requête en cours, ou null.
 *
 * Une session expirée ou révoquée ne renvoie rien : le filtre est en base, pas
 * dans le code appelant, pour qu'aucune page ne puisse l'oublier.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt < new Date() ||
      !session.user.active
    ) {
      return null
    }

    return {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      staffRole: session.user.staffRole,
    }
  } catch (error) {
    console.error('[session] lecture impossible', error)
    return null
  }
}

/** Révoque la session courante et efface le cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    try {
      // On révoque plutôt que de supprimer : la ligne reste pour l'audit.
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    } catch (error) {
      console.error('[session] révocation impossible', error)
    }
  }

  store.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
}

/**
 * Révoque toutes les sessions d'un utilisateur.
 * Appelée après un changement de mot de passe : une réinitialisation doit
 * déconnecter l'éventuel intrus, sinon elle ne sert à rien.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Utilisateur courant, ou redirection vers la connexion.
 *
 * `redirect` lève une exception que Next intercepte : TypeScript ne le sait pas
 * d'un import dynamique, d'où le `never` explicite. Toute page de l'espace
 * client commence par cet appel — le contrôle d'accès est côté serveur, jamais
 * dans un composant client qui se contenterait de masquer l'affichage.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) {
    const { redirect } = await import('next/navigation')
    redirect('/connexion')
    throw new Error('unreachable')
  }
  return user
}
