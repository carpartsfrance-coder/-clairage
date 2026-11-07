import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { parseCsv } from '../src/lib/imports/csv'
import { ALIAS_MARQUE, sansAnnees } from '../src/lib/admin/photos-suivi'
import {
  GENERATION_VISIBLE,
  MARQUE_VISIBLE,
  MODELE_VISIBLE,
} from '../src/lib/queries/vehicules-visibles'

const prisma = new PrismaClient()

/**
 * Dit ce que le site montre, et le confronte à une liste de référence.
 *
 * La visibilité des véhicules n'est écrite nulle part : elle se déduit des
 * produits en ligne (`src/lib/queries/vehicules-visibles.ts`). C'est ce qu'on
 * veut — publier une série de photos fait réapparaître ses véhicules sans
 * qu'on y touche — mais cela ôte la liste qu'on aurait relue pour vérifier.
 * Cette commande la recalcule et l'affiche, pour qu'on puisse la comparer à ce
 * qu'on attendait.
 *
 * La comparaison se fait au niveau **génération**, parce que c'est le niveau
 * qui a une page. Attention : le fichier du fournisseur compte des « modèles »
 * qui portent leurs années (« 206 1998 - 2009 », « 206+ 2009 - 2013 »), là où
 * le catalogue n'a qu'une génération `206`. Un écart de une ou deux lignes à ce
 * titre est normal, et la commande nomme lesquelles.
 *
 *   npm run visibles                          les décomptes
 *   npm run visibles -- --detail              la liste complète
 *   npm run visibles -- --reference <chemin>  comparaison à un CSV marque;modèle
 */

const detail = process.argv.includes('--detail')

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const RACINE_PAR_DEFAUT = path.join(os.homedir(), 'Desktop', 'Image ledvroom.com')
const cheminReference = option('--reference') ?? path.join(RACINE_PAR_DEFAUT, 'modeles-visibles.csv')

const nb = (valeur: number) => valeur.toLocaleString('fr-FR')

/**
 * Rapproche deux façons d'écrire le même véhicule.
 *
 * Le CSV de référence écrit « Alfa Romeo » / « 147 2000 - 2010 » ; le catalogue
 * écrit la marque pareil et la génération « Alfa Romeo 147 ». On compare donc
 * sur une forme réduite : minuscules, accents et ponctuation retirés, années
 * retirées, et le nom de la marque ôté du nom de la génération quand il y est.
 */
function reduire(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cleComparaison(marque: string, vehicule: string): string {
  const brute = reduire(marque)
  // Le fournisseur dit « Mercedes », le catalogue « Mercedes-Benz ». La table
  // d'alias existe déjà pour le rapprochement des photos : la relire ici évite
  // d'annoncer 20 véhicules manquants et 20 en trop qui sont les mêmes.
  const marqueReduite = ALIAS_MARQUE[brute] ?? brute
  let reste = reduire(vehicule)
  for (const prefixe of new Set([brute, marqueReduite])) {
    if (reste.startsWith(`${prefixe}-`)) {
      reste = reste.slice(prefixe.length + 1)
      break
    }
  }
  return `${marqueReduite}|${sansAnnees(reste)}`
}

async function main() {
  const [marques, modeles, generations, marquesTotal, modelesTotal, generationsTotal, enLigne, brouillons] =
    await Promise.all([
      prisma.vehicleMake.count({ where: MARQUE_VISIBLE }),
      prisma.vehicleModel.count({ where: MODELE_VISIBLE }),
      prisma.vehicleGeneration.count({ where: GENERATION_VISIBLE }),
      prisma.vehicleMake.count(),
      prisma.vehicleModel.count(),
      prisma.vehicleGeneration.count(),
      prisma.product.count({ where: { status: 'PUBLISHED' } }),
      prisma.product.count({ where: { status: 'DRAFT' } }),
    ])

  console.log('── Catalogue ──')
  console.log(`  fiches en ligne   : ${nb(enLigne)}`)
  console.log(`  fiches en brouillon : ${nb(brouillons)}`)

  console.log('\n── Véhicules montrés (calculé depuis les fiches en ligne) ──')
  console.log(`  marques     : ${nb(marques)} sur ${nb(marquesTotal)} au référentiel`)
  console.log(`  modèles     : ${nb(modeles)} sur ${nb(modelesTotal)}`)
  console.log(`  générations : ${nb(generations)} sur ${nb(generationsTotal)}`)
  console.log('  (une génération = une page véhicule)')

  const liste = await prisma.vehicleMake.findMany({
    where: MARQUE_VISIBLE,
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      models: {
        where: MODELE_VISIBLE,
        orderBy: { name: 'asc' },
        select: {
          name: true,
          slug: true,
          generations: { where: GENERATION_VISIBLE, orderBy: { yearFrom: 'asc' }, select: { name: true, slug: true } },
        },
      },
    },
  })

  const vues = new Map<string, string>()
  for (const marque of liste) {
    for (const modele of marque.models) {
      for (const generation of modele.generations) {
        vues.set(
          cleComparaison(marque.name, generation.name),
          `${marque.name} — ${generation.name}`,
        )
        if (detail) {
          console.log(`  ${marque.slug}/${modele.slug}/${generation.slug}`)
        }
      }
    }
  }

  // ---- Comparaison à la référence -----------------------------------------
  let brut: string
  try {
    brut = await readFile(cheminReference, 'utf8')
  } catch {
    console.log(`\n(pas de fichier de référence lisible en ${cheminReference} — pas de comparaison)`)
    return
  }

  const table = parseCsv(brut, ';')
  const iMarque = table.headers.findIndex((entete) => reduire(entete) === 'marque')
  const iModele = table.headers.findIndex((entete) => reduire(entete).startsWith('modele'))
  if (iMarque < 0 || iModele < 0) {
    console.log(`\n(${cheminReference} n'a pas de colonnes « Marque » et « Modèle » — pas de comparaison)`)
    return
  }

  const attendus = new Map<string, string>()
  for (const row of table.rows) {
    const marque = row[iMarque] ?? ''
    const modele = row[iModele] ?? ''
    if (!marque || !modele) continue
    attendus.set(cleComparaison(marque, modele), `${marque} — ${modele}`)
  }

  const marquesAttendues = new Set([...attendus.keys()].map((cle) => cle.split('|')[0]))
  const marquesVues = new Set([...vues.keys()].map((cle) => cle.split('|')[0]))

  console.log(`\n── Comparaison à ${path.basename(cheminReference)} ──`)
  console.log(`  lignes attendues : ${nb(table.rows.length)} (${nb(marquesAttendues.size)} marques)`)
  console.log(
    `  après regroupement des millésimes : ${nb(attendus.size)} véhicule(s) distinct(s)`,
  )
  console.log(`  pages véhicule montrées : ${nb(vues.size)} (${nb(marquesVues.size)} marques)`)

  const manquants = [...attendus.entries()].filter(([cle]) => !vues.has(cle))
  const enTrop = [...vues.entries()].filter(([cle]) => !attendus.has(cle))

  if (manquants.length === 0 && enTrop.length === 0) {
    console.log('\n  Aucun écart : le site montre exactement les véhicules attendus.')
  } else {
    if (manquants.length > 0) {
      console.log(`\n  Attendus mais non montrés (${nb(manquants.length)}) :`)
      for (const [, libelle] of manquants) console.log(`    ${libelle}`)
    }
    if (enTrop.length > 0) {
      console.log(`\n  Montrés mais absents de la référence (${nb(enTrop.length)}) :`)
      for (const [, libelle] of enTrop) console.log(`    ${libelle}`)
    }
  }

  const regroupes = table.rows.length - attendus.size
  if (regroupes > 0) {
    console.log(
      `\n  ${nb(regroupes)} ligne(s) de la référence tombent sur un véhicule déjà compté :\n` +
        '  le fournisseur sépare des millésimes que le catalogue réunit en une génération.',
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
