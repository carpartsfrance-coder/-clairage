import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Visuels des générations de véhicule.
 *
 * Les fichiers viennent de `prisma/vehicle-photos.json`, relevé sur les pages
 * de génération de ledperf.com. **Ces visuels appartiennent à ledperf**, et
 * leur usage ici relève du partenariat entre les deux enseignes, affirmé par
 * l'exploitant. Ce script ne constate pas ce droit : il enregistre la
 * provenance. Chaque média garde en légende l'URL de la page d'où il vient,
 * pour que l'origine d'un visuel reste retrouvable — et pour que la liste de
 * ce qu'il faudrait retirer existe, si l'accord prenait fin.
 *
 * **Une photo ne porte aucune information dont dépende un achat.** Elle aide à
 * se reconnaître dans une liste de générations ; le nom et les millésimes
 * disent le reste. C'est pourquoi `photoMediaId` est facultatif et le reste :
 * une génération sans visuel s'affiche normalement.
 *
 * Les partis pris sont ceux de `import-brand-logos.ts`, pour les mêmes
 * raisons :
 *
 * 1. **Le contenu est vérifié, pas l'extension**, par `inspectUpload` — comme
 *    un téléversement d'admin.
 * 2. **Le dépôt passe par la couche de stockage**, donc par `MEDIA_DRIVER`.
 *    Écrire sur le disque de l'instance produirait, en production, des médias
 *    pointant vers des fichiers effacés au déploiement suivant.
 * 3. **Rejouable sans doublon** : la clé de stockage porte une empreinte du
 *    contenu, et le script réutilise un dépôt identique au lieu d'en créer un
 *    second. Relancer après un échec ne refait que ce qui manque.
 * 4. **Aucune génération n'est créée.** Une photo dont la génération n'existe
 *    pas au référentiel est signalée, pas inventée.
 *
 * Une photo déjà posée n'est pas remplacée sans le dire. `--remplacer` rend ce
 * remplacement possible et explicite.
 *
 *   npm run import:vehicle-photos                → ne remplace aucune photo en place
 *   npm run import:vehicle-photos -- --remplacer → remplace, en le disant
 */

type Photo = {
  make: string
  model: string
  generation: string
  label: string
  url: string
  page: string
}
type Jeu = { _source: string; _releve: string; _avertissement: string; photos: Photo[] }

type Etat = 'rattachée' | 'déjà rattachée' | 'en attente' | 'échec'

const remplacer = process.argv.includes('--remplacer')
const AGENT = 'LumeraPhotoImport/1.0 (+https://lumera-web.onrender.com)'

/** Un visuel de génération pèse une dizaine de kilo-octets. */
const TAILLE_MAX = 2 * 1024 * 1024

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function recuperer(url: string): Promise<Buffer> {
  // Une rafale de plus de mille requêtes se fait refuser, et c'est normal :
  // on espace, et on reprend trois fois en doublant l'attente.
  let reponse: Response | null = null
  for (let essai = 0; essai < 3; essai += 1) {
    if (essai > 0) await pause(1000 * 2 ** essai)
    reponse = await fetch(url, { headers: { 'User-Agent': AGENT } })
    if (reponse.status !== 429 && reponse.status < 500) break
  }
  if (!reponse || !reponse.ok) throw new Error(`HTTP ${reponse?.status ?? 'sans réponse'}`)

  const bytes = Buffer.from(await reponse.arrayBuffer())
  if (bytes.length === 0) throw new Error('fichier vide')
  if (bytes.length > TAILLE_MAX) {
    throw new Error(`${Math.round(bytes.length / 1024)} ko, au-delà de la limite`)
  }
  return bytes
}

async function importer(photo: Photo): Promise<{ etat: Etat; raison?: string }> {
  // La génération d'abord : inutile de télécharger un visuel qui n'a nulle
  // part où se poser.
  const generation = await prisma.vehicleGeneration.findFirst({
    where: {
      slug: photo.generation,
      model: { slug: photo.model, make: { slug: photo.make } },
    },
    select: { id: true, photoMediaId: true },
  })
  if (!generation) return { etat: 'en attente' }

  let bytes: Buffer
  try {
    bytes = await recuperer(photo.url)
  } catch (error) {
    return { etat: 'échec', raison: (error as Error).message }
  }

  const controle = await inspectUpload(new File([new Uint8Array(bytes)], path.basename(photo.url)))
  if (!controle.ok) return { etat: 'échec', raison: controle.error }

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  let media = await prisma.media.findFirst({
    where: { storageKey: { endsWith: `-${empreinte}.${controle.extension}` } },
  })

  if (!media) {
    const depose = await putFile({
      bytes: controle.bytes,
      mimeType: controle.mimeType,
      extension: controle.extension,
      prefix: 'vehicules',
    })
    media = await prisma.media.create({
      data: {
        storageKey: depose.key,
        url: depose.url,
        mimeType: depose.mimeType,
        sizeBytes: depose.sizeBytes,
        alt: photo.label,
        /*
          Pas d'URL source ici. La fiche produit AFFICHE les légendes : y
          mettre l'adresse d'où vient l'image revenait à l'imprimer sous la
          photo, et à envoyer le client chez le fournisseur du visuel. La
          traçabilité vit dans `prisma/vehicle-photos.json`, qui porte la page
          d'origine de chaque entrée — c'est un registre, pas de l'affichage.
        */
        caption: null,
        /*
          `nature` reste UNSPECIFIED : ce n'est ni une photo du produit vendu,
          ni un rendu d'éclairage. L'écran des médias s'en sert pour dire au
          client ce qu'il regarde ; lui coller une autre nature le tromperait.
        */
        nature: 'UNSPECIFIED',
      },
    })
  }

  if (generation.photoMediaId === media.id) return { etat: 'déjà rattachée' }
  if (generation.photoMediaId && !remplacer) return { etat: 'déjà rattachée' }

  await prisma.vehicleGeneration.update({
    where: { id: generation.id },
    data: { photoMediaId: media.id },
  })
  return { etat: 'rattachée' }
}

async function main() {
  const etatStockage = storageStatus()
  if (!etatStockage.ok) {
    console.error(
      `Stockage « ${etatStockage.driver} » inutilisable : ${etatStockage.problem}\n` +
        "Aucun visuel n'est importé — mieux vaut rien que des médias pointant vers " +
        'des fichiers absents.',
    )
    process.exitCode = 1
    return
  }

  const jeu: Jeu = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'vehicle-photos.json'), 'utf8'),
  )
  console.log(`→ Visuels de génération — relevé du ${jeu._releve}, stockage « ${etatStockage.driver} »`)
  console.log(`  ${jeu.photos.length} visuels au jeu de données`)

  const compte: Record<Etat, number> = {
    rattachée: 0,
    'déjà rattachée': 0,
    'en attente': 0,
    échec: 0,
  }
  const echecs: string[] = []
  const attente: string[] = []

  for (const [index, photo] of jeu.photos.entries()) {
    const { etat, raison } = await importer(photo)
    compte[etat] += 1
    if (etat === 'échec') echecs.push(`${photo.label} — ${raison}`)
    if (etat === 'en attente') attente.push(photo.label)

    // Une ligne par visuel ferait mille lignes de journal : on avance par
    // paquets, et on détaille seulement ce qui a échoué.
    if ((index + 1) % 100 === 0 || index + 1 === jeu.photos.length) {
      console.log(
        `  ${index + 1}/${jeu.photos.length} — ${compte.rattachée} rattachée(s), ` +
          `${compte['déjà rattachée']} déjà pourvue(s), ${compte.échec} en échec`,
      )
    }
    await pause(120)
  }

  console.log(
    `\n  ${compte.rattachée} rattachée(s), ${compte['déjà rattachée']} déjà pourvue(s), ` +
      `${compte['en attente']} sans génération au référentiel, ${compte.échec} en échec.`,
  )
  for (const ligne of echecs.slice(0, 20)) console.log(`  ! ${ligne}`)
  if (echecs.length > 20) console.log(`  … et ${echecs.length - 20} autres échecs.`)
  if (attente.length > 0) {
    console.log(`  Sans génération : ${attente.slice(0, 10).join(', ')}${attente.length > 10 ? '…' : ''}`)
  }

  const sans = await prisma.vehicleGeneration.count({ where: { photoMediaId: null } })
  console.log(`  ${sans} génération(s) sans visuel.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
