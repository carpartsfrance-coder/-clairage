import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Porte à un minimum le stock des conditionnements vendus en ligne.
 *
 * Un catalogue entier à zéro affiche « Indisponible » partout : la fiche
 * remplace le bouton d'achat par un formulaire de réapprovisionnement, et la
 * boutique ne peut rien vendre. Cette commande donne un plancher aux
 * références en ligne.
 *
 * Quatre partis pris :
 *
 * 1. **Rien n'est jamais abaissé.** Seuls les conditionnements sous le
 *    plancher montent ; ceux qui ont déjà du stock sont laissés tels quels et
 *    comptés à part. Un « tout à 1 » écraserait un stock réel — en
 *    développement, six références en portent de 41 à 296. Perdre un
 *    inventaire pour uniformiser une vitrine serait un mauvais échange, et
 *    c'est irréversible : le stock d'avant n'est écrit nulle part ailleurs.
 *
 * 2. **Chaque écriture laisse un mouvement.** C'est la règle que le
 *    back-office s'impose à lui-même (`admin-product-purchase.ts`) : « un stock
 *    changé sans mouvement est un inventaire inexplicable ». Le motif est
 *    `import`, celui que le schéma réserve aux écritures faites par du code, et
 *    la référence nomme la commande, pour qu'on sache d'où vient la ligne.
 *
 * 3. **Les kits sont écartés.** Leur disponibilité se calcule depuis leurs
 *    composants (`availabilityForKit`) ; leur poser un stock propre ne changerait
 *    rien à ce que voit le client et ferait mentir la fiche.
 *
 * 4. **Les réservations sont respectées.** Le vendable est
 *    `stockOnHand - stockReserved` ; le plancher porte sur le vendable, pas sur
 *    le stock physique, sans quoi une référence réservée resterait affichée
 *    indisponible après la commande.
 *
 *   npm run stock:minimum -- --essai        n'écrit rien, dit ce qu'il ferait
 *   npm run stock:minimum                   porte le vendable à 1
 *   npm run stock:minimum -- --valeur 3     ... à 3
 */

const essai = process.argv.includes('--essai')

const indexValeur = process.argv.indexOf('--valeur')
const PLANCHER = indexValeur === -1 ? 1 : Number(process.argv[indexValeur + 1])

/** Par paquets : neuf mille transactions d'une ligne, c'est neuf mille allers-retours. */
const PAQUET = 500

async function main() {
  if (!Number.isInteger(PLANCHER) || PLANCHER < 1) {
    console.error('--valeur attend un entier positif.')
    process.exitCode = 1
    return
  }

  const base = {
    product: { status: 'PUBLISHED' as const },
    active: true,
    // Un kit n'a pas de stock propre : il le tient de ses composants.
    components: { none: {} },
  }

  const candidats = await prisma.productVariant.findMany({
    where: base,
    select: { id: true, sku: true, stockOnHand: true, stockReserved: true },
    orderBy: { sku: 'asc' },
  })

  const aMonter = candidats.filter((v) => v.stockOnHand - v.stockReserved < PLANCHER)
  const dejaBon = candidats.length - aMonter.length
  const kits = await prisma.productVariant.count({
    where: { product: { status: 'PUBLISHED' }, active: true, components: { some: {} } },
  })

  console.log(
    `Conditionnements actifs de produits en ligne : ${candidats.length}` +
      ` (+ ${kits} kit${kits > 1 ? 's' : ''}, écarté${kits > 1 ? 's' : ''}).`,
  )
  console.log(`Plancher demandé : ${PLANCHER} vendable${PLANCHER > 1 ? 's' : ''}.`)
  console.log(`  à monter : ${aMonter.length}   déjà au-dessus, laissés tels quels : ${dejaBon}`)

  if (essai) {
    const exemples = aMonter.slice(0, 5)
    if (exemples.length > 0) {
      console.log('\nExemples de ce qui monterait :')
      for (const v of exemples) {
        const cible = PLANCHER + v.stockReserved
        console.log(`  ${v.sku.padEnd(24)} ${v.stockOnHand} → ${cible}  (réservé ${v.stockReserved})`)
      }
    }
    console.log('\nESSAI — rien n’a été écrit.')
    return
  }

  let faits = 0
  for (let i = 0; i < aMonter.length; i += PAQUET) {
    const paquet = aMonter.slice(i, i + PAQUET)

    /*
      Le stock et son mouvement s'écrivent ensemble, par paquet. Si la
      transaction échoue, ni l'un ni l'autre n'est écrit : pas de stock sans
      trace, pas de trace sans stock.
    */
    await prisma.$transaction(
      paquet.flatMap((v) => {
        // On vise le VENDABLE : ce qui est réservé s'ajoute au stock physique.
        const cible = PLANCHER + v.stockReserved
        const delta = cible - v.stockOnHand
        return [
          prisma.productVariant.update({ where: { id: v.id }, data: { stockOnHand: cible } }),
          prisma.stockMovement.create({
            data: { variantId: v.id, delta, reason: 'import', reference: 'stock:minimum' },
          }),
        ]
      }),
    )

    faits += paquet.length
    process.stdout.write(`\r  écrits : ${faits} / ${aMonter.length}`)
  }

  if (aMonter.length > 0) process.stdout.write('\n')
  console.log(`\nStock porté à ${PLANCHER} vendable(s) sur ${faits} conditionnement(s).`)
  console.log(`${dejaBon} étaient déjà au-dessus et n'ont pas été touchés.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
