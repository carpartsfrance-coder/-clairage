import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { storageStatus } from '../src/lib/storage/driver'
import { rattacherLogo } from './brand-logo'

const prisma = new PrismaClient()

/**
 * Pose le lot des logos fournis — ceux que Commons n'héberge pas.
 *
 * **Les médias ne se déploient pas avec le code.** Ils vivent dans la base et
 * dans le stockage objet, c'est-à-dire par environnement : un logo rattaché en
 * développement n'existe pas en production, et aucune fusion ne l'y portera.
 * Jusqu'ici, la seule façon de pourvoir un nouvel environnement était de
 * rejouer six commandes à la main, en recopiant six provenances — six
 * occasions de se tromper, et rien pour vérifier après coup.
 *
 * D'où ce script et le jeu de données `prisma/logos-marques.json` : les
 * fichiers sont versionnés, leur provenance avec eux, et une commande pose
 * l'ensemble là où on l'exécute.
 *
 *   npm run logos:fournis                → ne remplace aucun logo en place
 *   npm run logos:fournis -- --remplacer → remplace, en le disant
 *
 * Il est sans effet s'il est rejoué : un fichier déjà déposé est reconnu à
 * l'empreinte de son contenu, et la marque qui le porte déjà est laissée
 * tranquille.
 *
 * Pour la production, il s'exécute **dans l'environnement de production** —
 * console Render, ou toute machine disposant de `DATABASE_URL` et des
 * variables `MEDIA_*`. Ces secrets n'ont pas à circuler pour cela.
 */

type Entree = { slug: string; fichier: string; provenance: string }
type Jeu = { _releve: string; logos: Entree[] }

async function main() {
  const remplacer = process.argv.includes('--remplacer')

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(
      `Stockage « ${etat.driver} » inutilisable : ${etat.problem}\n` +
        "Aucun logo n'est rattaché — mieux vaut rien que des médias pointant vers des fichiers absents.",
    )
    process.exitCode = 1
    return
  }

  const jeu: Jeu = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'logos-marques.json'), 'utf8'),
  )
  console.log(
    `→ Logos fournis — relevé du ${jeu._releve}, stockage « ${etat.driver} », ` +
      `${jeu.logos.length} fichiers`,
  )

  let poses = 0
  let deja = 0
  let refuses = 0

  for (const entree of jeu.logos) {
    const resultat = await rattacherLogo({
      prisma,
      slug: entree.slug,
      fichier: entree.fichier,
      provenance: entree.provenance,
      remplacer,
    })

    if (resultat.etat === 'refusé') {
      refuses += 1
      console.log(`  ! ${resultat.marque} — ${resultat.raison}`)
    } else if (resultat.etat === 'déjà rattaché') {
      deja += 1
      console.log(`  · ${resultat.marque}`)
    } else {
      poses += 1
      console.log(`  ✓ ${resultat.marque} — ${resultat.etat} : ${resultat.url}`)
    }
  }

  console.log(`\n  ${poses} posé(s), ${deja} déjà en place, ${refuses} refusé(s).`)

  /*
    Le compte qui intéresse vraiment : ce qui reste au monogramme. Une marque
    absente du jeu de données et sans logo ne ferait échouer aucune ligne
    ci-dessus — elle passerait simplement inaperçue.
  */
  const sansLogo = await prisma.vehicleMake.findMany({
    where: { active: true, logoMediaId: null },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  console.log(
    sansLogo.length === 0
      ? '  Aucune marque active au monogramme.'
      : `  Au monogramme : ${sansLogo.map((m) => m.name).join(', ')}`,
  )

  if (refuses > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
