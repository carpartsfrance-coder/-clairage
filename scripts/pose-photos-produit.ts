import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { storageStatus } from '../src/lib/storage/driver'
import {
  apparier,
  attelageCoherent,
  baseVisee,
  lireReleves,
  lireSuivi,
  poseRendus,
} from '../src/lib/admin/pose-rendus'

const prisma = new PrismaClient()

/**
 * Pose sur les fiches les photos produites véhicule par véhicule.
 *
 * Les trois images d'un produit — comparatif avant/après, gros plan, véhicule
 * entier — sont fabriquées à part et rangées dans un dossier par véhicule.
 *
 * Tout le travail est dans `src/lib/admin/pose-rendus.ts`, que `publier`
 * emploie aussi : les deux commandes rapprochent donc les dossiers et les
 * fiches exactement de la même façon. La règle de rapprochement elle-même vit
 * dans `src/lib/admin/photos-suivi.ts`, sous tests. Le pont entre les deux
 * mondes est `prisma/packs-vehicule.json`, le relevé qui a créé les packs : il
 * donne, pour un triplet marque / génération / position, le slug exact de la
 * fiche. On ne devine donc rien, on relit.
 *
 *   npm run photos:produits -- --essai            n'écrit rien, dit ce qu'il ferait
 *   npm run photos:produits -- --limite 20        ne traite que les 20 premiers
 *   npm run photos:produits                       pose tout
 *   npm run photos:produits -- --suivi <chemin>   un autre fichier de suivi
 */

const essai = process.argv.includes('--essai')

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const RACINE_PAR_DEFAUT = path.join(os.homedir(), 'Desktop', 'Image ledvroom.com')
const cheminSuivi = option('--suivi') ?? path.join(RACINE_PAR_DEFAUT, 'suivi.csv')
const racinePhotos = option('--photos') ?? path.dirname(cheminSuivi)
const limite = Number(option('--limite') ?? '0') || Infinity

async function main() {
  console.log(`Base visée : ${baseVisee()}`)

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(`Stockage « ${etat.driver} » inutilisable : ${etat.problem}`)
    process.exitCode = 1
    return
  }
  console.log(`Stockage : ${etat.driver}${essai ? '  —  ESSAI, rien ne sera écrit' : ''}`)

  if (!(await attelageCoherent(prisma))) {
    process.exitCode = 1
    return
  }

  const parCle = await lireReleves(process.cwd(), (ligne) => console.log(ligne))

  const suivi = lireSuivi(await readFile(cheminSuivi, 'utf8'))
  if (!suivi) {
    console.error(`Colonnes attendues absentes de ${cheminSuivi} : rang, type, dossier.`)
    process.exitCode = 1
    return
  }

  const { retenus, refus, apparieesBrutes } = apparier(suivi.lignes, parCle)

  console.log(`\nJeux de photos terminés : ${suivi.lignes.length}`)
  console.log(`  appariés à une fiche : ${apparieesBrutes}`)
  console.log(`  famille absente du catalogue : ${refus.typeInconnu}`)
  console.log(`  véhicule absent du catalogue : ${refus.aucunPack}`)
  if (refus.cheminIllisible) console.log(`  chemin illisible : ${refus.cheminIllisible}`)
  console.log(
    `Fiches visées : ${retenus.length}` + (limite === Infinity ? '' : `, limitées à ${limite}`),
  )

  const compte = await poseRendus({
    prisma,
    racinePhotos,
    retenus: limite === Infinity ? retenus : retenus.slice(0, limite),
    essai,
    journal: (ligne) => console.error(ligne),
    avancement: (faites) => {
      if (faites % 25 === 0) process.stdout.write(`\r  fiches traitées : ${faites}`)
    },
  })

  if (compte.fichesFaites >= 25) process.stdout.write('\n')
  console.log(
    `\n${compte.fichesFaites} fiche(s) ${essai ? 'seraient pourvues' : 'pourvues'} de leurs trois rendus.`,
  )
  if (compte.sansFichier) {
    console.log(`${compte.sansFichier} fiche(s) laissées : images introuvables sur le disque.`)
  }
  if (compte.sansFiche) console.log(`${compte.sansFiche} fiche(s) laissées : slug absent de cette base.`)
  if (compte.refusees) console.log(`${compte.refusees} image(s) refusées par le contrôle de fichier.`)
  console.log('Aucun visuel existant n’a été retiré ; la vignette montre désormais le gros plan.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
