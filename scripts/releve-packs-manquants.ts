import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { parseCsv } from '../src/lib/imports/csv'
import { POSITION_PAR_TYPE, cleDuDossier, meilleurRang } from '../src/lib/admin/photos-suivi'
import {
  POSITIONS,
  type Position,
  nomDuPack,
  prixCatalogue,
  skuDuPack,
  slugDuPack,
} from '../src/lib/admin/packs-manquants'

const prisma = new PrismaClient()

/**
 * Relève les packs que le premier relevé a sautés.
 *
 * Mercedes-Benz avait ses 62 générations en base et pas un seul pack : le
 * parcours du revendeur qui a produit `packs-vehicule.json` a manqué la marque
 * entière. Ailleurs, ce sont des positions oubliées sur des véhicules déjà
 * servis. Le suivi photo, issu d'un parcours du même revendeur fait autrement,
 * les voit : un produit qui nomme à la fois ce véhicule et cette position
 * atteste que la position existe sur ce véhicule — la même preuve, et la seule,
 * que le premier relevé s'était donnée.
 *
 * Quatre partis pris :
 *
 * 1. **Un fichier à part.** Le complément a sa provenance, le relevé d'origine
 *    la sienne. Les mêler dans un même `_source` ferait passer deux parcours
 *    différents pour un seul.
 *
 * 2. **Rien n'est créé ici.** Cette commande écrit un fichier, que
 *    `import:packs-vehicule -- --jeu` importe ensuite. Relever et créer sont
 *    deux gestes, et le fichier se relit entre les deux.
 *
 * 3. **Le véhicule doit déjà exister.** On ne crée ni marque, ni modèle, ni
 *    génération : une voiture inventée depuis un nom de dossier serait une
 *    compatibilité affirmée sans preuve.
 *
 * 4. **Pas de prix inventé.** Les prix viennent des correspondances déjà
 *    tranchées ; les rares exceptions sont déclarées en toutes lettres dans
 *    `lib/admin/packs-manquants.ts`. Sans prix, le pack est écarté et compté.
 *
 * 5. **Aucun slug déjà pris.** Le relevé d'origine a posé sur la Peugeot 206+
 *    et la Ford Ka+ les slugs qui reviennent à la 206 et à la Ka : son
 *    générateur perdait le « plus ». Créer le pack de la 206 avec ce slug ne
 *    créerait rien — l'import, qui cherche par slug, renommerait la fiche de la
 *    206+. Ces packs sont donc écartés et nommés, à charge de corriger les
 *    fiches fautives avant de les relever.
 *
 *   npm run packs:manquants              → écrit le complément
 *   npm run packs:manquants -- --suivi <chemin>
 */

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const cheminSuivi =
  option('--suivi') ?? path.join(os.homedir(), 'Desktop', 'Image ledvroom.com', 'suivi.csv')
const SORTIE = path.join('prisma', 'packs-vehicule-complement.json')

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
  image: string | null
  priceSourceCents: number
}

async function main() {
  // ---- Le relevé d'origine : ce qui existe, et les prix déjà tranchés ------
  const origine = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'packs-vehicule.json'), 'utf8'),
  ) as { packs: Pack[] }

  const existants = new Set(origine.packs.map((p) => `${p.make}|${p.generation}|${p.position}`))
  const precedents = new Map<number, number>()
  for (const p of origine.packs) {
    if (p.priceSourceCents) precedents.set(p.priceSourceCents, p.priceCents)
  }
  console.log(`Relevé d'origine : ${origine.packs.length} packs, ${precedents.size} prix déjà tranchés.`)

  // ---- L'arbre des véhicules ----------------------------------------------
  const generations = await prisma.vehicleGeneration.findMany({
    select: {
      slug: true,
      name: true,
      model: { select: { slug: true, make: { select: { slug: true, name: true } } } },
    },
  })
  type Generation = (typeof generations)[number]
  const parVehicule = new Map<string, Generation>(
    generations.map((g) => [`${g.model.make.slug}|${g.slug}`, g]),
  )
  console.log(`Arbre des véhicules : ${generations.length} générations.`)

  /*
    Les slugs déjà pris, lus en base plutôt que dans le relevé : c'est la base
    qui arbitre, et elle contient aussi les produits saisis à la main.
  */
  const prisEnBase = new Set(
    (await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug),
  )

  // ---- Le suivi photo ------------------------------------------------------
  const table = parseCsv(await readFile(cheminSuivi, 'utf8'), ';')
  const col = (nom: string) => table.headers.indexOf(nom)
  const [iRang, iType, iDossier, iPrix, iUrl] = ['rang', 'type', 'dossier', 'prix', 'url'].map(col)
  if ([iRang, iType, iDossier, iPrix, iUrl].some((i) => i < 0)) {
    console.error(`Colonnes attendues absentes de ${cheminSuivi}.`)
    process.exitCode = 1
    return
  }

  type Ligne = { rang: string; type: string; dossier: string; statut: string; prix: string; url: string }
  const lignes: Ligne[] = table.rows.map((r) => ({
    rang: r[iRang] ?? '',
    type: r[iType] ?? '',
    dossier: r[iDossier] ?? '',
    statut: '',
    prix: r[iPrix] ?? '',
    url: r[iUrl] ?? '',
  }))

  // ---- Ce qui manque -------------------------------------------------------
  const groupes = new Map<string, { position: Position; vehicule: string; lignes: Ligne[] }>()
  const ecarts = { familleAbsente: 0, vehiculeAbsent: 0, dejaLa: 0, cheminIllisible: 0 }

  for (const ligne of lignes) {
    const position = POSITION_PAR_TYPE[ligne.type] as Position | undefined
    if (!position) {
      ecarts.familleAbsente += 1
      continue
    }
    const cle = cleDuDossier(ligne.dossier)
    if (!cle) {
      ecarts.cheminIllisible += 1
      continue
    }
    const vehicule = `${cle.marque}|${cle.generation}`
    if (existants.has(`${vehicule}|${position}`)) {
      ecarts.dejaLa += 1
      continue
    }
    if (!parVehicule.has(vehicule)) {
      ecarts.vehiculeAbsent += 1
      continue
    }
    const k = `${vehicule}|${position}`
    const groupe = groupes.get(k)
    if (groupe) groupe.lignes.push(ligne)
    else groupes.set(k, { position, vehicule, lignes: [ligne] })
  }

  // ---- Fabrication ---------------------------------------------------------
  const packs: Pack[] = []
  const sansPrix: { nom: string; prix: number }[] = []
  const slugPris: { slug: string; nom: string }[] = []
  const vus = new Set<string>()

  for (const { position, vehicule, lignes: l } of groupes.values()) {
    const meilleure = meilleurRang(l)
    if (!meilleure) continue
    const g = parVehicule.get(vehicule)!
    const marque = g.model.make.slug
    const vehicleLabel = `${g.model.make.name} ${g.name}`
    const sourceCents = Math.round(Number(meilleure.prix) * 100)
    const prix = Number.isFinite(sourceCents) ? prixCatalogue(sourceCents, precedents) : null

    if (prix === null) {
      sansPrix.push({ nom: nomDuPack(position, vehicleLabel), prix: sourceCents })
      continue
    }

    const slug = slugDuPack(position, marque, g.slug)
    if (prisEnBase.has(slug) || vus.has(slug)) {
      slugPris.push({ slug, nom: nomDuPack(position, vehicleLabel) })
      continue
    }
    vus.add(slug)

    packs.push({
      make: marque,
      model: g.model.slug,
      generation: g.slug,
      source: position,
      position,
      name: nomDuPack(position, vehicleLabel),
      slug,
      sku: skuDuPack(position, marque, g.slug),
      priceCents: prix,
      vehicleLabel,
      positionLabel: POSITIONS[position].label,
      sourcePage: meilleure.url,
      // Aucune vignette : celles du revendeur portent son filigrane, et ces
      // fiches recevront nos propres photos.
      image: null,
      priceSourceCents: sourceCents,
    })
  }

  packs.sort((a, b) => a.slug.localeCompare(b.slug))

  const doublons = packs.length - new Set(packs.map((p) => p.sku)).size
  if (doublons > 0) {
    console.error(`${doublons} SKU en double : rien n'est écrit.`)
    process.exitCode = 1
    return
  }

  const jeu = {
    _source:
      "Positions relevees sur les fiches produit de ledperf.com, partenaire, via le suivi photo : un produit nommant a la fois ce vehicule et cette position atteste que la position existe sur ce vehicule.",
    _releve: new Date().toISOString().slice(0, 10),
    _avertissement:
      "Complement de packs-vehicule.json, dont le parcours avait saute des marques entieres. Aucun vehicule n'est cree ici : seules les generations deja en base sont servies. Les prix reprennent les correspondances deja tranchees.",
    packs,
  }

  await writeFile(path.join(process.cwd(), SORTIE), JSON.stringify(jeu, null, 2) + '\n', 'utf8')

  const parMarque = new Map<string, number>()
  for (const p of packs) parMarque.set(p.make, (parMarque.get(p.make) ?? 0) + 1)

  console.log(`\n${packs.length} pack(s) manquant(s) relevés → ${SORTIE}`)
  for (const [marque, n] of [...parMarque].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${marque.padEnd(18)} ${n}`)
  }
  console.log('\nÉcartés :')
  console.log(`  famille que le catalogue ne vend pas : ${ecarts.familleAbsente}`)
  console.log(`  pack déjà existant                   : ${ecarts.dejaLa}`)
  console.log(`  véhicule absent de la base           : ${ecarts.vehiculeAbsent}`)
  if (ecarts.cheminIllisible) console.log(`  chemin illisible : ${ecarts.cheminIllisible}`)
  if (slugPris.length > 0) {
    console.log(`\n${slugPris.length} pack(s) écartés : leur slug est déjà pris.`)
    for (const s of slugPris) console.log(`  ${s.slug}  (${s.nom})`)
    console.log(
      'Une fiche existante occupe ce slug — souvent une variante « + » dont le relevé' +
        "\nd'origine avait perdu le suffixe. À corriger au back-office avant de relever.",
    )
  }
  if (sansPrix.length > 0) {
    console.log(`\n${sansPrix.length} pack(s) écartés faute de prix :`)
    for (const s of sansPrix.slice(0, 10)) {
      console.log(`  ${(s.prix / 100).toFixed(2)} €  ${s.nom}`)
    }
    console.log('Déclarez ces prix dans lib/admin/packs-manquants.ts, puis relancez.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
