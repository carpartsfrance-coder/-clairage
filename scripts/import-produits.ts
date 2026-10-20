import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient, type Packaging, type ProductStatus, type VehicleType } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Catalogue initial — les 32 références de la première commande.
 *
 * Deux fichiers, et la séparation est volontaire :
 *
 *   `prisma/produits-initiaux.json`  — les faits : culot, type, température,
 *     exigences, conditionnement, rubrique. Ils viennent de la demande de devis
 *     de l'exploitant, pas d'un tiers.
 *   `prisma/produits-redaction.json` — le rédactionnel : accroche, description,
 *     corps, titres et descriptions de référencement, et le SKU. **Écrit pour
 *     ce catalogue**, à partir des faits ci-dessus. Aucun texte n'est repris
 *     d'un autre site : un texte dérivé resterait celui de son auteur, et deux
 *     boutiques au contenu jumeau se pénalisent mutuellement au référencement.
 *
 * **Les prix sont provisoires.** Ils ont été relevés chez un revendeur qui
 * s'approvisionne ailleurs : ils ne reflètent aucun coût d'achat et devront
 * être repris au retour du devis fournisseur. Le script les écrit sans les
 * défendre — il le dit, c'est tout.
 *
 * **Aucune compatibilité n'est créée ici.** Elle a son propre script, et son
 * propre engagement : dire qu'une ampoule éclaire un véhicule donné est une
 * affirmation commerciale, pas une caractéristique de produit.
 *
 * Le script exige le taux de TVA et refuse de tourner sans : un prix TTC sans
 * taux ne se décompose pas, et la fiche afficherait un HT faux.
 *
 *   npm run import:produits                → ne remplace ni visuel ni prix posé
 *   npm run import:produits -- --remplacer → remplace, en le disant
 */

type Fait = {
  ref: string
  slug: string
  name: string
  bulbBase: string | null
  alsoKnownAs: string | null
  type: string
  colour: string | null
  colorTemperature: number | null
  requirements: string | null
  unit: string
  category: string
  vehicleType: VehicleType
  priceCents: number | null
  image: string | null
  sourceRef: string | null
  sourcePage: string[]
}
type Redaction = {
  sku: string
  /**
   * Nom commercial français. Celui de la demande de devis est en anglais, et
   * écrit pour un fournisseur : « H11 halogen bulb, xenon-look super white »
   * n'a pas sa place sur une fiche client.
   */
  name: string
  tagline: string
  description: string
  body: string
  metaTitle: string
  metaDescription: string
}

const remplacer = process.argv.includes('--remplacer')
const AGENT = 'LumeraCatalogImport/1.0 (+https://lumera-web.onrender.com)'
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** « pairs » dans la demande de devis vaut une paire ; le reste à l'unité. */
function conditionnement(unit: string): Packaging {
  return unit.trim().toLowerCase().startsWith('pair') ? 'PAIR' : 'UNIT'
}

/**
 * Corps de fiche : le rédactionnel, puis un relevé des caractéristiques.
 * Le relevé est reconstruit à chaque passage — c'est une table de faits, pas
 * un texte que quelqu'un aurait retouché à la main.
 */
function corps(fait: Fait, red: Redaction): string {
  const lignes: Array<[string, string | null]> = [
    ['Culot', fait.bulbBase],
    ['Autres désignations', fait.alsoKnownAs],
    ['Technologie', fait.type],
    ['Teinte', fait.colour],
    ['Exigences', fait.requirements],
    ['Conditionnement', conditionnement(fait.unit) === 'PAIR' ? 'Vendu par paire' : "Vendu à l'unité"],
  ]
  const releve = lignes
    .filter(([, v]) => v)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n')
  return `${red.body}\n\n## Caractéristiques\n\n| | |\n| --- | --- |\n${releve}\n`
}

async function visuel(fait: Fait, red: Redaction, produitId: string): Promise<'posé' | 'déjà posé' | 'aucun' | string> {
  if (!fait.image) return 'aucun'

  const existant = await prisma.productMedia.findFirst({ where: { productId: produitId } })
  if (existant && !remplacer) return 'déjà posé'

  let bytes: Buffer
  try {
    const r = await fetch(fait.image, { headers: { 'User-Agent': AGENT } })
    if (!r.ok) return `visuel HTTP ${r.status}`
    bytes = Buffer.from(await r.arrayBuffer())
  } catch (error) {
    return `visuel : ${(error as Error).message}`
  }

  const controle = await inspectUpload(new File([new Uint8Array(bytes)], path.basename(fait.image)))
  if (!controle.ok) return `visuel : ${controle.error}`

  // Même déduplication que pour les logos : l'empreinte est dans la clé.
  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  let media = await prisma.media.findFirst({
    where: { storageKey: { endsWith: `-${empreinte}.${controle.extension}` } },
  })
  if (!media) {
    const depose = await putFile({
      bytes: controle.bytes,
      mimeType: controle.mimeType,
      extension: controle.extension,
      prefix: 'produits',
    })
    media = await prisma.media.create({
      data: {
        storageKey: depose.key,
        url: depose.url,
        mimeType: depose.mimeType,
        sizeBytes: depose.sizeBytes,
        alt: red.name,
        // Voir `import-vehicle-photos.ts` : pas d'URL source en légende, la
        // fiche produit les affiche. Elle reste dans le jeu de données.
        caption: null,
        nature: 'UNSPECIFIED',
      },
    })
  }

  await prisma.productMedia.upsert({
    where: { productId_mediaId_role: { productId: produitId, mediaId: media.id, role: 'PRODUCT' } },
    update: { position: 0 },
    create: { productId: produitId, mediaId: media.id, role: 'PRODUCT', position: 0 },
  })
  return existant ? 'posé' : 'posé'
}

async function main() {
  const etat = storageStatus()
  if (!etat.ok) {
    console.error(`Stockage « ${etat.driver} » inutilisable : ${etat.problem}`)
    process.exitCode = 1
    return
  }

  const tva = await prisma.vatRate.findUnique({ where: { code: 'FR_STANDARD' } })
  if (!tva) {
    console.error(
      "Taux de TVA « FR_STANDARD » absent. Un prix TTC sans taux ne se décompose pas, " +
        "et la fiche afficherait un HT faux.\n  Lancez d'abord : npm run seed",
    )
    process.exitCode = 1
    return
  }

  const racine = path.join(process.cwd(), 'prisma')
  const faits: { produits: Fait[]; _avertissement: string } = JSON.parse(
    await readFile(path.join(racine, 'produits-initiaux.json'), 'utf8'),
  )
  const redaction: { fiches: Record<string, Redaction> } = JSON.parse(
    await readFile(path.join(racine, 'produits-redaction.json'), 'utf8'),
  )

  console.log(`→ Catalogue initial — ${faits.produits.length} références, stockage « ${etat.driver} »`)

  let crees = 0
  let majs = 0
  const soucis: string[] = []

  for (const fait of faits.produits) {
    const red = redaction.fiches[fait.ref]
    if (!red) {
      soucis.push(`${fait.name} — aucun rédactionnel`)
      continue
    }
    if (fait.priceCents == null) {
      soucis.push(`${fait.name} — aucun prix, ignoré`)
      continue
    }

    const categorie = await prisma.category.findUnique({ where: { slug: fait.category } })
    if (!categorie) {
      soucis.push(`${fait.name} — rubrique « ${fait.category} » absente`)
      continue
    }

    const donnees = {
      name: red.name,
      tagline: red.tagline,
      description: red.description,
      body: corps(fait, red),
      status: 'PUBLISHED' as ProductStatus,
      vehicleType: fait.vehicleType,
      colorTemperature: fait.colorTemperature,
      bulbBase: fait.bulbBase,
      metaTitle: red.metaTitle,
      metaDescription: red.metaDescription,
      publishedAt: new Date(),
    }

    const existant = await prisma.product.findUnique({ where: { slug: fait.slug } })
    const produit = existant
      ? await prisma.product.update({ where: { id: existant.id }, data: donnees })
      : await prisma.product.create({ data: { slug: fait.slug, ...donnees } })
    existant ? (majs += 1) : (crees += 1)

    // Une déclinaison par référence : ces produits n'ont pas de variante.
    const variante = await prisma.productVariant.findUnique({ where: { sku: red.sku } })
    const prix = { priceCents: fait.priceCents, vatRateId: tva.id }
    if (variante) {
      // Un prix posé n'est pas réécrit sans le dire : il a pu être corrigé
      // au back-office depuis l'import.
      await prisma.productVariant.update({
        where: { id: variante.id },
        data: remplacer
          ? { productId: produit.id, name: red.name, packaging: conditionnement(fait.unit), ...prix }
          : { productId: produit.id, name: red.name, packaging: conditionnement(fait.unit) },
      })
    } else {
      await prisma.productVariant.create({
        data: {
          productId: produit.id,
          sku: red.sku,
          name: red.name,
          packaging: conditionnement(fait.unit),
          ...prix,
        },
      })
    }

    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId: produit.id, categoryId: categorie.id } },
      update: {},
      create: { productId: produit.id, categoryId: categorie.id },
    })

    const vis = await visuel(fait, red, produit.id)
    if (!['posé', 'déjà posé', 'aucun'].includes(vis)) soucis.push(`${fait.name} — ${vis}`)

    console.log(`  ${existant ? '·' : '+'} ${red.sku.padEnd(14)} ${red.name}`)
    await pause(150)
  }

  console.log(`\n  ${crees} créé(s), ${majs} mis à jour.`)
  for (const s of soucis) console.log(`  ! ${s}`)

  const [produits, publies, variantes, sansVisuel] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: 'PUBLISHED' } }),
    prisma.productVariant.count(),
    prisma.product.count({ where: { media: { none: {} } } }),
  ])
  console.log(
    `  En base : ${produits} produit(s) dont ${publies} publié(s), ${variantes} déclinaison(s), ` +
      `${sansVisuel} sans visuel.`,
  )
  console.log('  Aucune compatibilité créée — elle a son propre script.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
