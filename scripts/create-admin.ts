/**
 * Création du premier compte d'administration.
 *
 * Aucun compte administrateur n'est créé par le seed, et aucun mot de passe par
 * défaut n'existe dans le dépôt : un identifiant public serait une porte
 * d'entrée connue de tous dès la mise en ligne.
 *
 * Le mot de passe est saisi ici, masqué, et seul son condensé est conservé.
 * Le hachage vient de `src/lib/auth/password.ts`, le même que pour les clients
 * — dupliquer l'implémentation ici produirait un format différent, et un
 * administrateur créé par ce script ne pourrait plus se connecter.
 *
 *   npx tsx scripts/create-admin.ts            → rôle ADMIN
 *   npx tsx scripts/create-admin.ts SUPPORT    → un autre rôle
 */
import { PrismaClient, type StaffRole } from '@prisma/client'
import { createInterface } from 'node:readline'
import { PASSWORD_MIN_LENGTH, hashPassword, passwordProblem } from '../src/lib/auth/password'

const prisma = new PrismaClient()

const ROLES: StaffRole[] = ['ADMIN', 'CATALOG_MANAGER', 'FULFILLMENT', 'SUPPORT', 'READ_ONLY']

/**
 * Lecture des réponses.
 *
 * Deux modes, parce qu'ils n'ont pas les mêmes contraintes :
 *
 * - **Terminal** : readline, avec l'écho neutralisé pour le mot de passe, afin
 *   qu'il ne reste ni à l'écran ni dans l'historique.
 * - **Entrée redirigée** (script, CI, conteneur sans TTY) : on lit tout le flux
 *   d'un coup et on sert les réponses dans l'ordre. readline ferme l'interface
 *   dès la fin du flux, ce qui fait échouer les questions suivantes avec
 *   ERR_USE_AFTER_CLOSE ; et il n'y a de toute façon pas d'écran à protéger.
 */
const interactive = process.stdin.isTTY === true

let piped: string[] = []
let pipedIndex = 0

async function readAllInput(): Promise<string[]> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
}

const rl = interactive
  ? createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  : null

function ask(question: string, masked = false): Promise<string> {
  if (!rl) {
    process.stdout.write(question + '\n')
    return Promise.resolve((piped[pipedIndex++] ?? '').trim())
  }

  return new Promise((resolve) => {
    if (masked) {
      const output = process.stdout as NodeJS.WriteStream & { muted?: boolean }
      output.muted = false
      const originalWrite = output.write.bind(output)
      output.write = ((chunk: string, ...rest: unknown[]) =>
        output.muted ? true : originalWrite(chunk, ...(rest as []))) as typeof output.write
      rl.question(question, (answer) => {
        output.muted = false
        output.write = originalWrite
        process.stdout.write('\n')
        resolve(answer)
      })
      output.muted = true
    } else {
      rl.question(question, (answer) => resolve(answer.trim()))
    }
  })
}

async function main() {
  if (!interactive) piped = await readAllInput()

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

  const password = await ask(`Mot de passe (${PASSWORD_MIN_LENGTH} caractères minimum) : `, true)
  // Mêmes règles que pour un client : un compte d'administration n'a aucune
  // raison d'avoir un mot de passe plus faible, au contraire.
  const problem = passwordProblem(password, email)
  if (problem) {
    console.error(problem)
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
  .finally(() => {
    rl?.close()
    return prisma.$disconnect()
  })
