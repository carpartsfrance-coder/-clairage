/**
 * Dépilage de la file de travaux (JobQueue).
 *
 * Lancé par le cron Render toutes les dix minutes. Il prend un lot, traite
 * chaque entrée, et repart. Trois garde-fous :
 *   - verrouillage par `lockedAt` / `lockedBy`, pour qu'une exécution qui
 *     déborde sur la suivante ne traite pas deux fois la même ligne ;
 *   - un verrou de plus de 15 minutes est considéré comme orphelin (processus
 *     tué) et peut être repris ;
 *   - `maxAttempts` avec report exponentiel : un travail qui échoue toujours
 *     finit en `failed` au lieu de boucler indéfiniment.
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()
const RUNNER_ID = process.env.RENDER_INSTANCE_ID ?? randomUUID()
const BATCH_SIZE = Number(process.env.JOB_BATCH_SIZE ?? 25)
const LOCK_TIMEOUT_MS = 15 * 60 * 1000

/** Gestionnaires par type de travail. Un type inconnu échoue bruyamment. */
const handlers: Record<string, (payload: unknown) => Promise<void>> = {
  'email.send': async (payload) => {
    const { sendEmail } = await import('../src/lib/email')
    await sendEmail(payload as Parameters<typeof sendEmail>[0])
  },
  // Libère les commandes restées en attente de paiement. Sans ce passage, une
  // réservation abandonnée garderait du stock indisponible indéfiniment.
  'orders.expire': async (payload) => {
    const { expireStaleOrders } = await import('../src/lib/orders')
    const minutes = (payload as { minutes?: number } | null)?.minutes ?? 60
    const released = await expireStaleOrders(minutes)
    if (released > 0) console.log(`[jobs] ${released} commande(s) expirée(s), stock libéré`)
  },

  // 'import.run' sera enregistré avec le moteur d'import (étape « Imports et
  // notifications »). Tant qu'il n'existe pas, mieux vaut ne pas déclarer le
  // type du tout : un gestionnaire qui échoue en boucle serait pire qu'un type
  // inconnu, qui est signalé immédiatement.
}

async function claimBatch() {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS)
  const candidates = await prisma.jobQueue.findMany({
    where: {
      status: { in: ['queued', 'running'] },
      runAfter: { lte: new Date() },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    orderBy: { runAfter: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  })

  const claimed = []
  for (const candidate of candidates) {
    // updateMany + condition sur le verrou : si une autre instance l'a pris
    // entre-temps, count vaut 0 et on passe au suivant.
    const result = await prisma.jobQueue.updateMany({
      where: {
        id: candidate.id,
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      },
      data: { status: 'running', lockedAt: new Date(), lockedBy: RUNNER_ID },
    })
    if (result.count === 1) claimed.push(candidate.id)
  }
  return claimed
}

async function main() {
  /*
    Travaux récurrents : ils ne sont pas mis en file par l'application, c'est le
    passage du cron qui les déclenche.

    `expireStaleOrders` ne se contente pas d'expirer : pour chaque commande
    restée en attente, elle INTERROGE le prestataire avant de conclure, et
    applique l'issue s'il en donne une. C'est donc aussi le filet de rattrapage
    des webhooks perdus — et il en faut un : Mollie cesse de rappeler au bout
    de dix tentatives sur vingt-six heures, et il est impossible de redéclencher
    un appel soi-même. Sans ce passage régulier, un encaissement dont le webhook
    a échoué resterait orphelin.
  */
  try {
    const { expireStaleOrders } = await import('../src/lib/orders')
    const resolved = await expireStaleOrders(60)
    if (resolved > 0) {
      console.log(`[jobs] ${resolved} commande(s) en attente tranchée(s) (payée, refusée ou expirée)`)
    }
  } catch (error) {
    console.error('[jobs] rattrapage des commandes en attente impossible', error)
  }

  const ids = await claimBatch()
  if (ids.length === 0) {
    console.log('[jobs] rien à traiter')
    return
  }
  console.log(`[jobs] ${ids.length} travaux pris en charge par ${RUNNER_ID}`)

  let done = 0
  let failed = 0

  for (const id of ids) {
    const job = await prisma.jobQueue.findUnique({ where: { id } })
    if (!job) continue

    const handler = handlers[job.kind]
    try {
      if (!handler) throw new Error(`type de travail inconnu : ${job.kind}`)
      await handler(job.payload)
      await prisma.jobQueue.update({
        where: { id },
        data: { status: 'done', lockedAt: null, lockedBy: null, lastError: null },
      })
      done += 1
    } catch (error) {
      const attempts = job.attempts + 1
      const exhausted = attempts >= job.maxAttempts
      // Report exponentiel borné à une heure.
      const delayMs = Math.min(2 ** attempts * 60_000, 60 * 60_000)
      await prisma.jobQueue.update({
        where: { id },
        data: {
          attempts,
          status: exhausted ? 'failed' : 'queued',
          runAfter: new Date(Date.now() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      })
      failed += 1
      console.error(`[jobs] ${job.kind} #${id} en échec (tentative ${attempts})`, error)
    }
  }

  console.log(`[jobs] terminé — ${done} réussis, ${failed} en échec`)
}

main()
  .catch((error) => {
    console.error('[jobs] arrêt sur erreur', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
