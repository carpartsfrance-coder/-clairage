import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { type PackSitue, type Position, slugsAmbigus } from '../src/lib/admin/packs-manquants'

const prisma = new PrismaClient()

/**
 * Renomme les fiches dont le slug désigne une autre voiture que la leur.
 *
 * Le générateur du relevé d'origine raccourcissait certaines générations :
 * « 206-plus » devenait « 206 », « ka-plus » devenait « ka ». Sans conséquence
 * tant que la vraie 206 n'avait pas de pack à cette position — et elle n'en
 * avait pas, puisque le même relevé l'avait sautée. Dès qu'on les crée, deux
 * voitures se disputent la même adresse et c'est la mauvaise qui répond.
 *
 * Trois partis pris :
 *
 * 1. **On ne renomme que l'ambigu.** Un slug seulement plus court que sa
 *    génération ne désigne personne d'autre : le renommer casserait une URL
 *    pour rien. La règle exige que la génération nommée existe vraiment.
 *
 * 2. **Les SKU ne bougent pas.** Ils sont la référence d'exploitation, celle
 *    qu'on imprime et qu'on exporte ; les réécrire pour la cohérence de la
 *    forme ferait perdre le lien avec tout ce qui a été sorti avant.
 *
 * 3. **Le relevé est corrigé aussi.** Sinon le prochain import, qui cherche par
 *    slug, ne retrouverait pas la fiche renommée et en créerait une seconde.
 *
 *   npm run slugs:ambigus -- --essai   → n'écrit rien, dit ce qu'il ferait
 *   npm run slugs:ambigus              → renomme
 */

const essai = process.argv.includes('--essai')
const RELEVE = path.join('prisma', 'packs-vehicule.json')

type Pack = PackSitue & Record<string, unknown>

function baseVisee(): string {
  const brut = process.env.DATABASE_URL
  if (!brut) return '(DATABASE_URL absente)'
  try {
    const url = new URL(brut)
    return `${url.hostname}${url.pathname}`
  } catch {
    return '(DATABASE_URL illisible)'
  }
}

async function main() {
  console.log(`Base visée : ${baseVisee()}`)

  const jeu = JSON.parse(await readFile(path.join(process.cwd(), RELEVE), 'utf8')) as {
    packs: Pack[]
  }

  const generations = await prisma.vehicleGeneration.findMany({
    select: { slug: true, model: { select: { make: { select: { slug: true } } } } },
  })
  const parMarque = new Map<string, Set<string>>()
  for (const g of generations) {
    const marque = g.model.make.slug
    if (!parMarque.has(marque)) parMarque.set(marque, new Set())
    parMarque.get(marque)!.add(g.slug)
  }

  const ambigus = slugsAmbigus(
    jeu.packs.map((p) => ({
      slug: p.slug,
      position: p.position as Position,
      make: p.make,
      generation: p.generation,
    })),
    parMarque,
  )

  console.log(`Packs relevés : ${jeu.packs.length}`)
  console.log(`Slugs qui désignent une autre voiture : ${ambigus.length}`)
  if (ambigus.length === 0) return

  for (const a of ambigus) {
    console.log(`  ${a.pack.slug}`)
    console.log(`    appartient à « ${a.revendiquePar} », porté par « ${a.pack.generation} »`)
    console.log(`    → ${a.slugCorrige}`)
  }

  // Le slug corrigé ne doit heurter personne : on vérifie avant d'écrire.
  const vises = ambigus.map((a) => a.slugCorrige)
  const pris = await prisma.product.findMany({
    where: { slug: { in: vises } },
    select: { slug: true },
  })
  if (pris.length > 0) {
    console.error(`\nSlug corrigé déjà pris : ${pris.map((p) => p.slug).join(', ')}. Rien n'est écrit.`)
    process.exitCode = 1
    return
  }

  if (essai) {
    console.log('\nESSAI — rien n’a été écrit.')
    return
  }

  let renommes = 0
  let absents = 0
  for (const a of ambigus) {
    const produit = await prisma.product.findUnique({
      where: { slug: a.pack.slug },
      select: { id: true },
    })
    if (!produit) {
      absents += 1
      continue
    }
    await prisma.product.update({ where: { id: produit.id }, data: { slug: a.slugCorrige } })
    renommes += 1
  }

  /*
    Le relevé suit la base. Laissé en l'état, il ferait créer au prochain import
    une seconde fiche sous l'ancien slug — celle-là même qu'on vient de libérer.
  */
  for (const pack of jeu.packs) {
    const corrige = ambigus.find((a) => a.pack.slug === pack.slug && a.pack.make === pack.make)
    if (corrige) pack.slug = corrige.slugCorrige
  }
  await writeFile(path.join(process.cwd(), RELEVE), JSON.stringify(jeu, null, 2) + '\n', 'utf8')

  console.log(`\n${renommes} fiche(s) renommée(s), relevé mis à jour.`)
  if (absents > 0) console.log(`${absents} absente(s) de cette base.`)
  console.log('Les SKU n’ont pas bougé : ils restent la référence d’exploitation.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
