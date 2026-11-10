/**
 * Pose le filigrane LEDVROOM sur tous les rendus déjà en ligne, depuis un
 * ordinateur (et non depuis le serveur du site, qu'un tel passage a fait
 * tomber le 10 novembre 2026).
 *
 * Lit `.env` puis `.env.filigrane.local` (les clés du stockage, copiées depuis
 * Render ; ce fichier n'est jamais envoyé sur GitHub). Vise la base de
 * production (`PROD_DATABASE_URL`).
 *
 *   npm run filigrane -- --essai     compte seulement ce qui reste à faire
 *   npm run filigrane                pose le filigrane
 *
 * Rejouable à tout moment : ce qui est déjà fait est sauté.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function chargerEnv(fichier: string) {
  const chemin = path.join(process.cwd(), fichier)
  if (!existsSync(chemin)) return
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne)
    if (!m || m[2] === '') continue
    const valeur = m[2].replace(/^["']|["']$/g, '')
    if (process.env[m[1]] === undefined || fichier !== '.env') process.env[m[1]] = valeur
  }
}

async function main() {
  chargerEnv('.env')
  chargerEnv('.env.filigrane.local')
  if (process.env.PROD_DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
  process.env.MEDIA_DRIVER ??= 's3'

  const { PrismaClient } = await import('@prisma/client')
  const { storageStatus } = await import('../src/lib/storage/driver')
  const { filigranerRendus } = await import('../src/lib/storage/filigraner-existants')

  const base = (() => {
    try {
      const u = new URL(process.env.DATABASE_URL ?? '')
      return `${u.hostname}${u.pathname}`
    } catch {
      return '(DATABASE_URL absente)'
    }
  })()
  console.log(`Base visée : ${base}`)
  const etat = storageStatus()
  if (!etat.ok || etat.driver !== 's3') {
    console.error(`Stockage inutilisable : ${etat.problem ?? etat.driver}. Remplissez .env.filigrane.local.`)
    process.exitCode = 1
    return
  }

  const prisma = new PrismaClient()
  const reste = await prisma.media.count({
    where: {
      filigraneAt: null,
      url: { startsWith: 'https://' },
      mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
      products: { some: { role: { in: ['RESULT', 'INSTALL'] } } },
    },
  })
  console.log(`${reste} rendu(s) à filigraner.`)
  if (process.argv.includes('--essai') || reste === 0) {
    await prisma.$disconnect()
    return
  }

  const debut = Date.now()
  let faits = 0
  let total = { filigranes: 0, echecs: 0 }
  // Une connexion à la base coupée (réseau, Mac en veille, base redémarrée)
  // ne doit pas tout arrêter : on attend, on se reconnecte, on reprend.
  for (let essai = 1; ; essai++) {
    try {
      const bilan = await filigranerRendus(prisma, {
        pauseMs: 0,
        journal: () => {
          faits += 50
          const parImage = (Date.now() - debut) / faits
          const restant = Math.round(((reste - faits) * parImage) / 60000)
          console.log(`${faits} / ${reste} — encore ~${Math.max(0, restant)} min`)
        },
      })
      total = { filigranes: total.filigranes + bilan.filigranes, echecs: total.echecs + bilan.echecs }
      break
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      if (!/^P10(01|02|08|17)$/.test(code) || essai > 30) throw error
      console.log(`Connexion à la base coupée (${code}). Nouvel essai dans 20 s…`)
      await new Promise((fin) => setTimeout(fin, 20_000))
      await prisma.$disconnect().catch(() => {})
    }
  }
  console.log(`Terminé : ${total.filigranes} filigrané(s), ${total.echecs} échec(s).`)
  await prisma.$disconnect()
}

void main()
