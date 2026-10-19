import { PrismaClient, type VehicleType } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Référentiel véhicule : marques, modèles, générations.
 *
 * **Ce script n'écrit aucune compatibilité.** C'est la distinction qui tient
 * tout le fichier, et elle mérite d'être comprise avant d'y toucher.
 *
 * Une marque, un modèle, une génération sont des faits publics : la Golf VII
 * existe, elle a été produite de 2012 à 2020, et l'écrire n'engage personne.
 * Dire qu'une ampoule donnée l'éclaire correctement est un tout autre acte :
 * c'est une affirmation commerciale, vérifiable, et dont dépend l'achat du
 * client. Les deux ne se seedent pas ensemble.
 *
 * Conséquence directe et voulue : après ce script, une page de génération
 * annonce « aucun éclairage documenté ». C'est exact. Tant que personne n'a
 * relevé les compatibilités de ce véhicule, il n'y a rien à en dire — et une
 * arborescence qui se remplirait toute seule de correspondances plausibles
 * serait pire que vide, parce qu'elle aurait l'air renseignée.
 *
 * **Ce que valent les millésimes.** Ils viennent de connaissances générales,
 * pas d'un référentiel constructeur ni d'une base TecDoc. Ils situent une
 * génération ; ils ne font pas foi. Tant qu'aucune compatibilité n'y est
 * rattachée, une borne approximative n'induit personne en erreur — au pire le
 * client ne trouve pas son millésime. **À reprendre sur une source
 * constructeur avant d'attacher la moindre compatibilité à ces générations.**
 *
 * Le script est **idempotent** : il crée ce qui manque, met à jour les
 * libellés et les millésimes, et ne supprime ni ne désactive rien. Une entrée
 * retirée de ce fichier reste en base — c'est au back-office de la désactiver.
 *
 * Lancement : `npm run seed:vehicles-motos`
 */

type Generation = {
  slug: string
  name: string
  yearFrom: number
  /** Nul si la génération est toujours produite. */
  yearTo?: number
  phase?: string
}

type Model = { slug: string; name: string; generations: Generation[] }
type Make = { slug: string; name: string; type: VehicleType; models: Model[] }

/*
  `VehicleMake.slug` est unique sur toute la table, types confondus. Honda,
  Suzuki et BMW vendent des voitures ET des deux-roues : leurs entrées moto
  portent donc un slug distinct. Le nom affiché, lui, reste le nom de la
  marque — c'est le type qui les sépare dans l'interface, pas le libellé.
*/

/*
  Les voitures ne sont plus ici. Elles viennent de
  `prisma/vehicles-cars.json`, importe par `npm run import:vehicles-cars` :
  47 marques, 858 modeles, 1111 generations, releves sur les pages de marque
  d'un revendeur et porteuses chacune de l'URL d'ou elles viennent.

  Les deux-roues restent ecrits a la main ci-dessous : aucune source
  equivalente n'a ete relevee pour eux, et quinze modeles tenus a la main
  valent mieux qu'un import approximatif.

  Les deux sources ne se recouvrent pas — ce script ne touche que
  `MOTORCYCLE`, l'import ne touche que `CAR` — pour qu'aucune des deux ne
  puisse ressusciter l'arborescence de l'autre en doublon.
*/

const DEUX_ROUES: Make[] = [
  {
    slug: 'aprilia', name: 'Aprilia', type: 'MOTORCYCLE',
    models: [
      { slug: 'rs-660', name: 'RS 660', generations: [{ slug: 'rs-660-i', name: 'RS 660', yearFrom: 2020 }] },
      { slug: 'tuono-660', name: 'Tuono 660', generations: [{ slug: 'tuono-660-i', name: 'Tuono 660', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'bmw-motorrad', name: 'BMW', type: 'MOTORCYCLE',
    models: [
      { slug: 'r-1250-gs', name: 'R 1250 GS', generations: [{ slug: 'r-1250-gs-i', name: 'R 1250 GS', yearFrom: 2018 }] },
      { slug: 's-1000-rr', name: 'S 1000 RR', generations: [{ slug: 's-1000-rr-ii', name: 'S 1000 RR', yearFrom: 2019 }] },
    ],
  },
  {
    slug: 'ducati', name: 'Ducati', type: 'MOTORCYCLE',
    models: [
      { slug: 'monster', name: 'Monster', generations: [{ slug: 'monster-937', name: 'Monster 937', yearFrom: 2021 }] },
      { slug: 'multistrada', name: 'Multistrada', generations: [{ slug: 'multistrada-v4', name: 'Multistrada V4', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'honda-moto', name: 'Honda', type: 'MOTORCYCLE',
    models: [
      { slug: 'cb500f', name: 'CB500F', generations: [{ slug: 'cb500f-i', name: 'CB500F', yearFrom: 2013 }] },
      { slug: 'cb650r', name: 'CB650R', generations: [{ slug: 'cb650r-i', name: 'CB650R', yearFrom: 2019 }] },
      { slug: 'africa-twin', name: 'Africa Twin', generations: [{ slug: 'africa-twin-crf1100', name: 'CRF1100L Africa Twin', yearFrom: 2020 }] },
      { slug: 'pcx-125', name: 'PCX 125', generations: [{ slug: 'pcx-125-i', name: 'PCX 125', yearFrom: 2010 }] },
    ],
  },
  {
    slug: 'kawasaki', name: 'Kawasaki', type: 'MOTORCYCLE',
    models: [
      { slug: 'z650', name: 'Z650', generations: [{ slug: 'z650-i', name: 'Z650', yearFrom: 2017 }] },
      { slug: 'z900', name: 'Z900', generations: [{ slug: 'z900-i', name: 'Z900', yearFrom: 2017 }] },
      { slug: 'ninja-400', name: 'Ninja 400', generations: [{ slug: 'ninja-400-i', name: 'Ninja 400', yearFrom: 2018 }] },
    ],
  },
  {
    slug: 'ktm', name: 'KTM', type: 'MOTORCYCLE',
    models: [
      { slug: 'duke-390', name: '390 Duke', generations: [{ slug: 'duke-390-i', name: '390 Duke', yearFrom: 2013 }] },
      { slug: 'adventure-890', name: '890 Adventure', generations: [{ slug: 'adventure-890-i', name: '890 Adventure', yearFrom: 2021 }] },
    ],
  },
  {
    slug: 'piaggio', name: 'Piaggio', type: 'MOTORCYCLE',
    models: [
      { slug: 'vespa-primavera', name: 'Vespa Primavera', generations: [{ slug: 'vespa-primavera-i', name: 'Vespa Primavera', yearFrom: 2014 }] },
      { slug: 'mp3', name: 'MP3', generations: [{ slug: 'mp3-iii', name: 'MP3', yearFrom: 2006 }] },
    ],
  },
  {
    slug: 'suzuki-moto', name: 'Suzuki', type: 'MOTORCYCLE',
    models: [
      { slug: 'gsx-r-750', name: 'GSX-R 750', generations: [{ slug: 'gsx-r-750-l1', name: 'GSX-R 750 (L1)', yearFrom: 2011 }] },
      { slug: 'v-strom-650', name: 'V-Strom 650', generations: [{ slug: 'v-strom-650-ii', name: 'V-Strom 650', yearFrom: 2017 }] },
    ],
  },
  {
    slug: 'triumph', name: 'Triumph', type: 'MOTORCYCLE',
    models: [
      { slug: 'street-triple', name: 'Street Triple', generations: [{ slug: 'street-triple-765', name: 'Street Triple 765', yearFrom: 2017 }] },
      { slug: 'tiger-900', name: 'Tiger 900', generations: [{ slug: 'tiger-900-i', name: 'Tiger 900', yearFrom: 2020 }] },
    ],
  },
  {
    slug: 'yamaha', name: 'Yamaha', type: 'MOTORCYCLE',
    models: [
      { slug: 'mt-07', name: 'MT-07', generations: [{ slug: 'mt-07-i', name: 'MT-07', yearFrom: 2014 }] },
      { slug: 'mt-09', name: 'MT-09', generations: [{ slug: 'mt-09-i', name: 'MT-09', yearFrom: 2013 }] },
      { slug: 'tracer-900', name: 'Tracer 900', generations: [{ slug: 'tracer-900-i', name: 'Tracer 900', yearFrom: 2015 }] },
      { slug: 'tmax', name: 'TMAX', generations: [{ slug: 'tmax-560', name: 'TMAX 560', yearFrom: 2020 }] },
    ],
  },
]

async function semerMarque(make: Make) {
  const existante = await prisma.vehicleMake.findUnique({ where: { slug: make.slug }, select: { id: true } })

  const enregistree = existante
    ? await prisma.vehicleMake.update({
        // `active` et `logoMediaId` ne sont pas touchés : la visibilité et le
        // logo se règlent en back-office, pas au seed.
        where: { id: existante.id },
        data: { name: make.name, type: make.type },
      })
    : await prisma.vehicleMake.create({ data: { slug: make.slug, name: make.name, type: make.type } })

  let modelesCrees = 0
  let generationsCreees = 0

  for (const model of make.models) {
    const modeleExistant = await prisma.vehicleModel.findUnique({
      where: { makeId_slug: { makeId: enregistree.id, slug: model.slug } },
      select: { id: true },
    })

    const modele = modeleExistant
      ? await prisma.vehicleModel.update({ where: { id: modeleExistant.id }, data: { name: model.name } })
      : await prisma.vehicleModel.create({ data: { makeId: enregistree.id, slug: model.slug, name: model.name } })

    if (!modeleExistant) modelesCrees += 1

    for (const generation of model.generations) {
      const generationExistante = await prisma.vehicleGeneration.findUnique({
        where: { modelId_slug: { modelId: modele.id, slug: generation.slug } },
        select: { id: true },
      })

      const donnees = {
        name: generation.name,
        yearFrom: generation.yearFrom,
        yearTo: generation.yearTo ?? null,
        phase: generation.phase ?? null,
      }

      if (generationExistante) {
        await prisma.vehicleGeneration.update({ where: { id: generationExistante.id }, data: donnees })
      } else {
        await prisma.vehicleGeneration.create({ data: { modelId: modele.id, slug: generation.slug, ...donnees } })
        generationsCreees += 1
      }
    }
  }

  return { creee: !existante, modelesCrees, generationsCreees }
}

async function main() {
  console.log('→ Référentiel véhicule — deux-roues')

  let marques = 0
  let modeles = 0
  let generations = 0

  for (const make of DEUX_ROUES) {
    const bilan = await semerMarque(make)
    if (bilan.creee) marques += 1
    modeles += bilan.modelesCrees
    generations += bilan.generationsCreees
    console.log(
      `  ${bilan.creee ? '+' : '·'} ${make.name}` +
        (bilan.modelesCrees || bilan.generationsCreees
          ? ` — ${bilan.modelesCrees} modèle(s), ${bilan.generationsCreees} génération(s)`
          : ''),
    )
  }

  const [totalMarques, totalModeles, totalGenerations, compatibilites] = await Promise.all([
    prisma.vehicleMake.count(),
    prisma.vehicleModel.count(),
    prisma.vehicleGeneration.count(),
    prisma.fitment.count(),
  ])

  console.log(
    `\n  ${marques} marque(s), ${modeles} modèle(s), ${generations} génération(s) créées.` +
      `\n  En base : ${totalMarques} marques, ${totalModeles} modèles, ${totalGenerations} générations.`,
  )
  console.log(
    `\n  ${compatibilites} compatibilité(s) en base — ce script n'en écrit aucune.` +
      `\n  Une génération sans compatibilité affiche « aucun éclairage documenté », et c'est exact.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
