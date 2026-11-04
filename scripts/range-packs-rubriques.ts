import { PrismaClient } from '@prisma/client'
import { REGLES_RUBRIQUE, rubriquePour, rubriquesCitees } from '../src/lib/admin/rubrique-des-packs'

const prisma = new PrismaClient()

/**
 * Range les packs par véhicule dans les rubriques du catalogue.
 *
 * `import-packs-vehicule.ts` a créé 9 866 fiches sans leur donner de rubrique :
 * il indexe le catalogue sur le véhicule, et c'était assumé. L'effet de bord ne
 * l'était pas — les pages de rubrique sont restées vides pendant que le
 * catalogue se remplissait. `/c/modules-plaque` affichait un produit sur les
 * 1 341 qui lui revenaient.
 *
 * La règle de rangement vit dans `lib/admin/rubrique-des-packs.ts`, à part et
 * sous tests : c'est elle qui décide, pas ce script.
 *
 * Quatre partis pris :
 *
 * 1. **Rien n'est jamais détaché.** Le rattachement s'ajoute ; un produit déjà
 *    rangé ailleurs garde sa rubrique et en gagne une seconde. Le modèle est un
 *    plusieurs-à-plusieurs, et c'est au back-office de retirer une rubrique,
 *    pas à un script lancé en lot.
 *
 * 2. **Les rubriques ne sont pas créées à la volée.** Si l'une manque, la
 *    commande s'arrête et la nomme. Créer une rubrique, c'est ajouter une
 *    entrée au menu de la boutique : cela se décide dans `seed-taxonomy.ts`,
 *    où l'arborescence est versionnée, pas au détour d'un rangement.
 *
 * 3. **Le statut n'entre pas en compte.** Un brouillon se range comme une fiche
 *    en ligne ; le classement est une propriété du produit, sa visibilité une
 *    autre. Filtrer sur `PUBLISHED` laisserait les brouillons non rangés
 *    ressurgir sans rubrique le jour de leur publication.
 *
 * 4. **La base visée est annoncée.** La commande dit sur quel serveur elle
 *    écrit avant d'écrire. Elle sert en développement comme en production, et
 *    la seule différence tient à une variable d'environnement.
 *
 *   npm run rubriques:packs -- --essai   → n'écrit rien, dit ce qu'il ferait
 *   npm run rubriques:packs              → range
 */

const essai = process.argv.includes('--essai')

/** Par paquets : dix mille rattachements, c'est dix mille allers-retours. */
const PAQUET = 500

/** Le serveur et la base visés, sans les identifiants. */
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

  const attendues = rubriquesCitees()
  const existantes = await prisma.category.findMany({
    where: { slug: { in: attendues } },
    select: { id: true, slug: true },
  })
  const idParSlug = new Map(existantes.map((c) => [c.slug, c.id]))

  const manquantes = attendues.filter((slug) => !idParSlug.has(slug))
  if (manquantes.length > 0) {
    console.error(
      `Rubrique(s) absente(s) de cette base : ${manquantes.join(', ')}.\n` +
        'L’arborescence se pose avec « npm run seed:taxonomy », où elle est versionnée.\n' +
        'Aucun rangement : la moitié des packs seraient rangés, l’autre non.',
    )
    process.exitCode = 1
    return
  }

  const produits = await prisma.product.findMany({
    select: { id: true, name: true, categories: { select: { categoryId: true } } },
    orderBy: { name: 'asc' },
  })

  type Lien = { productId: string; categoryId: string }
  const aPoser: Lien[] = []
  const parRubrique = new Map<string, number>()
  let dejaLa = 0
  let sansRegle = 0

  for (const produit of produits) {
    const rubrique = rubriquePour(produit.name)
    if (!rubrique) {
      sansRegle += 1
      continue
    }

    const categoryId = idParSlug.get(rubrique)!
    if (produit.categories.some((c) => c.categoryId === categoryId)) {
      dejaLa += 1
      continue
    }

    aPoser.push({ productId: produit.id, categoryId })
    parRubrique.set(rubrique, (parRubrique.get(rubrique) ?? 0) + 1)
  }

  console.log(`Produits examinés : ${produits.length}`)
  console.log(`  à ranger : ${aPoser.length}   déjà rangés : ${dejaLa}   hors règles : ${sansRegle}`)

  if (aPoser.length > 0) {
    console.log('\nPar rubrique :')
    for (const regle of REGLES_RUBRIQUE) {
      const nombre = parRubrique.get(regle.rubrique) ?? 0
      if (nombre > 0) console.log(`  ${regle.rubrique.padEnd(18)} ${nombre}`)
    }
  }

  if (essai) {
    console.log('\nESSAI — rien n’a été écrit.')
    return
  }

  let faits = 0
  for (let i = 0; i < aPoser.length; i += PAQUET) {
    const paquet = aPoser.slice(i, i + PAQUET)
    /*
      `createMany` avec `skipDuplicates` plutôt qu'une série d'upserts : la clé
      primaire est le couple (produit, rubrique), un doublon est donc impossible
      et une relance ne fait rien. C'est ce qui rend la commande rejouable.
    */
    await prisma.productCategory.createMany({ data: paquet, skipDuplicates: true })
    faits += paquet.length
    process.stdout.write(`\r  écrits : ${faits} / ${aPoser.length}`)
  }

  if (aPoser.length > 0) process.stdout.write('\n')
  console.log(`\n${faits} rattachement(s) posé(s). Aucun n’a été retiré.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
