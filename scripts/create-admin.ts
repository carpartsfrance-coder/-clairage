/**
 * Création du premier compte d'administration.
 *
 * Aucun compte administrateur n'est créé par le seed, et aucun mot de passe par
 * défaut n'existe dans le dépôt : un identifiant public serait une porte
 * d'entrée connue de tous dès la mise en ligne.
 *
 * Le mot de passe est saisi ici, masqué, et seul son condensé scrypt est
 * conservé. On utilise scrypt du module `node:crypto` plutôt qu'une dépendance
 * : il est conçu pour le hachage de mots de passe, il est dans la bibliothèque
 * standard, et il n'ajoute rien à installer sur Render.
 *
 *   npx tsx scripts/create-admin.ts            → rôle ADMIN
 *   npx tsx scripts/create-admin.ts SUPPORT    → un autre rôle
 */
import { PrismaClient, type StaffRole } from '@prisma/client'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const prisma = new PrismaClient()

const ROLES: StaffRole[] = ['ADMIN', 'CATALOG_MANAGER', 'FULFILLMENT', 'SUPPORT', 'READ_ONLY']

/** Format stocké : scrypt$<sel hex>$<condensé hex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  // Comparaison à temps constant : une comparaison naïve fuite le préfixe commun.
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

function ask(question: string, masked = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (masked) {
      // On neutralise l'écho : le mot de passe ne doit pas rester à l'écran ni
      // dans l'historique du terminal.
      const output = process.stdout as NodeJS.WriteStream & { muted?: boolean }
      output.muted = false
      const originalWrite = output.write.bind(output)
      output.write = ((chunk: string, ...rest: unknown[]) =>
        output.muted ? true : originalWrite(chunk, ...(rest as []))) as typeof output.write
      rl.question(question, (answer) => {
        output.muted = false
        output.write = originalWrite
        process.stdout.write('\n')
        rl.close()
        resolve(answer)
      })
      output.muted = true
    } else {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer.trim())
      })
    }
  })
}

async function main() {
  const requested = (process.argv[2] ?? 'ADMIN').toUpperCase() as StaffRole
  if (!ROLES.includes(requested)) {
    console.error(`Rôle inconnu. Valeurs acceptées : ${ROLES.join(', ')}`)
    process.exitCode = 1
    return
  }

  const email = (await ask('Adresse e-mail : ')).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Adresse e-mail invalide.')
    process.exitCode = 1
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing?.staffRole) {
    console.error(`Ce compte existe déjà avec le rôle ${existing.staffRole}.`)
    process.exitCode = 1
    return
  }

  const password = await ask('Mot de passe (12 caractères minimum) : ', true)
  if (password.length < 12) {
    console.error('Mot de passe trop court.')
    process.exitCode = 1
    return
  }
  const confirmation = await ask('Confirmer le mot de passe : ', true)
  if (password !== confirmation) {
    console.error('Les deux saisies diffèrent.')
    process.exitCode = 1
    return
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, staffRole: requested, active: true },
    create: { email, passwordHash, staffRole: requested, active: true },
  })

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'staff.create',
      entity: 'User',
      entityId: user.id,
      after: { email, staffRole: requested },
    },
  })

  console.log(`Compte ${requested} créé pour ${email}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
