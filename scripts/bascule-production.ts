import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { baseEnLocal, baseVisee, ecritureDistanteAutorisee } from '../src/lib/admin/pose-rendus'
import { storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Bascule du catalogue : la suite complète, dans le bon ordre.
 *
 * Les trois gestes de la mise en ligne existaient déjà séparément. Les laisser
 * séparés marchait tant qu'ils ne tournaient que sur un poste ; sur la base de
 * la boutique, l'ordre et l'oubli coûtent cher. Cette commande les enchaîne et
 * s'arrête au premier échec en disant ce qui a été fait et ce qui ne l'a pas
 * été — parce qu'un arrêt entre l'étape 1 et l'étape 2 laisse une base dans un
 * état intermédiaire qu'il faut connaître.
 *
 * L'ordre n'est pas un détail :
 *
 * 1. **Publier** d'abord. C'est l'étape qui dépose les images manquantes et qui
 *    décide quelles fiches sont en ligne ; tout le reste en découle.
 * 2. **Retirer les photos de véhicule** ensuite. Indépendante de la première,
 *    mais elle écrit elle aussi en masse, et on ne veut qu'une seule remise à
 *    plat des statistiques derrière.
 * 3. **VACUUM ANALYZE** en dernier, et ce n'est pas optionnel. Après la
 *    bascule en masse des statuts, les statistiques du planificateur
 *    PostgreSQL décrivent l'ancien catalogue : mesuré sur le poste, la requête
 *    qui décide des véhicules visibles passait de 7 ms à 2 648 ms, et revenait
 *    à 7 ms après analyse. Sans cette étape, le site est lent sans raison
 *    apparente, et le réflexe serait d'ajouter un cache qui ne sert à rien.
 * 4. **Recompter** enfin, en lecture seule, pour que l'état obtenu soit lu et
 *    pas supposé.
 *
 * Le détail de chaque étape reste dans sa propre commande : celle-ci ne décide
 * rien, elle ordonne.
 *
 *   npm run bascule -- --dry-run          n'écrit rien, déroule les contrôles
 *   npm run bascule -- --base-distante    sur la base de la boutique
 *   npm run bascule -- --csv <chemin>     une autre liste de produits prêts
 */

const essai = process.argv.includes('--dry-run') || process.argv.includes('--essai')
const distante = process.argv.includes('--base-distante')
const quandMeme = process.argv.includes('--quand-meme')

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const TSX = path.join(process.cwd(), 'node_modules', '.bin', 'tsx')

/**
 * Les tables remises à plat : toutes.
 *
 * Nommer les quatre tables réécrites serait plus rapide, mais c'est une liste
 * qui se périme — la prochaine colonne touchée en masse ne s'y ajouterait pas
 * toute seule, et l'oubli ne se verrait qu'en lenteur. La base tient dans
 * quelques dizaines de milliers de lignes : l'analyse complète coûte quelques
 * secondes et ne peut rien rater.
 */
async function remettreLesStatistiquesAPlat() {
  const t0 = Date.now()
  await prisma.$executeRawUnsafe('VACUUM (ANALYZE)')
  console.log(`Statistiques remises à plat en ${Math.round((Date.now() - t0) / 100) / 10} s.`)
}

/** Lance une étape. Rend `false` si elle a échoué. */
function etape(titre: string, script: string, args: string[]): boolean {
  console.log(`\n${'═'.repeat(70)}\n  ${titre}\n${'═'.repeat(70)}`)
  const r = spawnSync(TSX, [path.join('scripts', script), ...args], { stdio: 'inherit' })
  if (r.error) {
    console.error(`\nÉchec du lancement de ${script} : ${r.error.message}`)
    return false
  }
  return r.status === 0
}

async function main() {
  const cible = baseVisee()
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Bascule du catalogue${essai ? ' — ESSAI, rien ne sera écrit' : ''}`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`Base visée : ${cible}${baseEnLocal() ? '  (ce poste)' : '  ← HORS DE CE POSTE'}`)

  const stockage = storageStatus()
  console.log(`Stockage   : ${stockage.driver}${stockage.ok ? '' : `  ← ${stockage.problem}`}`)
  if (!stockage.ok) {
    process.exitCode = 1
    return
  }

  /*
    Le pilote « local » écrit dans public/uploads, que seul ce poste sert. Les
    images déposées ainsi au profit d'une base distante donneraient des fiches
    vides en ligne — `attelageCoherent`, dans la commande de publication, le
    refuse déjà sur la base de ce qu'elle contient. Le dire ici aussi évite
    d'aller au bout des contrôles pour échouer sur celui-là.
  */
  if (!baseEnLocal() && stockage.driver === 'local') {
    console.error(
      '\nBase distante et stockage « local » : incompatibles.\n' +
        'Les images seraient écrites sur le disque de ce poste, et la base en ligne\n' +
        'garderait des adresses que personne ne sert. Renseignez MEDIA_DRIVER=s3 et\n' +
        'ses quatre variables (voir docs/render.md § 3).',
    )
    process.exitCode = 1
    return
  }

  if (!essai && !ecritureDistanteAutorisee(distante)) {
    process.exitCode = 1
    return
  }

  const csv = option('--csv')
  const communs = [...(essai ? ['--dry-run'] : []), ...(distante ? ['--base-distante'] : [])]

  if (
    !etape('1/4  Publier les fiches dont les photos sont prêtes', 'publier-produits.ts', [
      ...communs,
      ...(csv ? ['--csv', csv] : []),
      ...(quandMeme ? ['--quand-meme'] : []),
    ])
  ) {
    console.error('\nArrêt à l’étape 1. Rien n’a été publié, rien n’a été détaché.')
    process.exitCode = 1
    return
  }

  if (!etape('2/4  Retirer les photos de véhicule du fournisseur', 'retire-photos-vehicule.ts', communs)) {
    console.error(
      '\nArrêt à l’étape 2. Les fiches SONT publiées ; les photos de véhicule ne sont\n' +
        'PAS retirées, et les statistiques ne sont pas à jour — le site peut être lent.\n' +
        'Reprenez à l’étape 2 une fois la cause levée.',
    )
    process.exitCode = 1
    return
  }

  console.log(`\n${'═'.repeat(70)}\n  3/4  Remettre les statistiques à plat\n${'═'.repeat(70)}`)
  if (essai) {
    console.log('ESSAI : VACUUM (ANALYZE) serait exécuté ici.')
  } else {
    await remettreLesStatistiquesAPlat()
  }

  if (!etape('4/4  Recompter ce que le site montre', 'compte-visibles.ts', [])) {
    console.error(
      '\nLe décompte final a échoué, mais les trois étapes d’écriture ont abouti.\n' +
        'Relancez `npm run visibles` pour lire l’état obtenu.',
    )
    process.exitCode = 1
    return
  }

  console.log(
    `\n${essai ? 'Essai terminé : rien n’a été écrit.' : 'Bascule terminée.'}\n` +
      'À contrôler maintenant : une fiche publiée, une page de marque, et le plan\n' +
      'de site — docs/render.md § 9.',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
