import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Référentiel véhicule — voitures.
 *
 * Les marques, modèles et générations automobiles viennent de
 * `prisma/vehicles-cars.json`, relevé sur les pages de marque de ledperf.com.
 * Les deux-roues restent écrits à la main dans `scripts/seed-vehicles.ts` :
 * les deux sources ne se recouvrent pas, et ce script ne touche **jamais** une
 * marque de type `MOTORCYCLE`.
 *
 * **Ce script n'écrit aucune compatibilité**, pour la même raison que
 * `seed-vehicles.ts` : qu'une Golf VII existe est un fait, qu'une ampoule
 * donnée l'éclaire correctement est une affirmation commerciale. Les deux ne
 * s'importent pas ensemble.
 *
 * **Ce que valent les millésimes.** Ils viennent d'un revendeur, pas d'un
 * référentiel constructeur. Ils situent une génération ; ils ne font pas foi.
 * Chaque génération porte l'URL de la page d'où elle vient, pour qu'une borne
 * douteuse soit vérifiable plutôt qu'à croire. **À reprendre sur une source
 * constructeur avant d'attacher la moindre compatibilité.**
 *
 * Deux modes, et la différence est entière :
 *
 * - **Sans drapeau**, le script est additif et idempotent. Il crée ce qui
 *   manque, met à jour libellés, phases et millésimes, et ne supprime rien. Il
 *   se contente de **dénombrer** ce que le jeu de données ne couvre plus.
 * - **Avec `--remplacer`**, il supprime en plus les modèles et générations
 *   automobiles absents du jeu de données — l'ancienne arborescence écrite à la
 *   main, dont les slugs diffèrent et qui ferait doublon.
 *
 * Le remplacement est **refusé** dès qu'une finition, une configuration ou une
 * compatibilité dépend de ce qui serait supprimé. La cascade du schéma va de
 * `VehicleGeneration` à `VehicleTrim` et `VehicleConfiguration`, puis à
 * `Fitment` et `FitmentAccessory` : une suppression emporterait des
 * compatibilités sans le dire. Mieux vaut s'arrêter et le signaler.
 *
 * `active` et `logoMediaId` ne sont jamais touchés : la visibilité et le logo
 * appartiennent au back-office.
 *
 *   npm run import:vehicles-cars              → additif, ne supprime rien
 *   npm run import:vehicles-cars -- --remplacer → remplace l'arborescence auto
 */

type Generation = {
  slug: string
  name: string
  phase: string | null
  yearFrom: number
  yearTo: number | null
  source: string
}
type Model = { slug: string; name: string; generations: Generation[] }
type Make = { slug: string; name: string; ledperfName: string; models: Model[] }
type Jeu = { _source: string; _releve: string; _avertissement: string; makes: Make[] }

const remplacer = process.argv.includes('--remplacer')

async function main() {
  const fichier = path.join(process.cwd(), 'prisma', 'vehicles-cars.json')
  const jeu: Jeu = JSON.parse(await readFile(fichier, 'utf8'))

  console.log(`→ Référentiel voitures — relevé du ${jeu._releve}`)
  console.log(`  source : ${jeu._source}`)
  console.log(`  ${jeu.makes.length} marques au jeu de données`)

  let marquesCreees = 0
  let modelesCrees = 0
  let generationsCreees = 0

  /** Identifiants conservés, pour savoir ce qui ne l'est pas. */
  const modelesTenus = new Set<string>()
  const generationsTenues = new Set<string>()

  for (const make of jeu.makes) {
    const existante = await prisma.vehicleMake.findUnique({
      where: { slug: make.slug },
      select: { id: true, type: true },
    })

    if (existante && existante.type !== 'CAR') {
      // Un slug de marque est unique tous types confondus. Écraser le type
      // d'une marque moto ferait disparaître un parcours deux-roues entier.
      console.warn(`  ! ${make.slug} : déjà en base en ${existante.type}, ignorée`)
      continue
    }

    const marque = existante
      ? await prisma.vehicleMake.update({
          // Ni `active` ni `logoMediaId` : ils sont au back-office.
          where: { id: existante.id },
          data: { name: make.name },
        })
      : await prisma.vehicleMake.create({
          data: { slug: make.slug, name: make.name, type: 'CAR' },
        })
    if (!existante) marquesCreees += 1

    for (const model of make.models) {
      const modeleExistant = await prisma.vehicleModel.findUnique({
        where: { makeId_slug: { makeId: marque.id, slug: model.slug } },
        select: { id: true },
      })
      const modele = modeleExistant
        ? await prisma.vehicleModel.update({
            where: { id: modeleExistant.id },
            data: { name: model.name },
          })
        : await prisma.vehicleModel.create({
            data: { makeId: marque.id, slug: model.slug, name: model.name },
          })
      if (!modeleExistant) modelesCrees += 1
      modelesTenus.add(modele.id)

      await prisma.$transaction(
        model.generations.map((generation) => {
          const donnees = {
            name: generation.name,
            phase: generation.phase,
            yearFrom: generation.yearFrom,
            yearTo: generation.yearTo,
          }
          return prisma.vehicleGeneration.upsert({
            where: { modelId_slug: { modelId: modele.id, slug: generation.slug } },
            update: donnees,
            create: { modelId: modele.id, slug: generation.slug, ...donnees },
          })
        }),
      )

      const gens = await prisma.vehicleGeneration.findMany({
        where: { modelId: modele.id },
        select: { id: true, slug: true },
      })
      const voulus = new Set(model.generations.map((g) => g.slug))
      for (const g of gens) if (voulus.has(g.slug)) generationsTenues.add(g.id)
      generationsCreees += model.generations.length
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Ce que le jeu de données ne couvre plus.                               */

  const modelesAuto = await prisma.vehicleModel.findMany({
    where: { make: { type: 'CAR' } },
    select: { id: true, slug: true, make: { select: { slug: true } } },
  })
  const generationsAuto = await prisma.vehicleGeneration.findMany({
    where: { model: { make: { type: 'CAR' } } },
    select: { id: true, slug: true, model: { select: { slug: true } } },
  })

  const modelesCaducs = modelesAuto.filter((m) => !modelesTenus.has(m.id))
  const generationsCaduques = generationsAuto.filter((g) => !generationsTenues.has(g.id))

  console.log(
    `  ${marquesCreees} marque(s), ${modelesCrees} modèle(s) et ` +
      `${generationsCreees} génération(s) écrites.`,
  )

  if (modelesCaducs.length === 0 && generationsCaduques.length === 0) {
    console.log('  Rien à retirer : la base correspond au jeu de données.')
  } else {
    console.log(
      `  Hors jeu de données : ${modelesCaducs.length} modèle(s), ` +
        `${generationsCaduques.length} génération(s).`,
    )

    // Tout ce qui dépendrait d'une suppression, avant de supprimer.
    const idsCaduques = generationsCaduques.map((g) => g.id)
    const [finitions, configurations] = await Promise.all([
      prisma.vehicleTrim.count({ where: { generationId: { in: idsCaduques } } }),
      prisma.vehicleConfiguration.count({ where: { generationId: { in: idsCaduques } } }),
    ])
    const compatibilites = await prisma.fitment.count({
      where: { configuration: { generationId: { in: idsCaduques } } },
    })

    if (!remplacer) {
      console.log('  Rien n’est supprimé sans --remplacer.')
    } else if (finitions + configurations + compatibilites > 0) {
      console.error(
        `  REFUS de remplacer : ${finitions} finition(s), ${configurations} ` +
          `configuration(s) et ${compatibilites} compatibilité(s) en dépendent. ` +
          'La cascade les emporterait sans le dire. Reprendre ces rattachements ' +
          'sur la nouvelle arborescence, puis relancer.',
      )
      process.exitCode = 1
    } else {
      const g = await prisma.vehicleGeneration.deleteMany({ where: { id: { in: idsCaduques } } })
      const m = await prisma.vehicleModel.deleteMany({
        where: { id: { in: modelesCaducs.map((x) => x.id) } },
      })
      console.log(`  Retiré : ${m.count} modèle(s), ${g.count} génération(s).`)
    }
  }

  const [marques, modeles, generations, fitments] = await Promise.all([
    prisma.vehicleMake.count({ where: { type: 'CAR' } }),
    prisma.vehicleModel.count({ where: { make: { type: 'CAR' } } }),
    prisma.vehicleGeneration.count({ where: { model: { make: { type: 'CAR' } } } }),
    prisma.fitment.count(),
  ])
  console.log(
    `  En base (voitures) : ${marques} marques, ${modeles} modèles, ` +
      `${generations} générations. ${fitments} compatibilité(s) — inchangé.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
