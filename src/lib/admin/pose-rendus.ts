import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { driverName, inspectUpload, putFile } from '../storage/driver'
import {
  VUES,
  cleDuDossier,
  colonnesSuivi,
  familleDuType,
  meilleurRang,
  type LignePhoto,
} from './photos-suivi'
import { parseCsv } from '../imports/csv'
import { estEffetXenon } from '../effet-xenon'

/**
 * Pose des trois rendus LEDVROOM sur les fiches du catalogue.
 *
 * Ce module est le cœur commun de deux commandes : `photos:produits`, qui ne
 * pose que les images, et `publier`, qui pose les images **puis** publie les
 * fiches. Les deux doivent rapprocher les dossiers et les fiches exactement de
 * la même façon : tenir deux fois la même règle finirait par donner deux
 * résultats, et c'est la pose d'une photo sur la mauvaise voiture qu'on ne veut
 * jamais risquer. La règle de rapprochement elle-même vit un cran plus loin,
 * dans `photos-suivi.ts`, et est couverte par ses tests.
 *
 * Les partis pris, repris du script d'origine :
 *
 * 1. **Une correspondance exacte, ou rien.** Aucun rapprochement par
 *    ressemblance de titres. Le pont est `prisma/packs-vehicule.json`, le relevé
 *    qui a créé les packs : il donne, pour un triplet marque / génération /
 *    position, le slug exact de la fiche. On ne devine pas, on relit.
 *
 * 2. **Rôle « rendu », nature « illustration ».** Ces images sont fabriquées,
 *    pas photographiées, et la galerie l'annonce au client.
 *
 * 3. **La vignette du catalogue devient le gros plan** — premier élément de
 *    `VUES`, donc première image de la fiche.
 *
 * 4. **Rien n'est détaché.** Les visuels déjà en place restent ; un `RESULT`
 *    étranger descend après les nôtres au lieu de disparaître.
 *
 * 5. **Un seul jeu par fiche.** Le revendeur partenaire sépare ce que le
 *    catalogue réunit — restylé et non-restylé, blanc xénon et blanc pur. On
 *    garde le jeu du meilleur rang, c'est-à-dire du produit le plus vendu.
 */

export type Pack = {
  make: string
  generation: string
  position: string
  slug: string
  positionLabel: string
  vehicleLabel: string
}

/** Les relevés qui donnent le slug d'une fiche. Le second est facultatif. */
export const RELEVES = [
  path.join('prisma', 'packs-vehicule.json'),
  path.join('prisma', 'packs-vehicule-complement.json'),
]

/**
 * Le pont marque / génération / position → fiche, lu dans les deux relevés.
 *
 * Les deux, pas seulement le premier : le complément porte les packs que le
 * parcours d'origine avait sautés — Mercedes-Benz en entier. N'en lire qu'un
 * laisserait leurs photos sans fiche alors que les fiches existent.
 */
export async function lireReleves(
  racineDepot: string,
  journal: (ligne: string) => void = () => {},
): Promise<Map<string, Pack>> {
  const parCle = new Map<string, Pack>()
  for (const fichier of RELEVES) {
    let brut: string
    try {
      brut = await readFile(path.join(racineDepot, fichier), 'utf8')
    } catch {
      // Le complément peut ne pas exister : ce n'est pas une erreur.
      continue
    }
    const releve = JSON.parse(brut) as { packs: Pack[] }
    for (const pack of releve.packs) {
      parCle.set(`${pack.make}|${pack.generation}|${pack.position}`, pack)
    }
    journal(`Relevé lu : ${fichier} (${releve.packs.length} packs)`)
  }
  return parCle
}

export type Ligne = LignePhoto

/**
 * Lecture d'un fichier de suivi ou d'une liste de produits à publier.
 *
 * Les deux formats sont acceptés — voir `colonnesSuivi`. Quand le fichier porte
 * une colonne `statut`, seules les lignes « fait » sont retenues : un jeu de
 * photos en cours de production n'a rien à poser. Sans cette colonne, toutes
 * les lignes comptent, puisque le fichier ne liste alors que ce qui est prêt.
 */
export function lireSuivi(contenu: string): { lignes: Ligne[]; total: number } | null {
  const table = parseCsv(contenu, ';')
  const colonnes = colonnesSuivi(table.headers)
  if (!colonnes) return null

  const toutes: Ligne[] = table.rows.map((row) => ({
    rang: row[colonnes.rang] ?? '',
    type: row[colonnes.type] ?? '',
    dossier: row[colonnes.dossier] ?? '',
    statut: colonnes.statut >= 0 ? (row[colonnes.statut] ?? '') : 'fait',
  }))

  return { lignes: toutes.filter((ligne) => ligne.statut === 'fait'), total: toutes.length }
}

export type Retenu = { pack: Pack; ligne: Ligne; concurrents: number }

export type Refus = {
  typeInconnu: number
  cheminIllisible: number
  aucunPack: number
  /** De quoi nommer précisément ce qui n'a pas été retrouvé. */
  details: Array<{ ligne: Ligne; motif: string }>
}

/**
 * Apparie des lignes de suivi aux fiches du catalogue.
 *
 * Une ligne refusée est comptée **et** décrite : « 7 lignes non appariées »
 * n'apprend rien à qui doit corriger le fichier, alors que le véhicule et la
 * clé cherchée disent tout de suite si c'est le dossier qui est mal nommé ou
 * le véhicule qui manque au catalogue.
 */
export function apparier(
  lignes: Ligne[],
  parCle: Map<string, Pack>,
): { retenus: Retenu[]; refus: Refus; apparieesBrutes: number } {
  const refus: Refus = { typeInconnu: 0, cheminIllisible: 0, aucunPack: 0, details: [] }
  const parSlug = new Map<string, { pack: Pack; lignes: Ligne[] }>()
  let apparieesBrutes = 0

  for (const ligne of lignes) {
    const position = familleDuType(ligne.type)
    if (!position) {
      refus.typeInconnu += 1
      refus.details.push({ ligne, motif: `famille inconnue : « ${ligne.type} »` })
      continue
    }
    const cle = cleDuDossier(ligne.dossier)
    if (!cle) {
      refus.cheminIllisible += 1
      refus.details.push({ ligne, motif: 'chemin illisible' })
      continue
    }
    const pack = parCle.get(`${cle.marque}|${cle.generation}|${position}`)
    if (!pack) {
      refus.aucunPack += 1
      refus.details.push({
        ligne,
        motif: `aucune fiche pour ${cle.marque} / ${cle.generation} / ${position}`,
      })
      continue
    }

    apparieesBrutes += 1
    const entree = parSlug.get(pack.slug)
    if (entree) entree.lignes.push(ligne)
    else parSlug.set(pack.slug, { pack, lignes: [ligne] })
  }

  const retenus = [...parSlug.values()]
    .map(({ pack, lignes: candidates }) => ({
      pack,
      ligne: meilleurRang(candidates),
      concurrents: candidates.length - 1,
    }))
    .filter((entree): entree is Retenu => entree.ligne !== null)
    .sort((a, b) => Number(a.ligne.rang) - Number(b.ligne.rang))

  return { retenus, refus, apparieesBrutes }
}

/* -------------------------------------------------------------------------- */

/** Le serveur et la base visés, sans les identifiants. */
export function baseVisee(): string {
  const brut = process.env.DATABASE_URL
  if (!brut) return '(DATABASE_URL absente)'
  try {
    const url = new URL(brut)
    return `${url.hostname}${url.pathname}`
  } catch {
    return '(DATABASE_URL illisible)'
  }
}

/**
 * Le stockage doit être celui de la base visée.
 *
 * Rien, dans DATABASE_URL et MEDIA_DRIVER, n'oblige les deux à désigner le même
 * environnement. Déposer sur le disque d'un poste puis enregistrer en base des
 * URL `/uploads/…` que la production ne sert pas remplirait des centaines de
 * fiches de carrés vides, sans la moindre erreur au passage.
 */
export async function attelageCoherent(
  prisma: PrismaClient,
  erreur: (ligne: string) => void = console.error,
): Promise<boolean> {
  const temoin = await prisma.media.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { url: true },
  })
  if (!temoin) return true
  const baseEnLocal = temoin.url.startsWith('/uploads/')
  const pilote = driverName()
  if (baseEnLocal === (pilote === 'local')) return true
  erreur(
    `Stockage « ${pilote} » et base ne vont pas ensemble.\n` +
      `Les médias déjà enregistrés sont servis depuis ${baseEnLocal ? 'le disque local (/uploads/…)' : 'un stockage objet'}, ` +
      `alors que ce pilote écrirait ${pilote === 'local' ? 'sur le disque local' : 'dans un stockage objet'}.\n` +
      'Aucune photo déposée : elles pointeraient vers des fichiers absents de cet environnement.',
  )
  return false
}

/**
 * Dépose une image, ou retrouve celle déjà déposée.
 *
 * La clé de stockage porte l'empreinte du contenu : un même fichier redéposé se
 * retrouve par son empreinte au lieu d'être téléversé une seconde fois. C'est
 * ce qui rend la commande rejouable sans gonfler le stockage.
 */
async function deposer(
  prisma: PrismaClient,
  chemin: string,
  alt: string,
  legende: string,
  prefixe: string,
  essai: boolean,
) {
  const octets = await readFile(chemin)
  const controle = await inspectUpload(new File([new Uint8Array(octets)], path.basename(chemin)))
  if (!controle.ok) return { erreur: controle.error as string }

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const suffixe = `-${empreinte}.${controle.extension}`
  const existant = await prisma.media.findFirst({ where: { storageKey: { endsWith: suffixe } } })

  if (existant) {
    // Le fichier fait foi, sa description aussi : sans cette remise à niveau,
    // corriger un alt obligerait à repasser par le back-office.
    const aCorriger =
      existant.alt !== alt || existant.caption !== legende || existant.nature !== 'ILLUSTRATION'
    if (aCorriger && !essai) {
      return {
        media: await prisma.media.update({
          where: { id: existant.id },
          data: { alt, caption: legende, nature: 'ILLUSTRATION' },
        }),
      }
    }
    return { media: existant }
  }

  if (essai) return { aDeposer: controle.bytes.length }

  const depose = await putFile({
    bytes: controle.bytes,
    mimeType: controle.mimeType,
    extension: controle.extension,
    prefix: prefixe,
  })
  return {
    media: await prisma.media.create({
      data: {
        storageKey: depose.key,
        url: depose.url,
        mimeType: depose.mimeType,
        sizeBytes: depose.sizeBytes,
        alt,
        caption: legende,
        nature: 'ILLUSTRATION',
      },
    }),
  }
}

export type ComptePose = {
  posees: number
  fichesFaites: number
  sansFichier: number
  sansFiche: number
  refusees: number
  /** Fiches dont les trois rendus sont en place : celles qu'on peut publier. */
  slugsPourvus: string[]
}

/**
 * Pose les trois rendus sur chaque fiche retenue.
 *
 * Une transaction par fiche : les trois vues arrivent ensemble ou pas du tout.
 * Une fiche qui n'aurait que le comparatif, sans le gros plan, raconterait
 * l'histoire à moitié — et c'est le gros plan qui part en vignette partout.
 */
export async function poseRendus(options: {
  prisma: PrismaClient
  racinePhotos: string
  retenus: Retenu[]
  essai: boolean
  journal?: (ligne: string) => void
  avancement?: (faites: number) => void
}): Promise<ComptePose> {
  const { prisma, racinePhotos, retenus, essai } = options
  const journal = options.journal ?? (() => {})

  const compte: ComptePose = {
    posees: 0,
    fichesFaites: 0,
    sansFichier: 0,
    sansFiche: 0,
    refusees: 0,
    slugsPourvus: [],
  }

  for (const { pack, ligne } of retenus) {
    const produit = await prisma.product.findUnique({
      where: { slug: pack.slug },
      select: {
        id: true,
        name: true,
        media: { select: { id: true, mediaId: true, role: true, position: true } },
      },
    })
    if (!produit) {
      compte.sansFiche += 1
      continue
    }

    const dossier = path.join(racinePhotos, ligne.dossier)
    const medias: Array<{ mediaId: string; position: number }> = []
    let manque = false

    for (const [rang, vue] of VUES.entries()) {
      const chemin = path.join(dossier, vue.fichier)
      let resultat
      try {
        resultat = await deposer(
          prisma,
          chemin,
          vue.alt(
            pack.positionLabel,
            pack.vehicleLabel,
            estEffetXenon(produit.name) ? 'effet xénon' : 'LED',
          ),
          vue.legende,
          `rendus/${pack.make}`,
          essai,
        )
      } catch {
        manque = true
        break
      }
      if ('erreur' in resultat) {
        journal(`  ${pack.slug} — ${vue.fichier} refusé : ${resultat.erreur}`)
        compte.refusees += 1
        manque = true
        break
      }
      if ('media' in resultat && resultat.media) {
        medias.push({ mediaId: resultat.media.id, position: rang })
      }
    }

    if (manque) {
      compte.sansFichier += 1
      continue
    }

    if (essai) {
      compte.fichesFaites += 1
      compte.slugsPourvus.push(pack.slug)
      continue
    }

    await prisma.$transaction(async (tx) => {
      const notres = new Set(medias.map((media) => media.mediaId))
      // Un rendu étranger déjà posé descend après les nôtres, il ne disparaît pas.
      const etrangers = produit.media.filter(
        (media) => media.role === 'RESULT' && !notres.has(media.mediaId),
      )
      for (const [i, media] of [...etrangers].reverse().entries()) {
        await tx.productMedia.update({
          where: { id: media.id },
          data: { position: VUES.length + etrangers.length - 1 - i },
        })
      }
      for (const media of medias) {
        await tx.productMedia.upsert({
          where: {
            productId_mediaId_role: {
              productId: produit.id,
              mediaId: media.mediaId,
              role: 'RESULT',
            },
          },
          update: { position: media.position },
          create: {
            productId: produit.id,
            mediaId: media.mediaId,
            role: 'RESULT',
            position: media.position,
          },
        })
      }
    })

    compte.fichesFaites += 1
    compte.posees += medias.length
    compte.slugsPourvus.push(pack.slug)
    options.avancement?.(compte.fichesFaites)
  }

  return compte
}
