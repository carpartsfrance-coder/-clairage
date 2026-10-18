'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db'
import { hashPassword, passwordProblem, verifyPassword } from '../auth/password'
import {
  createSession,
  destroySession,
  getCurrentUser,
  revokeAllSessions,
} from '../auth/session'
import { callerIp, clearThrottle, throttle, throttleMessage } from '../auth/throttle'
import { sendEmail } from '../email'
import { identity, siteConfig } from '../identity'
import { buildSafeNext } from '../auth/safe-next'

/**
 * Authentification.
 *
 * Trois règles traversent ce fichier :
 *
 * 1. **Ne jamais révéler si une adresse existe** — pour la connexion et la
 *    récupération d'accès, qui renvoient le même message et le même temps de
 *    réponse dans tous les cas.
 *
 *    L'inscription fait exception, et c'est un arbitrage assumé, pas un oubli :
 *    une adresse libre crée le compte, ouvre la session et redirige vers
 *    /compte, tandis qu'une adresse déjà prise reste sur la page avec un
 *    message neutre. Les deux cas sont donc distinguables. Les rendre
 *    identiques imposerait de ne plus connecter automatiquement à
 *    l'inscription et d'attendre une activation par e-mail — ce qui suppose
 *    d'abord la vérification des adresses, qui n'existe pas encore. Tant
 *    qu'elle manque, l'inscription reste énumérable, et c'est écrit dans la
 *    matrice de réception plutôt que passé sous silence.
 * 2. **Le temps de réponse ne doit pas trahir non plus.** Sur une adresse
 *    inconnue, on calcule tout de même un hachage : sans cela, un échec
 *    instantané distinguerait « compte inexistant » de « mauvais mot de passe ».
 * 3. **Tout est limité en fréquence**, par IP et par cible.
 */

export type AuthState = {
  error?: string
  /** Message neutre affiché même en cas d'échec silencieux. */
  notice?: string
  fieldErrors?: Record<string, string>
}

const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(190)

/** Condensé d'un jeton à usage unique (réinitialisation). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function requestContext() {
  const requestHeaders = await headers()
  return {
    userAgent: requestHeaders.get('user-agent'),
    ip: await callerIp(),
  }
}

/* -------------------------------------------------------------------------- */
/* Inscription                                                                */
/* -------------------------------------------------------------------------- */

const registerSchema = z.object({
  email: emailSchema,
  password: z.string(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
})

export async function register(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    firstName: formData.get('firstName') || undefined,
    lastName: formData.get('lastName') || undefined,
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Certaines informations sont incomplètes.', fieldErrors }
  }

  const { email, password, firstName, lastName } = parsed.data

  const problem = passwordProblem(password, email)
  if (problem) return { error: problem, fieldErrors: { password: problem } }

  const limit = await throttle('register', email)
  if (!limit.allowed) return { error: throttleMessage(limit.retryAfterSeconds) }

  const passwordHash = await hashPassword(password)

  try {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      // L'adresse est déjà prise. On ne le dit pas en toutes lettres, et on
      // prévient son propriétaire légitime. Cela limite la casse sans la
      // supprimer : voir la note sur l'énumération en tête de fichier.
      await sendEmail({
        template: 'compte.bienvenue',
        to: email,
        subject: `${identity.name} — vous avez déjà un compte`,
        // Pas de jeton ici : c'est une invitation à demander une réinitialisation.
        variables: { resetUrl: `${siteConfig.url}/mot-de-passe-oublie` },
      }).catch((error) => console.error('[auth] e-mail compte existant', error))

      return {
        notice:
          'Si cette adresse peut être utilisée, vous allez recevoir un e-mail. Vérifiez votre boîte de réception.',
      }
    }

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName: firstName || null, lastName: lastName || null },
    })

    await sendEmail({
      template: 'compte.bienvenue',
      to: email,
      subject: `${identity.name} — bienvenue`,
      variables: { firstName: firstName ?? null },
    }).catch((error) => console.error('[auth] e-mail de bienvenue', error))

    const context = await requestContext()
    await createSession(user.id, context)
    await clearThrottle('register', email)
  } catch (error) {
    console.error('[auth] inscription impossible', error)
    return { error: "La création du compte n'a pas abouti. Réessayez dans un instant." }
  }

  redirect('/compte')
}

/* -------------------------------------------------------------------------- */
/* Connexion                                                                  */
/* -------------------------------------------------------------------------- */

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis').max(200),
  /** Chemin interne vers lequel revenir après connexion. */
  next: z.string().optional(),
})

/** Voir src/lib/auth/safe-next.ts : la logique y est isolée pour être testée. */
function safeNext(value: string | undefined): string {
  return buildSafeNext(value, siteConfig.url)
}

const MAX_FAILED_LOGINS = 10
const LOCK_MINUTES = 15

export async function login(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  })

  if (!parsed.success) {
    return { error: 'Adresse e-mail ou mot de passe incorrect.' }
  }

  const { email, password } = parsed.data
  const destination = safeNext(parsed.data.next)

  const limit = await throttle('login', email)
  if (!limit.allowed) return { error: throttleMessage(limit.retryAfterSeconds) }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.passwordHash) {
      // Hachage à vide : le temps de réponse d'une adresse inconnue doit
      // ressembler à celui d'un mauvais mot de passe.
      await hashPassword(password)
      return { error: 'Adresse e-mail ou mot de passe incorrect.' }
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
      return {
        error: `Ce compte est temporairement bloqué après trop d'essais. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      }
    }

    const valid = await verifyPassword(password, user.passwordHash)

    if (!valid) {
      const failedLogins = user.failedLogins + 1
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins,
          lockedUntil:
            failedLogins >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      })
      return { error: 'Adresse e-mail ou mot de passe incorrect.' }
    }

    if (!user.active) {
      // Compte désactivé : même message, pour ne pas confirmer son existence.
      return { error: 'Adresse e-mail ou mot de passe incorrect.' }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    })

    const context = await requestContext()
    await createSession(user.id, context)
    await clearThrottle('login', email)
  } catch (error) {
    console.error('[auth] connexion impossible', error)
    return { error: 'La connexion a échoué. Réessayez dans un instant.' }
  }

  redirect(destination)
}

/* -------------------------------------------------------------------------- */
/* Déconnexion                                                                */
/* -------------------------------------------------------------------------- */

export async function logout() {
  await destroySession()
  redirect('/')
}

/* -------------------------------------------------------------------------- */
/* Récupération d'accès                                                       */
/* -------------------------------------------------------------------------- */

const RESET_TTL_MINUTES = 60

export async function requestPasswordReset(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get('email'))

  // Message unique, y compris sur une adresse mal formée : la page ne doit
  // jamais permettre de tester l'existence d'un compte.
  const neutral: AuthState = {
    notice:
      "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé. Le lien est valable une heure.",
  }

  if (!parsed.success) return neutral

  const email = parsed.data
  const limit = await throttle('passwordReset', email)
  if (!limit.allowed) return { error: throttleMessage(limit.retryAfterSeconds) }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) return neutral

    const token = randomBytes(32).toString('base64url')
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    })

    await sendEmail({
      template: 'compte.reinitialisation',
      to: email,
      subject: `${identity.name} — réinitialiser votre mot de passe`,
      variables: { expiresInMinutes: RESET_TTL_MINUTES },
      // Le lien porte le jeton : il part dans `secrets`, jamais dans `variables`,
      // pour ne pas se retrouver en clair dans EmailLog.
      secrets: { resetUrl: `${siteConfig.url}/mot-de-passe-oublie/${token}` },
    })
  } catch (error) {
    console.error('[auth] demande de réinitialisation impossible', error)
  }

  return neutral
}

const resetSchema = z.object({
  token: z.string().trim().min(10),
  password: z.string(),
})

export async function resetPassword(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'Lien de réinitialisation invalide.' }

  const { token, password } = parsed.data

  try {
    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })

    if (!reset || reset.usedAt !== null || reset.expiresAt < new Date()) {
      return {
        error:
          'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau depuis la page de récupération.',
      }
    }

    const problem = passwordProblem(password, reset.user.email)
    if (problem) return { error: problem, fieldErrors: { password: problem } }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, failedLogins: 0, lockedUntil: null },
      })
      // Un jeton ne sert qu'une fois, et les autres demandes en cours tombent :
      // sinon un lien intercepté resterait utilisable après coup.
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      })
    })

    // Toutes les sessions tombent : réinitialiser sans déconnecter l'intrus
    // éventuel ne servirait à rien.
    await revokeAllSessions(reset.userId)
  } catch (error) {
    console.error('[auth] réinitialisation impossible', error)
    return { error: "La réinitialisation n'a pas abouti. Réessayez dans un instant." }
  }

  redirect('/connexion?reinitialise=1')
}

/* -------------------------------------------------------------------------- */
/* Profil                                                                     */
/* -------------------------------------------------------------------------- */

const profileSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(32).optional(),
})

export async function updateProfile(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Vous devez être connecté.' }

  const parsed = profileSchema.safeParse({
    firstName: formData.get('firstName') || undefined,
    lastName: formData.get('lastName') || undefined,
    phone: formData.get('phone') || undefined,
  })
  if (!parsed.success) return { error: 'Certaines informations sont invalides.' }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: parsed.data.firstName || null,
        lastName: parsed.data.lastName || null,
        phone: parsed.data.phone || null,
      },
    })
    return { notice: 'Vos informations ont été enregistrées.' }
  } catch (error) {
    console.error('[auth] mise à jour du profil impossible', error)
    return { error: "L'enregistrement n'a pas abouti." }
  }
}

const changePasswordSchema = z.object({
  current: z.string().min(1),
  next: z.string(),
})

export async function changePassword(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const current = await getCurrentUser()
  if (!current) return { error: 'Vous devez être connecté.' }

  const parsed = changePasswordSchema.safeParse({
    current: formData.get('current'),
    next: formData.get('next'),
  })
  if (!parsed.success) return { error: 'Renseignez les deux mots de passe.' }

  const problem = passwordProblem(parsed.data.next, current.email)
  if (problem) return { error: problem, fieldErrors: { next: problem } }

  try {
    const user = await prisma.user.findUnique({ where: { id: current.id } })
    if (!user?.passwordHash) return { error: 'Mot de passe actuel incorrect.' }

    if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
      return { error: 'Mot de passe actuel incorrect.' }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.next) },
    })

    // On révoque tout, puis on recrée une session pour l'appareil courant :
    // changer son mot de passe doit déconnecter les autres appareils.
    await revokeAllSessions(user.id)
    await createSession(user.id, await requestContext())

    return { notice: 'Mot de passe modifié. Les autres appareils ont été déconnectés.' }
  } catch (error) {
    console.error('[auth] changement de mot de passe impossible', error)
    return { error: "La modification n'a pas abouti." }
  }
}
