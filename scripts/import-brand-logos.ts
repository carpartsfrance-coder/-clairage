import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Import des logos de marque en médiathèque.
 *
 * Les fichiers viennent de `prisma/brand-logos.json` : des images de Wikimedia
 * Commons, chacune désignée par la propriété P154 (logo image) de l'entité
 * Wikidata de la marque, et non par une recherche par mot-clé — « Porsche » y
 * renvoie aussi un nom de famille.
 *
 * **Le script ne tranche aucune question de droit.** Les fichiers retenus sont
 * dans le domaine public sur Commons : sous le seuil d'originalité, donc non
 * protégés par le droit d'auteur. La plupart portent néanmoins la mention
 * « trademarked » — ce sont des marques déposées. Les afficher pour désigner la
 * compatibilité d'un produit relève de l'usage nominatif, et cette décision
 * appartient à l'exploitant. Le jeu de données enregistre, pour chaque image,
 * son statut et la page d'où elle vient, afin que ce choix soit vérifiable.
 *
 * Quatre partis pris, et ils méritent d'être lus avant de relancer :
 *
 * 1. **Le contenu est vérifié, pas l'extension.** Les octets passent par
 *    `inspectUpload`, exactement comme un téléversement d'admin. Une URL en
 *    `.svg` qui servirait autre chose est refusée.
 *
 * 2. **Le dépôt passe par la couche de stockage**, donc par `MEDIA_DRIVER`.
 *    Écrire dans `public/uploads` comme le faisait la version précédente
 *    fonctionnait en développement et produisait, en production, des médias
 *    pointant vers des fichiers effacés au déploiement suivant.
 *
 * 3. **Le script est rejouable sans accumuler de doublons.** La clé de stockage
 *    porte une empreinte du contenu (`src/lib/storage/index.ts`) : avant tout
 *    dépôt, on cherche un média dont la clé porte déjà cette empreinte, et on
 *    le réutilise. Deux exécutions ne créent donc pas deux médias identiques.
 *
 * 4. **Aucune marque n'est créée.** Un logo dont la marque n'existe pas au
 *    référentiel véhicule est enregistré dans les médias, puis signalé — il
 *    attend. Créer la marque pour « utiliser » le logo inventerait une entrée
 *    de catalogue que rien ne remplit : elle n'aurait ni modèle, ni génération,
 *    ni compatibilité, et le menu la masquerait de toute façon.
 *
 * Un logo déjà rattaché n'est jamais remplacé en silence : le script le laisse
 * en place et le dit.
 *
 * Deux marques n'ont aucun logo libre sur Commons et gardent leur monogramme :
 * Alfa Romeo et Lotus. Ce n'est pas un oubli — leur emblème est au-dessus du
 * seuil d'originalité, donc Commons ne l'héberge pas.
 *
 *   npm run import:brand-logos                → ne remplace aucun logo en place
 *   npm run import:brand-logos -- --remplacer  → remplace, en le disant
 */

type Entree = {
  slug: string
  name: string
  url: string
  fichier: string
  mime: string
  octets: number
  licence: string | null
  restriction: string | null
  /** Renseigné seulement hors domaine public : CC BY exige d'attribuer. */
  auteur?: string | null
  page: string
  wikidata: string
}
type Jeu = { _source: string; _releve: string; _avertissement: string; logos: Entree[] }

type Resultat = {
  etat: 'rattaché' | 'déjà rattaché' | 'en attente' | 'échec'
  marque: string
  raison?: string
}

/** Un logo de marque pèse quelques dizaines de kilo-octets. */
const TAILLE_MAX = 2 * 1024 * 1024

const AGENT = 'LumeraLogoImport/1.0 (+https://lumera-web.onrender.com)'

/*
  Sans ce drapeau, un logo déjà rattaché est laissé en place : c'est la règle,
  et elle protège un choix fait au back-office. Mais elle empêche aussi de
  corriger le jeu de données — remplacer un logo historique par l'actuel, par
  exemple. Le drapeau rend ce remplacement possible et, surtout, explicite.
*/
const remplacer = process.argv.includes('--remplacer')

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function recuperer(url: string): Promise<Buffer> {
  /*
    Wikimedia limite le débit et répond 429 à une rafale. Sa politique demande
    un agent identifiable et des requêtes espacées ; on attend donc entre deux
    fichiers, et on reprend trois fois en doublant l'attente plutôt que de
    renoncer à un logo pour une seconde de trop.
  */
  let reponse: Response | null = null
  for (let essai = 0; essai < 3; essai += 1) {
    if (essai > 0) await pause(1000 * 2 ** essai)
    reponse = await fetch(url, { headers: { 'User-Agent': AGENT } })
    if (reponse.status !== 429) break
  }
  if (!reponse || !reponse.ok) throw new Error(`HTTP ${reponse?.status ?? 'sans réponse'}`)

  const bytes = Buffer.from(await reponse.arrayBuffer())
  if (bytes.length === 0) throw new Error('fichier vide')
  if (bytes.length > TAILLE_MAX) {
    throw new Error(`${Math.round(bytes.length / 1024)} ko, au-delà de la limite`)
  }
  return bytes
}

async function importer(entree: Entree): Promise<Resultat> {
  let bytes: Buffer
  try {
    bytes = await recuperer(entree.url)
  } catch (error) {
    return { etat: 'échec', marque: entree.name, raison: (error as Error).message }
  }

  // Le contenu décide, pas l'URL ni le type annoncé par le jeu de données.
  const controle = await inspectUpload(new File([new Uint8Array(bytes)], entree.fichier))
  if (!controle.ok) {
    return { etat: 'échec', marque: entree.name, raison: controle.error }
  }

  /*
    La clé de stockage se termine par une empreinte du contenu. On s'en sert
    pour retrouver un dépôt identique plutôt que d'en créer un second : c'est
    ce qui rend le script rejouable.
  */
  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const suffixe = `-${empreinte}.${controle.extension}`

  let media = await prisma.media.findFirst({ where: { storageKey: { endsWith: suffixe } } })

  if (!media) {
    const depose = await putFile({
      bytes: controle.bytes,
      mimeType: controle.mimeType,
      extension: controle.extension,
      prefix: 'marques',
    })
    media = await prisma.media.create({
      data: {
        storageKey: depose.key,
        url: depose.url,
        mimeType: depose.mimeType,
        sizeBytes: depose.sizeBytes,
        alt: `Logo ${entree.name}`,
        // D'où vient l'image et sous quel statut, pour que l'écran des médias
        // le dise au lieu de l'avoir perdu.
        caption: [
          entree.licence ?? 'statut non précisé',
          // CC BY exige une attribution nommée ; le domaine public, non.
          entree.auteur ? `par ${entree.auteur}` : null,
          entree.page,
        ]
          .filter(Boolean)
          .join(' — '),
        /*
          `nature` reste UNSPECIFIED : un logo de constructeur n'est ni une
          photo du produit, ni une illustration d'un rendu, ni une photo
          d'essai. Lui coller l'une de ces natures tromperait l'écran des
          médias, qui s'en sert pour dire au client ce qu'il regarde.
        */
        nature: 'UNSPECIFIED',
      },
    })
  }

  const marque = await prisma.vehicleMake.findUnique({
    where: { slug: entree.slug },
    select: { id: true, logoMediaId: true },
  })

  if (!marque) return { etat: 'en attente', marque: entree.name }

  // Un logo déjà posé n'est pas écrasé sans le dire.
  if (marque.logoMediaId && marque.logoMediaId !== media.id && !remplacer) {
    return { etat: 'déjà rattaché', marque: entree.name }
  }
  if (marque.logoMediaId === media.id) return { etat: 'déjà rattaché', marque: entree.name }

  await prisma.vehicleMake.update({ where: { id: marque.id }, data: { logoMediaId: media.id } })
  return { etat: 'rattaché', marque: entree.name }
}

async function main() {
  const etat = storageStatus()
  if (!etat.ok) {
    console.error(
      `Stockage « ${etat.driver} » inutilisable : ${etat.problem}\n` +
        "Aucun logo n'est importé — mieux vaut rien que des médias pointant vers des " +
        'fichiers absents.',
    )
    process.exitCode = 1
    return
  }

  const jeu: Jeu = JSON.parse(
    await readFile(path.join(process.cwd(), 'prisma', 'brand-logos.json'), 'utf8'),
  )
  console.log(`→ Logos de marque — relevé du ${jeu._releve}, stockage « ${etat.driver} »`)
  console.log(`  ${jeu.logos.length} fichiers au jeu de données`)

  const resultats: Resultat[] = []
  for (const entree of jeu.logos) {
    const resultat = await importer(entree)
    resultats.push(resultat)
    const signe = { rattaché: '✓', 'déjà rattaché': '·', 'en attente': '○', échec: '!' }[resultat.etat]
    const suffixe = resultat.raison ? ` — ${resultat.raison}` : ''
    console.log(`  ${signe} ${resultat.marque}${suffixe}`)
    // Espacement des requêtes vers Wikimedia, qui limite le débit.
    await pause(250)
  }

  const par = (e: Resultat['etat']) => resultats.filter((r) => r.etat === e)
  console.log(
    `\n  ${par('rattaché').length} rattaché(s), ${par('déjà rattaché').length} déjà pourvu(s), ` +
      `${par('en attente').length} en attente d'une marque au référentiel, ` +
      `${par('échec').length} en échec.`,
  )

  const attente = par('en attente')
  if (attente.length > 0) {
    console.log(
      `  En attente : ${attente.map((r) => r.marque).join(', ')}. ` +
        'Leur média existe ; il se rattachera dès que la marque sera au référentiel.',
    )
  }

  const sansLogo = await prisma.vehicleMake.count({ where: { type: 'CAR', logoMediaId: null } })
  console.log(`  ${sansLogo} marque(s) automobile(s) sans logo — monogramme affiché.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
