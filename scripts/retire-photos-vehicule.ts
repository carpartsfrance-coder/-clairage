import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { baseVisee, ecritureDistanteAutorisee } from '../src/lib/admin/pose-rendus'

const prisma = new PrismaClient()

/**
 * Détache les photos de véhicule des générations, sans rien supprimer.
 *
 * Ces visuels viennent des pages de ledperf.com — c'est `import-vehicle-photos`
 * qui les a posés, et lui seul : aucune autre voie ne renseigne
 * `VehicleGeneration.photoMediaId`. Ils appartiennent donc au fournisseur, et
 * s'affichaient en vignette sur les pages de marque et de modèle, à 220 × 147
 * pixels. L'exploitant a demandé leur retrait.
 *
 * **Détacher plutôt que masquer à l'affichage**, et c'est un choix. Un filtre
 * dans les requêtes aurait laissé ces visuels rattachés au catalogue, en
 * comptant sur chaque écran futur pour se souvenir de la règle. Le retrait d'un
 * bien qui appartient à un tiers se fait dans les données, pas à l'affichage :
 * une fois détachés, ils ne peuvent plus reparaître par l'ajout d'un écran.
 *
 * **Rien n'est supprimé.** Les médias et leurs fichiers restent en place, et le
 * rattachement est consigné dans un registre avant d'être défait :
 *
 *     prisma/photos-vehicule-detachees.json
 *
 * `--restaurer` le relit et remet chaque photo à sa génération, **sans réseau**.
 * C'est la raison d'être du registre : `import-vehicle-photos` saurait aussi
 * reposer ces visuels, mais en les retéléchargeant chez le fournisseur — une
 * restauration qui dépendrait d'un site tiers, et qui échouerait pour toute
 * image qu'il aurait depuis changée ou retirée.
 *
 *   npm run photos:vehicule:retirer -- --dry-run   n'écrit rien, dit ce qu'il ferait
 *   npm run photos:vehicule:retirer                détache et consigne
 *   npm run photos:vehicule:retirer -- --restaurer remet les photos d'après le registre
 *   npm run photos:vehicule:retirer -- --base-distante  autorise une base hors de ce poste
 */

const essai = process.argv.includes('--dry-run') || process.argv.includes('--essai')
const restaurer = process.argv.includes('--restaurer')

const REGISTRE = path.join('prisma', 'photos-vehicule-detachees.json')

type Entree = {
  generationId: string
  /** De quoi relire le registre humainement, et retrouver la ligne en base. */
  vehicule: string
  mediaId: string
  storageKey: string
}

const nb = (valeur: number) => valeur.toLocaleString('fr-FR')

async function detacher() {
  const generations = await prisma.vehicleGeneration.findMany({
    where: { photoMediaId: { not: null } },
    select: {
      id: true,
      name: true,
      photoMediaId: true,
      photo: { select: { storageKey: true } },
      model: { select: { name: true, make: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  })

  console.log(`Générations portant une photo : ${nb(generations.length)}`)
  if (generations.length === 0) {
    console.log('Rien à détacher.')
    return
  }

  const entrees: Entree[] = generations.map((generation) => ({
    generationId: generation.id,
    vehicule: `${generation.model.make.name} ${generation.name}`,
    mediaId: generation.photoMediaId as string,
    storageKey: generation.photo?.storageKey ?? '',
  }))

  console.log('\nExemples :')
  for (const entree of entrees.slice(0, 3)) {
    console.log(`  ${entree.vehicule} — ${entree.storageKey}`)
  }

  if (essai) {
    console.log(`\nESSAI : ${nb(entrees.length)} photo(s) seraient détachée(s).`)
    console.log(`Le registre ${REGISTRE} serait écrit.`)
    return
  }

  /*
    Le registre est écrit AVANT la mise à jour. Si l'écriture échoue, rien n'est
    détaché : on ne défait pas un rattachement dont on n'a pas encore gardé la
    trace.
  */
  await mkdir(path.dirname(REGISTRE), { recursive: true })
  await writeFile(
    REGISTRE,
    `${JSON.stringify(
      {
        _objet:
          'Photos de véhicule détachées des générations. Les médias et leurs fichiers ne sont pas supprimés : ce registre permet de les remettre en place hors ligne, avec --restaurer.',
        _origine:
          'Visuels relevés sur ledperf.com et posés par scripts/import-vehicle-photos.ts, retirés sur demande de l’exploitant.',
        _detachees_le: new Date().toISOString(),
        entrees,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`\nRegistre écrit : ${REGISTRE} (${nb(entrees.length)} entrées)`)

  const { count } = await prisma.vehicleGeneration.updateMany({
    where: { photoMediaId: { not: null } },
    data: { photoMediaId: null },
  })
  console.log(`${nb(count)} photo(s) détachée(s). Aucun média supprimé.`)
}

async function remettre() {
  let brut: string
  try {
    brut = await readFile(REGISTRE, 'utf8')
  } catch {
    console.error(
      `Registre introuvable : ${REGISTRE}\n` +
        'Rien n’a été restauré. Sans lui, c’est `npm run import:vehicle-photos` qu’il faut\n' +
        'relancer — mais il retéléchargera les visuels chez le fournisseur.',
    )
    process.exitCode = 1
    return
  }

  const { entrees } = JSON.parse(brut) as { entrees: Entree[] }
  console.log(`Registre lu : ${nb(entrees.length)} entrées`)

  let remises = 0
  let deja = 0
  let perdues = 0

  for (const entree of entrees) {
    // Les deux doivent exister : une génération supprimée depuis, ou un média
    // effacé, ne se réinvente pas. On le dit plutôt que de passer outre.
    const [generation, media] = await Promise.all([
      prisma.vehicleGeneration.findUnique({
        where: { id: entree.generationId },
        select: { photoMediaId: true },
      }),
      prisma.media.findUnique({ where: { id: entree.mediaId }, select: { id: true } }),
    ])
    if (!generation || !media) {
      perdues += 1
      continue
    }
    if (generation.photoMediaId === entree.mediaId) {
      deja += 1
      continue
    }
    if (!essai) {
      await prisma.vehicleGeneration.update({
        where: { id: entree.generationId },
        data: { photoMediaId: entree.mediaId },
      })
    }
    remises += 1
  }

  console.log(`${nb(remises)} photo(s) ${essai ? 'seraient remises' : 'remises'} en place.`)
  if (deja) console.log(`${nb(deja)} déjà en place.`)
  if (perdues) {
    console.log(`${nb(perdues)} introuvable(s) : génération ou média absent de cette base.`)
  }
}

async function main() {
  console.log(`Base visée : ${baseVisee()}${essai ? '  —  ESSAI, rien ne sera écrit' : ''}`)

  if (!essai && !ecritureDistanteAutorisee(process.argv.includes('--base-distante'))) {
    process.exitCode = 1
    return
  }

  if (restaurer) await remettre()
  else await detacher()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
