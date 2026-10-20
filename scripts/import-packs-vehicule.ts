import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

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
  /** Vignette du pack correspondant chez le revendeur partenaire. */
  image: string | null
}
type Jeu = { _source: string; _releve: string; _avertissement: string; packs: Pack[] }

const remplacer = process.argv.includes('--remplacer')

/*
  `--sans-media` : n'ouvre aucun dépôt de fichier.

  Les visuels vivent dans un stockage objet dont les identifiants ne sont
  connus que de l'instance Render. Lancé depuis un poste, ce script écrirait
  donc les fichiers sur le disque local et enregistrerait des URL `/uploads/…`
  dans la base de production — des médias pointant vers des fichiers que le
  site ne sert pas. C'est arrivé une fois, ça ne doit pas se reproduire par
  distraction.

  Avec ce drapeau, le script ne touche qu'au texte et aux prix. Les visuels
  déjà rattachés restent en place. C'est ce qui permet de régénérer un
  rédactionnel depuis un poste sans détenir la clé du stockage.
*/
const sansMedia = process.argv.includes('--sans-media')

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

const AGENT = 'LumeraPackImport/1.0 (+https://lumera-web.onrender.com)'
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Dépose la vignette du pack et la rattache au produit.
 *
 * Même chaîne que pour les logos et les visuels de génération : vérification
 * du contenu par `inspectUpload`, dépôt par la couche de stockage, et
 * réutilisation d'un dépôt identique grâce à l'empreinte portée par la clé —
 * beaucoup de packs partagent le même visuel d'un véhicule à l'autre.
 */
async function vignette(prisma: PrismaClient, url: string, alt: string): Promise<string | null> {
  let bytes: Buffer
  try {
    const r = await fetch(url, { headers: { 'User-Agent': AGENT } })
    if (!r.ok) return null
    bytes = Buffer.from(await r.arrayBuffer())
  } catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) return null

  const controle = await inspectUpload(new File([new Uint8Array(bytes)], path.basename(url)))
  if (!controle.ok) return null

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const existant = await prisma.media.findFirst({
    where: { storageKey: { endsWith: `-${empreinte}.${controle.extension}` } },
  })
  if (existant) return existant.id

  const depose = await putFile({
    bytes: controle.bytes,
    mimeType: controle.mimeType,
    extension: controle.extension,
    prefix: 'packs',
  })
  const media = await prisma.media.create({
    data: {
      storageKey: depose.key,
      url: depose.url,
      mimeType: depose.mimeType,
      sizeBytes: depose.sizeBytes,
      alt,
      // Voir `import-vehicle-photos.ts` : la fiche affiche les légendes, la
      // traçabilité reste dans `prisma/packs-vehicule.json`.
      caption: null,
      nature: 'UNSPECIFIED',
    },
  })
  return media.id
}

/**
 * Ce qu'il y a à dire sur chaque emplacement.
 *
 * Un texte par position plutôt qu'un paragraphe unique décliné 9866 fois :
 * un plafonnier et un phare ne posent pas les mêmes questions, et deux mille
 * fiches au mot près identique ne servent ni le lecteur ni le référencement.
 */
const NOTES: Record<string, { quoi: string; savoir: string }> = {
  LOW_BEAM: {
    quoi: "Les ampoules de feux de croisement, celles qui éclairent en permanence dès la nuit tombée.",
    savoir:
      "Le faisceau d'un phare est dessiné autour de la position exacte du filament d'origine. Une ampoule de remplacement doit s'y substituer au millimètre, sinon la coupure se déplace : trop haut elle éblouit, trop bas elle n'éclaire plus. **Vérifiez le réglage en hauteur après le montage.**",
  },
  HIGH_BEAM: {
    quoi: "Les ampoules de feux de route, pour les portions sans circulation en face.",
    savoir:
      "Le feu de route s'allume par intermittence : la contrainte thermique y est moindre qu'en croisement, et la LED y est dans son meilleur emploi.",
  },
  FOG: {
    quoi: "Les ampoules d'antibrouillards avant.",
    savoir:
      "Un antibrouillard se loge dans le pare-chocs, un emplacement confiné et exposé aux projections. **Contrôlez l'étanchéité du cache arrière** avant de refermer : c'est par là que l'eau entre.",
  },
  PLATE: {
    quoi: "L'éclairage de plaque d'immatriculation.",
    savoir:
      "La plaque doit rester lisible de nuit : c'est une obligation, et un éclairage grillé se remarque au contrôle technique. **La lumière doit rester blanche** — une teinte bleutée n'est pas conforme.",
  },
  REVERSE: {
    quoi: "Les ampoules de feux de recul.",
    savoir:
      "C'est l'éclairage le plus négligé d'une voiture, et souvent le plus utile : de nuit, dans un parking, c'est lui qui montre ce qu'il y a derrière. Une caméra de recul y gagne autant que l'œil.",
  },
  SIDELIGHT: {
    quoi: "Les veilleuses, ces petites lumières qui restent allumées avec les phares.",
    savoir:
      "Elles sont le plus souvent à côté du feu de croisement, dans le même bloc : une veilleuse blanche à côté d'un croisement jauni se voit immédiatement. **Les deux se changent ensemble**, sous peine de souligner l'écart.",
  },
  TURN_FRONT: {
    quoi: "Les clignotants.",
    savoir:
      "Une LED consomme trop peu pour la centrale d'origine, qui croit l'ampoule grillée et **double la cadence**. Ce pack intègre ce qu'il faut pour l'éviter. La couleur orange, elle, vient de la LED et non d'un cabochon teinté : un vernis se décolore en quelques saisons.",
  },
  INTERIOR_DOME: {
    quoi: "L'éclairage intérieur — plafonnier, liseuses, coffre, boîte à gants selon les emplacements du véhicule.",
    savoir:
      "C'est le changement le plus visible au quotidien, et le plus simple à faire soi-même. **Remplacez toutes les ampoules en même temps** : une neuve à côté d'une ancienne souligne la différence de teinte plus qu'elle n'améliore l'habitacle.",
  },
  DRL: {
    quoi: "Les feux de jour, allumés en permanence à la mise en route.",
    savoir:
      "Ils fonctionnent toute la journée : la consommation et la durée de vie y comptent davantage qu'ailleurs. La LED atteint sa pleine intensité instantanément, ce qu'une ampoule à filament ne fait pas.",
  },
}

function corps(pack: Pack): string {
  const note = NOTES[pack.position] ?? {
    quoi: `Les ampoules pour les ${pack.positionLabel}.`,
    savoir: '',
  }
  const morceaux = [
    `Pack d'éclairage LED composé pour la ${pack.vehicleLabel}. ${note.quoi}`,
    note.savoir,
    `## Ce que couvre ce pack\n\nLes ${pack.positionLabel}, et rien d'autre. Les autres emplacements de votre ${pack.vehicleLabel} ont chacun le leur — vous les retrouvez sur la page du véhicule.`,
    `## Avant de commander\n\nCe pack est composé pour cette génération précise. Si votre véhicule a reçu un bloc optique différent de celui monté en sortie d'usine, dites-le-nous : nous préférons une vérification de plus à un démontage pour rien.`,
  ]
  return morceaux.filter(Boolean).join('\n\n') + '\n'
}

async function main() {
  const jeu: Jeu = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'packs-vehicule.json'), 'utf8'),
  )

  const stock = storageStatus()
  if (!stock.ok && !sansMedia) {
    console.error(`Stockage « ${stock.driver} » inutilisable : ${stock.problem}`)
    process.exitCode = 1
    return
  }

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
  console.log(
    `→ Packs par véhicule — relevé du ${jeu._releve}` + (sansMedia ? ' · sans dépôt de média' : ''),
  )
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
      select: { id: true, photoMediaId: true },
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
      Vignette : la photo de la génération.

      Le vocabulaire des rôles n'en a pas pour « photo du véhicule », et
      l'affichage ne lit que `PRODUCT` : on prend donc celui-là. Montrer la
      voiture plutôt qu'un carré vide est d'autant plus juste ici que le
      contenu du carton n'est pas encore figé — il n'y a pas de photo du
      produit à montrer. Le média garde en texte alternatif le nom du véhicule,
      pour que personne ne prenne la voiture pour l'article vendu.
    */
    const deja = await prisma.productMedia.count({ where: { productId: produit.id } })
    if (!sansMedia && (deja === 0 || remplacer)) {
      // La vignette du pack d'abord, la photo du vehicule ensuite : l'une
      // montre l'article, l'autre dit pour quelle voiture il est.
      const visuels: Array<{ mediaId: string; position: number }> = []
      if (pack.image) {
        const id = await vignette(prisma, pack.image, pack.name)
        if (id) visuels.push({ mediaId: id, position: 0 })
        else soucis.push(`${pack.name} — vignette inaccessible`)
      }
      if (generation.photoMediaId) {
        visuels.push({ mediaId: generation.photoMediaId, position: visuels.length })
      }
      for (const v of visuels) {
        await prisma.productMedia.upsert({
          where: {
            productId_mediaId_role: { productId: produit.id, mediaId: v.mediaId, role: 'PRODUCT' },
          },
          update: { position: v.position },
          create: { productId: produit.id, mediaId: v.mediaId, role: 'PRODUCT', position: v.position },
        })
      }
      if (pack.image) await pause(120)
    }

    /*
      `CONFIRMED`, sur décision de l'exploitant.

      Ce qui fonde l'affirmation : le pack porte le nom d'un véhicule précis et
      c'est l'exploitant qui le compose pour lui, comme le fait le revendeur
      partenaire dont la gamme a servi à établir la liste. Ce n'est pas une
      déduction du script — c'est un engagement commercial, pris en connaissance
      de cause après que le statut `UNKNOWN` ait été posé puis discuté.

      Conséquence à l'écran : le client qui a renseigné son véhicule voit le
      bandeau « la configuration pour votre … » et l'ajout au panier en action
      principale, au lieu de « faire vérifier mon véhicule ».

      Un pack dont le contenu se révélerait inadapté se corrige ici ou au
      back-office, en repassant la ligne à `UNKNOWN` ou `INCOMPATIBLE`.
    */
    const fitment = await prisma.fitment.findFirst({
      where: { configurationId, positionId: position.id, variantId },
      select: { id: true, status: true },
    })
    if (fitment && remplacer && fitment.status !== 'CONFIRMED') {
      await prisma.fitment.update({ where: { id: fitment.id }, data: { status: 'CONFIRMED' } })
    }
    if (!fitment) {
      await prisma.fitment.create({
        data: { configurationId, positionId: position.id, variantId, status: 'CONFIRMED', quantity: 1 },
      })
    }
  }

  console.log(`\n  ${crees} créé(s), ${majs} mis à jour.`)
  for (const s of soucis.slice(0, 15)) console.log(`  ! ${s}`)
  if (soucis.length > 15) console.log(`  … et ${soucis.length - 15} autres.`)

  const [packs, compat, confirmes, sansVisuel] = await Promise.all([
    prisma.product.count({ where: { slug: { startsWith: 'pack-led-' } } }),
    prisma.fitment.count(),
    prisma.fitment.count({ where: { status: 'CONFIRMED' } }),
    prisma.product.count({ where: { slug: { startsWith: 'pack-led-' }, media: { none: {} } } }),
  ])
  console.log(
    `  En base : ${packs} pack(s) dont ${sansVisuel} sans visuel, ` +
      `${compat} compatibilité(s) dont ${confirmes} confirmée(s).`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
