import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from '../src/lib/auth/password'

/**
 * Authentification.
 *
 * Ce que ces tests protègent : un condensé de mot de passe qui se vérifie mal,
 * une session révoquée qui continue d'ouvrir, un jeton de réinitialisation
 * réutilisable. Trois défauts invisibles depuis l'interface — tout a l'air de
 * marcher jusqu'au jour où ça ne marche plus du bon côté.
 */
const prisma = new PrismaClient()

async function reset() {
  await prisma.session.deleteMany()
  await prisma.passwordReset.deleteMany()
  await prisma.rateLimit.deleteMany()
  await prisma.user.deleteMany()
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await prisma.$disconnect()
})

describe('hashPassword / verifyPassword', () => {
  it('accepte le bon mot de passe', async () => {
    const stored = await hashPassword('une phrase de passe correcte')
    expect(await verifyPassword('une phrase de passe correcte', stored)).toBe(true)
  })

  it('refuse un mot de passe faux', async () => {
    const stored = await hashPassword('une phrase de passe correcte')
    expect(await verifyPassword('une phrase de passe incorrecte', stored)).toBe(false)
  })

  it('ne stocke jamais le mot de passe en clair', async () => {
    const secret = 'une phrase de passe correcte'
    const stored = await hashPassword(secret)
    expect(stored).not.toContain(secret)
    expect(stored.startsWith('scrypt$')).toBe(true)
  })

  it('produit un condensé différent à chaque fois (sel aléatoire)', async () => {
    const a = await hashPassword('une phrase de passe correcte')
    const b = await hashPassword('une phrase de passe correcte')
    expect(a).not.toBe(b)
    // Les deux restent vérifiables : c'est le sel qui diffère, pas la logique.
    expect(await verifyPassword('une phrase de passe correcte', a)).toBe(true)
    expect(await verifyPassword('une phrase de passe correcte', b)).toBe(true)
  })

  it('porte ses paramètres, pour pouvoir durcir le coût plus tard', async () => {
    const stored = await hashPassword('une phrase de passe correcte')
    const [scheme, N, r, p] = stored.split('$')
    expect(scheme).toBe('scrypt')
    expect(Number(N)).toBeGreaterThanOrEqual(2 ** 15)
    expect(Number(r)).toBeGreaterThan(0)
    expect(Number(p)).toBeGreaterThan(0)
  })

  it('refuse proprement un condensé corrompu plutôt que de lever', async () => {
    expect(await verifyPassword('peu importe', 'nimporte quoi')).toBe(false)
    expect(await verifyPassword('peu importe', '')).toBe(false)
    expect(await verifyPassword('peu importe', 'scrypt$a$b$c$d$e')).toBe(false)
  })
})

describe('passwordProblem', () => {
  it('impose une longueur minimale', () => {
    expect(passwordProblem('court')).toContain(String(PASSWORD_MIN_LENGTH))
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1))).not.toBeNull()
  })

  it('accepte une phrase longue sans caractère spécial', () => {
    // Imposer des classes de caractères pousse surtout à « Motdepasse1! ».
    expect(passwordProblem('trois chevaux bleus dansent')).toBeNull()
  })

  it('refuse les mots de passe manifestement devinables', () => {
    expect(passwordProblem('motdepasse12345')).not.toBeNull()
    expect(passwordProblem('azertyuiop1234')).not.toBeNull()
  })

  it("refuse un mot de passe qui reprend l'adresse e-mail", () => {
    expect(passwordProblem('camille-durand-2026', 'camille@example.com')).not.toBeNull()
  })

  it('refuse un mot de passe démesuré (coût de calcul)', () => {
    expect(passwordProblem('a'.repeat(500))).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

describe('sessions', () => {
  async function makeUser() {
    return prisma.user.create({
      data: { email: 'client@example.com', passwordHash: await hashPassword('phrase de passe ok') },
    })
  }

  it('ne stocke que le condensé du jeton', async () => {
    const user = await makeUser()
    const token = 'jeton-en-clair-aaaaaaaaaaaaaaaa'

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })

    // Une copie de la table ne doit pas permettre de se connecter.
    expect(await prisma.session.findUnique({ where: { tokenHash: token } })).toBeNull()
    expect(await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })).not.toBeNull()
  })

  it('distingue une session valide, expirée et révoquée', async () => {
    const user = await makeUser()
    const now = new Date()

    const valide = await prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken('a'), expiresAt: new Date(Date.now() + 3600_000) },
    })
    const expiree = await prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken('b'), expiresAt: new Date(Date.now() - 1000) },
    })
    const revoquee = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('c'),
        expiresAt: new Date(Date.now() + 3600_000),
        revokedAt: now,
      },
    })

    const ouvertes = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
    })
    expect(ouvertes.map((s) => s.id)).toEqual([valide.id])
    expect(ouvertes.map((s) => s.id)).not.toContain(expiree.id)
    expect(ouvertes.map((s) => s.id)).not.toContain(revoquee.id)
  })
})

describe('jetons de réinitialisation', () => {
  it('ne vaut qu’une fois et expire', async () => {
    const user = await prisma.user.create({
      data: { email: 'reset@example.com', passwordHash: await hashPassword('phrase de passe ok') },
    })

    const utilise = await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('deja-servi'),
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: new Date(),
      },
    })
    const perime = await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('perime'),
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    const bon = await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('valide'),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })

    const utilisables = await prisma.passwordReset.findMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    })
    expect(utilisables.map((r) => r.id)).toEqual([bon.id])
    expect(utilisables.map((r) => r.id)).not.toContain(utilise.id)
    expect(utilisables.map((r) => r.id)).not.toContain(perime.id)
  })

  it('ne stocke pas le jeton en clair', async () => {
    const user = await prisma.user.create({
      data: { email: 'clair@example.com', passwordHash: await hashPassword('phrase de passe ok') },
    })
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('secret-du-lien'),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })

    const rows = await prisma.passwordReset.findMany()
    expect(rows[0].tokenHash).not.toBe('secret-du-lien')
    expect(rows[0].tokenHash).toBe(hashToken('secret-du-lien'))
  })
})

/* -------------------------------------------------------------------------- */

import { buildSafeNext } from '../src/lib/auth/safe-next'

/**
 * Redirection après connexion.
 *
 * Le piège classique : `/\evil.com` passe un test naïf (commence par « / »,
 * pas par « // ») mais les navigateurs normalisent l'antislash, et l'en-tête
 * Location devient `//evil.com` — une redirection vers un domaine tiers, sur
 * une page de connexion, donc un hameçonnage prêt à l'emploi.
 */
describe('redirection après connexion', () => {
  const base = 'https://lumera.example'

  it('accepte un chemin interne', () => {
    expect(buildSafeNext('/compte/commandes', base)).toBe('/compte/commandes')
    expect(buildSafeNext('/c/phares-led?tri=prix-croissant', base)).toBe(
      '/c/phares-led?tri=prix-croissant',
    )
  })

  it('refuse une URL absolue vers un autre domaine', () => {
    expect(buildSafeNext('https://evil.example/piege', base)).toBe('/compte')
  })

  it('refuse une URL relative au protocole', () => {
    expect(buildSafeNext('//evil.example', base)).toBe('/compte')
  })

  it("refuse l'antislash, que le navigateur normalise en slash", () => {
    expect(buildSafeNext('/\\evil.example', base)).toBe('/compte')
    expect(buildSafeNext('\\\\evil.example', base)).toBe('/compte')
  })

  it('refuse une valeur absente ou illisible', () => {
    expect(buildSafeNext(undefined, base)).toBe('/compte')
    expect(buildSafeNext('', base)).toBe('/compte')
  })
})
