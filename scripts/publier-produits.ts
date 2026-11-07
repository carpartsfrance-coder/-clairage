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
 * Publie les fiches dont les photos sont prêtes, et met les autres en brouillon.
 *
 * C'est la commande du lancement, et celle de chaque nouvelle série de photos :
 * elle prend la liste des produits prêts, pose leurs trois rendus, publie ces
 * fiches et remet toutes les autres en brouillon.
 *
 * Quatre partis pris, et ils expliquent l'essentiel du code :
 *
 * 1. **Rien n'est supprimé, jamais.** Une fiche écartée passe en `DRAFT` et
 *    conserve tout : son rédactionnel, ses variantes, ses compatibilités, ses
 *    médias, et jusqu'à sa date de première publication. La repasser en ligne
 *    plus tard ne demande que de la relister dans un CSV. Les fiches archivées
 *    sont laissées telles quelles : les sortir de l'archive serait aussi une
 *    perte d'information.
 *
 * 2. **Une fiche sans ses trois images ne se publie pas.** La liste dit ce qui
 *    est prêt, mais c'est la pose qui le constate. Si une des trois images
 *    manque sur le disque, la fiche reste en brouillon plutôt que de s'afficher
 *    avec les vignettes du fournisseur — l'inverse de ce que cette commande
 *    cherche à obtenir.
 *
 * 3. **Une ligne non retrouvée arrête tout.** Un CSV dont une ligne ne retombe
 *    sur aucune fiche est un CSV qu'il faut corriger, pas un CSV à publier aux
 *    trois quarts. Les lignes fautives sont nommées une par une. `--quand-meme`
 *    publie malgré tout ce qui a été retrouvé, quand c'est un choix assumé.
 *
 * 4. **Rejouable.** Deux exécutions de suite donnent le même état : la pose
 *    retrouve ses images par empreinte, et la publication n'écrit que les
 *    fiches dont le statut change réellement.
 *
 *   npm run publier -- --dry-run                 n'écrit rien, dit ce qu'il ferait
 *   npm run publier                              publie la liste du lancement
 *   npm run publier -- --csv <chemin>            une autre liste
 *   npm run publier -- --quand-meme              publie même si des lignes manquent
 */

const essai = process.argv.includes('--dry-run') || process.argv.includes('--essai')
const quandMeme = process.argv.includes('--quand-meme')

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const RACINE_PAR_DEFAUT = path.join(os.homedir(), 'Desktop', 'Image ledvroom.com')
const cheminCsv = option('--csv') ?? path.join(RACINE_PAR_DEFAUT, 'produits-a-afficher.csv')
const racinePhotos = option('--photos') ?? path.dirname(cheminCsv)

/** « 1 001 » plutôt que « 1001 » : ces nombres sont lus, pas calculés. */
const nb = (valeur: number) => valeur.toLocaleString('fr-FR')

async function main() {
  console.log(`Base visée : ${baseVisee()}`)

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(`Stockage « ${etat.driver} » inutilisable : ${etat.problem}`)
    process.exitCode = 1
    return
  }
  console.log(`Stockage : ${etat.driver}${essai ? '  —  ESSAI, rien ne sera écrit' : ''}`)
  console.log(`Liste lue : ${cheminCsv}`)

  if (!(await attelageCoherent(prisma))) {
    process.exitCode = 1
    return
  }

  // ---- 1. Rapprochement liste ↔ fiches ------------------------------------
  const parCle = await lireReleves(process.cwd(), (ligne) => console.log(ligne))

  const suivi = lireSuivi(await readFile(cheminCsv, 'utf8'))
  if (!suivi) {
    console.error(
      `Colonnes attendues absentes de ${cheminCsv}.\n` +
        'Il en faut trois : le type (« Type »), le dossier des images\n' +
        '(« Dossier images » ou « dossier ») et le rang (« Rang ventes » ou « rang »).',
    )
    process.exitCode = 1
    return
  }

  const { retenus, refus, apparieesBrutes } = apparier(suivi.lignes, parCle)
  const nonRetrouvees = suivi.lignes.length - apparieesBrutes

  console.log(`\n── Rapprochement ──`)
  console.log(`Produits listés comme prêts : ${nb(suivi.lignes.length)}`)
  if (suivi.total !== suivi.lignes.length) {
    console.log(`  (sur ${nb(suivi.total)} lignes au fichier ; le reste n'est pas « fait »)`)
  }
  console.log(`  retrouvés au catalogue    : ${nb(apparieesBrutes)}`)
  console.log(`  non retrouvés             : ${nb(nonRetrouvees)}`)
  console.log(`Fiches distinctes visées     : ${nb(retenus.length)}`)

  const regroupees = retenus.filter((entree) => entree.concurrents > 0).length
  if (regroupees > 0) {
    console.log(
      `  dont ${nb(regroupees)} fiche(s) visée(s) par plusieurs produits listés : le catalogue\n` +
        `  réunit ce que le fournisseur sépare (restylé et non-restylé, blanc xénon et\n` +
        `  blanc pur). Le jeu de photos retenu est celui du produit le mieux classé.`,
    )
  }

  if (nonRetrouvees > 0) {
    console.log(`\n── Lignes non retrouvées ──`)
    for (const { ligne, motif } of refus.details) {
      console.log(`  ${motif}\n    ${ligne.dossier}`)
    }
    if (!quandMeme) {
      console.error(
        `\nArrêt : ${nb(nonRetrouvees)} ligne(s) du CSV ne retombent sur aucune fiche.\n` +
          'Rien n’a été modifié. Corrigez ces lignes, ou relancez avec --quand-meme\n' +
          'pour publier malgré tout ce qui a été retrouvé.',
      )
      process.exitCode = 1
      return
    }
    console.log('\n--quand-meme : on continue avec ce qui a été retrouvé.')
  }

  // ---- 2. Pose des trois rendus -------------------------------------------
  console.log(`\n── Images ──`)
  const compte = await poseRendus({
    prisma,
    racinePhotos,
    retenus,
    essai,
    journal: (ligne) => console.error(ligne),
    avancement: (faites) => {
      if (faites % 50 === 0) process.stdout.write(`\r  fiches traitées : ${nb(faites)}`)
    },
  })
  // Effacer la ligne d'avancement, sinon le compte final s'écrit par-dessus.
  if (compte.fichesFaites >= 50) process.stdout.write(`\r${' '.repeat(40)}\r`)

  console.log(
    `${nb(compte.fichesFaites)} fiche(s) ${essai ? 'auraient' : 'ont'} leurs trois rendus en place` +
      `, gros plan en couverture.`,
  )
  if (compte.posees > 0) console.log(`  ${nb(compte.posees)} image(s) rattachée(s).`)
  if (compte.sansFichier > 0) {
    console.log(
      `  ${nb(compte.sansFichier)} fiche(s) écartée(s) : une des trois images manque sur le disque.\n` +
        '  Elles restent en brouillon — mieux vaut une fiche absente qu’une fiche\n' +
        '  qui afficherait les vignettes du fournisseur.',
    )
  }
  if (compte.sansFiche > 0) {
    console.log(`  ${nb(compte.sansFiche)} fiche(s) écartée(s) : slug absent de cette base.`)
  }
  if (compte.refusees > 0) {
    console.log(`  ${nb(compte.refusees)} image(s) refusée(s) par le contrôle de fichier.`)
  }

  // ---- 3. Publication ------------------------------------------------------
  const aPublier = compte.slugsPourvus
  if (aPublier.length === 0) {
    console.error('\nArrêt : aucune fiche n’est prête. Rien n’a été modifié.')
    process.exitCode = 1
    return
  }

  console.log(`\n── Publication ──`)

  /*
    Le compte avant/après se lit sur la base, pas sur nos intentions : c'est la
    seule façon de dire « rien à faire » quand la commande est rejouée, au lieu
    d'annoncer une publication qui n'a rien changé.
  */
  const aMettreEnLigne = await prisma.product.count({
    where: { slug: { in: aPublier }, status: { not: 'PUBLISHED' } },
  })
  const aRemettreEnBrouillon = await prisma.product.count({
    where: { slug: { notIn: aPublier }, status: 'PUBLISHED' },
  })

  if (essai) {
    console.log(`${nb(aMettreEnLigne)} fiche(s) passeraient en ligne.`)
    console.log(`${nb(aRemettreEnBrouillon)} fiche(s) repasseraient en brouillon.`)
  } else {
    const maintenant = new Date()
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { slug: { in: aPublier }, status: { not: 'PUBLISHED' } },
        data: { status: 'PUBLISHED' },
      }),
      // Une fiche publiée sans date de publication se classerait en dernier
      // partout où le catalogue trie par nouveauté.
      prisma.product.updateMany({
        where: { slug: { in: aPublier }, publishedAt: null },
        data: { publishedAt: maintenant },
      }),
      /*
        `ARCHIVED` n'est pas touché : une fiche archivée est déjà hors ligne, et
        la faire passer en brouillon effacerait la décision de l'archiver.
        `publishedAt` est conservé : la remettre en ligne retrouvera sa date.
      */
      prisma.product.updateMany({
        where: { slug: { notIn: aPublier }, status: 'PUBLISHED' },
        data: { status: 'DRAFT' },
      }),
    ])
    console.log(`${nb(aMettreEnLigne)} fiche(s) passée(s) en ligne.`)
    console.log(`${nb(aRemettreEnBrouillon)} fiche(s) repassée(s) en brouillon.`)
  }

  // ---- 4. État final, relu en base ----------------------------------------
  const [enLigne, brouillons, archivees] = await Promise.all([
    prisma.product.count({ where: { status: 'PUBLISHED' } }),
    prisma.product.count({ where: { status: 'DRAFT' } }),
    prisma.product.count({ where: { status: 'ARCHIVED' } }),
  ])

  console.log(`\n── État du catalogue ${essai ? '(inchangé : essai)' : ''} ──`)
  console.log(`  en ligne   : ${nb(enLigne)}`)
  console.log(`  brouillons : ${nb(brouillons)}`)
  if (archivees > 0) console.log(`  archivées  : ${nb(archivees)}`)
  console.log('\nAucune donnée supprimée : les fiches écartées gardent tout leur contenu.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
