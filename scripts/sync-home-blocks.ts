/**
 * Report des contenus éditoriaux de l'accueil vers la base.
 *
 *   npm run contenus:accueil            — reporte tous les blocs
 *   npm run contenus:accueil -- hero    — reporte les blocs nommés
 *
 * `getHomeBlocks()` lit la table `HomeBlock` et ne retombe sur
 * `prisma/demo-data.ts` que pour les clés absentes. Une fois le jeu de
 * démonstration passé, chaque bloc existe en base : modifier le fichier ne
 * change donc plus rien à l'écran, et la divergence passe inaperçue puisque
 * la page continue d'afficher quelque chose de correct — simplement l'ancienne
 * version.
 *
 * Ce script est le chemin de retour. `npm run seed:demo` ferait le même
 * report, mais en réécrivant au passage produits, médias et véhicules de
 * démonstration : hors de question de le lancer sur une base qui sert, pour
 * corriger une phrase d'accroche.
 *
 * Il écrase le contenu de la base par celui du fichier. Le jour où ces blocs
 * s'éditeront depuis le back-office, c'est l'inverse qu'il faudra faire —
 * et ce script devra disparaître plutôt que d'effacer le travail de
 * l'exploitant.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { demoHomeBlocks } from '../prisma/demo-data'

const prisma = new PrismaClient()

async function main() {
  const demandes = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const toutes = Object.keys(demoHomeBlocks)

  // Une clé inconnue est une faute de frappe, pas une demande : mieux vaut
  // s'arrêter que de rapporter silencieusement les autres blocs.
  const inconnues = demandes.filter((cle) => !toutes.includes(cle))
  if (inconnues.length > 0) {
    throw new Error(
      `Bloc inconnu : ${inconnues.join(', ')}. Blocs disponibles : ${toutes.join(', ')}.`,
    )
  }

  const cles = demandes.length > 0 ? demandes : toutes

  for (const [index, cle] of toutes.entries()) {
    if (!cles.includes(cle)) continue
    const payload = demoHomeBlocks[cle as keyof typeof demoHomeBlocks]
    await prisma.homeBlock.upsert({
      where: { key: cle },
      // La position suit l'ordre du fichier, comme à l'amorçage : les deux
      // chemins doivent produire la même table.
      update: { payload: payload as Prisma.InputJsonValue, position: index },
      create: { key: cle, payload: payload as Prisma.InputJsonValue, position: index },
    })
    console.log(`  ✓ ${cle}`)
  }

  console.log(`→ ${cles.length} bloc(s) reporté(s) depuis prisma/demo-data.ts`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
