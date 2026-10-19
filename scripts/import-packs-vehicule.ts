import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Packs par véhicule.
 *
 * Un produit par couple (génération, position) : « Pack LED antibrouillards
 * pour Audi A3 8V ». C'est la forme que prend un catalogue d'éclairage indexé
 * sur le véhicule plutôt que sur le culot.
 *
 * **D'où vient la liste.** Des pages de génération d'un revendeur partenaire :
 * qu'il vende un produit nommant à la fois ce véhicule et cette position
 * atteste que la position existe sur ce véhicule. C'est tout ce qu'on en tire,
 * et c'est peu — mais c'est vérifiable et ça ne suppose rien.
 *
 * **Le statut des compatibilités est UNKNOWN, et c'est volontaire.** Le schéma
 * réserve `CONFIRMED` à une compatibilité « vérifiée et datée » ; aucune de ces
 * lignes ne l'est. Avec `UNKNOWN`, le site affiche bien le pack sur la page du
 * véhicule, mais sans le bandeau vert « la configuration pour votre A3 8V » et
 * en mettant la vérification en action principale plutôt que l'achat. C'est à
 * l'exploitant de basculer en `CONFIRMED` les packs qu'il a vérifiés et dont il
 * connaît le contenu.
 *
 * **L'équipement d'origine n'est pas connu.** Une configuration exige un
 * équipement, et le vocabulaire en propose trois — halogène, xénon, LED. En
 * choisir un reviendrait à affirmer de quoi le véhicule est équipé. On crée
 * donc une entrée « non précisé », et une configuration par génération. Le jour
 * où l'équipement est documenté, les configurations précises s'ajoutent à côté
 * sans rien casser.
 *
 * **Ces packs n'ont pas de composants.** Ce sont des produits simples : ce qui
 * entre dans le carton est décidé à la préparation, par celui qui connaît le
 * culot du véhicule. Le jour où les applications véhicule sont disponibles, ils
 * deviendront des produits composés (`KIT` + `KitComponent`) et leur stock
 * découlera de leurs composants.
 *
 *   npm run import:packs-vehicule                        → tout le jeu
 *   npm run import:packs-vehicule -- --vehicule audi/a3-8v → un seul véhicule
 *   npm run import:packs-vehicule -- --remplacer         → réécrit les prix posés
 */

type Pack = {
  make: string
  model: string
  generation: string
  source: string
  position: string
  name: string
  slug: string
  sku: string
  priceCents: number
  vehicleLabel: string
  positionLabel: string
  sourcePage: string
}
type Jeu = { _source: string; _releve: string; _avertissement: string; packs: Pack[] }

const remplacer = process.argv.includes('--remplacer')
const filtre = (() => {
  const i = process.argv.indexOf('--vehicule')
  return i >= 0 ? process.argv[i + 1] : null
})()

/** Équipement neutre : on ne sait pas de quoi le véhicule est équipé. */
const EQUIPEMENT_NEUTRE = {
  code: 'NON_PRECISE',
  label: "Équipement d'origine non précisé",
  hint: "L'équipement de ce véhicule n'a pas été relevé : les packs ci-dessous ne distinguent pas halogène, xénon ou LED d'origine.",
}

function corps(pack: Pack): string {
  return (
    `Pack d'éclairage LED pour les ${pack.positionLabel} de votre ${pack.vehicleLabel}.\n\n` +
    `**Compatibilité à vérifier avant commande.** Ce pack est répertorié pour ce ` +
    `véhicule, mais son contenu exact n'a pas encore été établi emplacement par ` +
    `emplacement. Relevez le culot inscrit sur l'ampoule que vous déposez, ou ` +
    `demandez-nous une vérification : nous préférons un contrôle de plus à un ` +
    `démontage pour rien.\n\n` +
    `**Ce que couvre ce pack** : les ${pack.positionLabel}, et elles seules. ` +
    `Les autres emplacements de votre véhicule ont leur propre pack.\n`
  )
}

async function main() {
  const jeu: Jeu = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'packs-vehicule.json'), 'utf8'),
  )

  const tva = await prisma.vatRate.findUnique({ where: { code: 'FR_STANDARD' } })
  if (!tva) {
    console.error("Taux « FR_STANDARD » absent. Lancez d'abord : npm run seed")
    process.exitCode = 1
    return
  }

  const equipement = await prisma.lightingEquipment.upsert({
    where: { code: EQUIPEMENT_NEUTRE.code },
    update: { label: EQUIPEMENT_NEUTRE.label, hint: EQUIPEMENT_NEUTRE.hint },
    create: EQUIPEMENT_NEUTRE,
  })

  const retenus = filtre
    ? jeu.packs.filter((p) => `${p.make}/${p.generation}` === filtre)
    : jeu.packs
  console.log(`→ Packs par véhicule — relevé du ${jeu._releve}`)
  console.log(`  ${retenus.length} pack(s)${filtre ? ` pour ${filtre}` : ''} sur ${jeu.packs.length}`)
  if (retenus.length === 0) {
    console.error('  Aucun pack ne correspond — vérifiez le filtre.')
    process.exitCode = 1
    return
  }

  /* Positions du projet, lues une fois. */
  const positions = new Map(
    (await prisma.lightPosition.findMany()).map((p) => [p.code, p]),
  )
  if (positions.size === 0) {
    console.error("Aucune position d'éclairage en base. Lancez d'abord : npm run seed")
    process.exitCode = 1
    return
  }

  const configurations = new Map<string, string>()
  let crees = 0
  let majs = 0
  const soucis: string[] = []

  for (const pack of retenus) {
    const position = positions.get(pack.position)
    if (!position) {
      soucis.push(`${pack.name} — position « ${pack.position} » inconnue`)
      continue
    }

    const generation = await prisma.vehicleGeneration.findFirst({
      where: {
        slug: pack.generation,
        model: { slug: pack.model, make: { slug: pack.make } },
      },
      select: { id: true },
    })
    if (!generation) {
      soucis.push(`${pack.name} — génération absente du référentiel`)
      continue
    }

    let configurationId = configurations.get(generation.id)
    if (!configurationId) {
      const existante = await prisma.vehicleConfiguration.findFirst({
        where: { generationId: generation.id, equipmentId: equipement.id, trimId: null },
        select: { id: true },
      })
      configurationId =
        existante?.id ??
        (
          await prisma.vehicleConfiguration.create({
            data: { generationId: generation.id, equipmentId: equipement.id },
          })
        ).id
      configurations.set(generation.id, configurationId)
    }

    const donnees = {
      name: pack.name,
      tagline: `Pour les ${pack.positionLabel} de votre ${pack.vehicleLabel}`,
      description: `Pack LED pour les ${pack.positionLabel} de ${pack.vehicleLabel}. Compatibilité à vérifier avant commande.`,
      body: corps(pack),
      status: 'PUBLISHED' as const,
      vehicleType: 'CAR' as const,
      metaTitle: `${pack.name} — LUMERA`,
      metaDescription: `Pack LED pour les ${pack.positionLabel} de ${pack.vehicleLabel}. Compatibilité à vérifier avant commande.`.slice(0, 158),
      publishedAt: new Date(),
    }

    const existant = await prisma.product.findUnique({ where: { slug: pack.slug } })
    const produit = existant
      ? await prisma.product.update({ where: { id: existant.id }, data: donnees })
      : await prisma.product.create({ data: { slug: pack.slug, ...donnees } })
    existant ? (majs += 1) : (crees += 1)

    const variante = await prisma.productVariant.findUnique({ where: { sku: pack.sku } })
    const variantId = variante
      ? (
          await prisma.productVariant.update({
            where: { id: variante.id },
            data: remplacer
              ? { productId: produit.id, name: pack.name, priceCents: pack.priceCents, vatRateId: tva.id }
              : { productId: produit.id, name: pack.name },
          })
        ).id
      : (
          await prisma.productVariant.create({
            data: {
              productId: produit.id,
              sku: pack.sku,
              name: pack.name,
              packaging: 'KIT',
              priceCents: pack.priceCents,
              vatRateId: tva.id,
            },
          })
        ).id

    /*
      `UNKNOWN` : la position est attestée pour ce véhicule, le contenu du pack
      ne l'est pas. Le site affichera donc le pack sans affirmer qu'il convient.
    */
    const fitment = await prisma.fitment.findFirst({
      where: { configurationId, positionId: position.id, variantId },
      select: { id: true, status: true },
    })
    if (!fitment) {
      await prisma.fitment.create({
        data: { configurationId, positionId: position.id, variantId, status: 'UNKNOWN', quantity: 1 },
      })
    }
  }

  console.log(`\n  ${crees} créé(s), ${majs} mis à jour.`)
  for (const s of soucis.slice(0, 15)) console.log(`  ! ${s}`)
  if (soucis.length > 15) console.log(`  … et ${soucis.length - 15} autres.`)

  const [packs, compat, confirmes] = await Promise.all([
    prisma.product.count({ where: { slug: { startsWith: 'pack-led-' } } }),
    prisma.fitment.count(),
    prisma.fitment.count({ where: { status: 'CONFIRMED' } }),
  ])
  console.log(
    `  En base : ${packs} pack(s), ${compat} compatibilité(s) dont ${confirmes} confirmée(s).`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
