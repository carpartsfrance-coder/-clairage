import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { ALLOWED_MIME, sniffMime } from '../src/lib/storage/file-type'

const prisma = new PrismaClient()

/**
 * Import des logos de marque depuis un site de l'exploitant.
 *
 * Les logos récupérés ici viennent d'autoliva.com, l'autre site de
 * l'exploitant, qui les affiche déjà. **Le script ne tranche aucune question
 * de droit** : un logo de constructeur est une marque déposée, et le droit de
 * l'afficher appartient à l'exploitant ou non, selon ses accords. Il se
 * contente de déplacer des fichiers entre deux sites tenus par la même
 * personne.
 *
 * Trois partis pris, et ils méritent d'être lus avant de relancer :
 *
 * 1. **Le contenu est vérifié, pas l'extension.** Les octets passent par
 *    `sniffMime`, exactement comme un téléversement d'admin. Une URL en
 *    `.webp` qui servirait autre chose est refusée.
 *
 * 2. **La clé de stockage est déterministe** — `marques/<slug>-<empreinte>` —
 *    là où un téléversement d'admin y met un identifiant aléatoire. L'aléa
 *    existe pour qu'une clé ne se devine pas à partir d'un nom de fichier ;
 *    un logo de marque est public et sans enjeu de ce côté, et le
 *    déterminisme est ce qui rend ce script rejouable sans accumuler des
 *    doublons.
 *
 * 3. **Aucune marque n'est créée.** Un logo dont la marque n'existe pas au
 *    référentiel véhicule est enregistré dans les médias, puis signalé — il
 *    attend. Créer la marque pour « utiliser » le logo inventerait une entrée
 *    de catalogue que rien ne remplit : elle n'aurait ni modèle, ni
 *    génération, ni compatibilité, et le menu la masquerait de toute façon.
 *
 * Un logo déjà rattaché n'est jamais remplacé en silence : le script le laisse
 * en place et le dit.
 *
 * Lancement : `npm run import:brand-logos`
 */

const SOURCE = 'https://autoliva.com/images/brands'

/** Un logo de marque pèse quelques dizaines de kilo-octets. */
const TAILLE_MAX = 2 * 1024 * 1024

/**
 * Les marques relevées sur la page d'accueil d'autoliva.com.
 *
 * Le slug est celui qu'aurait la marque au référentiel véhicule de LUMERA.
 * Il sert à rapprocher le logo d'une marque existante — il ne crée rien.
 */
const MARQUES: Array<{ slug: string; name: string; fichier: string }> = [
  { slug: 'audi', name: 'Audi', fichier: 'audi-logo.webp' },
  { slug: 'bmw', name: 'BMW', fichier: 'bmw-logo.webp' },
  { slug: 'ford', name: 'Ford', fichier: 'ford-logo.webp' },
  { slug: 'honda', name: 'Honda', fichier: 'honda-logo.png' },
  { slug: 'hyundai', name: 'Hyundai', fichier: 'hyundai-logo.webp' },
  { slug: 'kia', name: 'Kia', fichier: 'kia-logo.webp' },
  { slug: 'land-rover', name: 'Land Rover', fichier: 'land-rover-logo.webp' },
  { slug: 'mazda', name: 'Mazda', fichier: 'mazda-logo.webp' },
  { slug: 'mercedes-benz', name: 'Mercedes-Benz', fichier: 'mercedes-benz-logo.webp' },
  { slug: 'mitsubishi', name: 'Mitsubishi', fichier: 'mitsubishi-logo.webp' },
  { slug: 'nissan', name: 'Nissan', fichier: 'nissan-logo.webp' },
  { slug: 'opel', name: 'Opel', fichier: 'opel-logo.webp' },
  { slug: 'peugeot', name: 'Peugeot', fichier: 'peugeot-logo.png' },
  { slug: 'renault', name: 'Renault', fichier: 'renault-logo.webp' },
  { slug: 'seat', name: 'Seat', fichier: 'seat-logo.webp' },
  { slug: 'skoda', name: 'Skoda', fichier: 'skoda-logo.webp' },
  { slug: 'toyota', name: 'Toyota', fichier: 'toyota-logo.webp' },
  { slug: 'volkswagen', name: 'Volkswagen', fichier: 'volkswagen-logo.webp' },
]

type Resultat =
  | { etat: 'rattaché'; marque: string }
  | { etat: 'déjà rattaché'; marque: string }
  | { etat: 'en attente'; marque: string }
  | { etat: 'échec'; marque: string; raison: string }

async function recuperer(fichier: string): Promise<Buffer> {
  const reponse = await fetch(`${SOURCE}/${fichier}`)
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)

  const bytes = Buffer.from(await reponse.arrayBuffer())
  if (bytes.length === 0) throw new Error('fichier vide')
  if (bytes.length > TAILLE_MAX) {
    throw new Error(`${Math.round(bytes.length / 1024)} ko, au-delà de la limite`)
  }
  return bytes
}

async function importer(marque: (typeof MARQUES)[number]): Promise<Resultat> {
  let bytes: Buffer
  try {
    bytes = await recuperer(marque.fichier)
  } catch (error) {
    return { etat: 'échec', marque: marque.name, raison: (error as Error).message }
  }

  // Le contenu décide, pas l'URL.
  const mimeType = sniffMime(bytes)
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    return {
      etat: 'échec',
      marque: marque.name,
      raison: `contenu non reconnu${mimeType ? ` (${mimeType})` : ''}`,
    }
  }

  const empreinte = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const key = `marques/${marque.slug}-${empreinte}.${ALLOWED_MIME.get(mimeType)}`

  const cible = path.join(process.cwd(), 'public', 'uploads', key)
  await mkdir(path.dirname(cible), { recursive: true })
  await writeFile(cible, bytes)

  /*
    `nature` reste UNSPECIFIED : un logo de constructeur n'est ni une photo du
    produit, ni une illustration d'un rendu, ni une photo d'essai. Lui coller
    l'une de ces natures tromperait l'écran des médias, qui s'en sert pour
    dire au client ce qu'il regarde.
  */
  const media = await prisma.media.upsert({
    where: { storageKey: key },
    update: { alt: `Logo ${marque.name}` },
    create: {
      storageKey: key,
      url: `/uploads/${key}`,
      mimeType,
      sizeBytes: bytes.length,
      alt: `Logo ${marque.name}`,
      nature: 'UNSPECIFIED',
    },
  })

  const existante = await prisma.vehicleMake.findUnique({
    where: { slug: marque.slug },
    select: { id: true, logoMediaId: true },
  })

  if (!existante) return { etat: 'en attente', marque: marque.name }

  // Un logo déjà posé n'est pas écrasé sans le dire.
  if (existante.logoMediaId && existante.logoMediaId !== media.id) {
    return { etat: 'déjà rattaché', marque: marque.name }
  }

  await prisma.vehicleMake.update({
    where: { id: existante.id },
    data: { logoMediaId: media.id },
  })
  return { etat: 'rattaché', marque: marque.name }
}

async function main() {
  console.log(`→ Logos de marque, depuis ${SOURCE}`)

  const resultats: Resultat[] = []
  for (const marque of MARQUES) {
    const resultat = await importer(marque)
    resultats.push(resultat)
    const signe = { rattaché: '✓', 'déjà rattaché': '·', 'en attente': '○', échec: '!' }[resultat.etat]
    const suffixe = resultat.etat === 'échec' ? ` — ${resultat.raison}` : ''
    console.log(`  ${signe} ${resultat.marque}${suffixe}`)
  }

  const par = (etat: Resultat['etat']) => resultats.filter((r) => r.etat === etat)
  console.log(
    `\n  ${par('rattaché').length} rattaché(s), ${par('déjà rattaché').length} déjà pourvu(s), ` +
      `${par('en attente').length} en attente d'une marque au référentiel, ${par('échec').length} en échec.`,
  )

  const attente = par('en attente')
  if (attente.length > 0) {
    console.log(
      `\n  En médiathèque, sans marque correspondante : ${attente.map((r) => r.marque).join(', ')}.` +
        `\n  Ces logos seront proposés à la création de la marque, depuis Administration › Véhicules.`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
