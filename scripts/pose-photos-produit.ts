import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { parseCsv } from '../src/lib/imports/csv'
import { driverName, inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'
import { POSITION_PAR_TYPE, VUES, cleDuDossier, meilleurRang } from '../src/lib/admin/photos-suivi'

const prisma = new PrismaClient()

/**
 * Pose sur les fiches les photos produites véhicule par véhicule.
 *
 * Les trois images d'un produit — comparatif avant/après, gros plan, véhicule
 * entier — sont fabriquées à part et rangées dans un dossier par véhicule. Elles
 * restaient sur un disque pendant que les fiches montraient les visuels
 * filigranés d'un concurrent.
 *
 * La règle de rapprochement vit dans `lib/admin/photos-suivi.ts`, à part et sous
 * tests. Le pont entre les deux mondes est `prisma/packs-vehicule.json`, le relevé
 * qui a créé les packs : il donne, pour un triplet marque / génération / position,
 * le `slug` exact de la fiche. On ne devine donc rien, on relit.
 *
 * Cinq partis pris :
 *
 * 1. **Une correspondance exacte, ou rien.** Aucun rapprochement par ressemblance
 *    de titres. Une photo posée sur la mauvaise fiche montrerait au client
 *    l'éclairage d'une autre voiture que la sienne, et rien ne le signalerait.
 *
 * 2. **Rôle « rendu », nature « illustration ».** Ces images sont fabriquées, pas
 *    photographiées. La nature `ILLUSTRATION` fait afficher à la galerie
 *    « Visuel d'illustration — il ne montre pas un montage réalisé ». C'est le
 *    prix de l'honnêteté, et c'est la seule mention exacte.
 *
 * 3. **La vignette du catalogue n'est pas touchée.** La carte prend le premier
 *    média de rôle `PRODUCT` ; nos photos sont des `RESULT`. Changer la vignette
 *    est une autre décision, qui se prendra en voyant le résultat.
 *
 * 4. **Rien n'est détaché.** Les visuels déjà en place restent. Un `RESULT`
 *    étranger déjà posé descend après les nôtres au lieu de disparaître.
 *
 * 5. **Un seul jeu par fiche.** Le revendeur partenaire sépare ce que le
 *    catalogue réunit — restylé et non-restylé, blanc xénon et blanc pur. On
 *    garde le jeu du meilleur rang, c'est-à-dire du produit le plus vendu.
 *
 *   npm run photos:produits -- --essai            n'écrit rien, dit ce qu'il ferait
 *   npm run photos:produits -- --limite 20        ne traite que les 20 premiers
 *   npm run photos:produits                       pose tout
 *   npm run photos:produits -- --suivi <chemin>   un autre fichier de suivi
 */

const essai = process.argv.includes('--essai')

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const RACINE_PAR_DEFAUT = path.join(os.homedir(), 'Desktop', 'Image ledvroom.com')
const cheminSuivi = option('--suivi') ?? path.join(RACINE_PAR_DEFAUT, 'suivi.csv')
const racinePhotos = option('--photos') ?? path.dirname(cheminSuivi)
const limite = Number(option('--limite') ?? '0') || Infinity

/** Les relevés qui donnent le slug d'une fiche. Le second est facultatif. */
const RELEVES = [
  path.join('prisma', 'packs-vehicule.json'),
  path.join('prisma', 'packs-vehicule-complement.json'),
]

type Pack = {
  make: string
  generation: string
  position: string
  slug: string
  positionLabel: string
  vehicleLabel: string
}

/** Le serveur et la base visés, sans les identifiants. */
function baseVisee(): string {
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
async function attelageCoherent(): Promise<boolean> {
  const temoin = await prisma.media.findFirst({ orderBy: { createdAt: 'desc' }, select: { url: true } })
  if (!temoin) return true
  const baseEnLocal = temoin.url.startsWith('/uploads/')
  const pilote = driverName()
  if (baseEnLocal === (pilote === 'local')) return true
  console.error(
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
 * retrouve par son empreinte au lieu d'être téléversé une seconde fois. C'est ce
 * qui rend la commande rejouable sans gonfler le stockage.
 */
async function deposer(chemin: string, alt: string, legende: string, prefixe: string) {
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

async function main() {
  console.log(`Base visée : ${baseVisee()}`)

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(`Stockage « ${etat.driver} » inutilisable : ${etat.problem}`)
    process.exitCode = 1
    return
  }
  console.log(`Stockage : ${etat.driver}${essai ? '  —  ESSAI, rien ne sera écrit' : ''}`)

  if (!(await attelageCoherent())) {
    process.exitCode = 1
    return
  }

  // ---- Le pont : marque / génération / position → slug de la fiche ---------
  /*
    Les deux relevés, pas seulement le premier. Le complément porte les packs
    que le parcours d'origine avait sautés — Mercedes-Benz en entier. Ne lire
    que `packs-vehicule.json` laisserait leurs photos sans fiche alors que les
    fiches existent.
  */
  const parCle = new Map<string, Pack>()
  for (const fichier of RELEVES) {
    let brut: string
    try {
      brut = await readFile(path.join(process.cwd(), fichier), 'utf8')
    } catch {
      // Le complément peut ne pas exister : ce n'est pas une erreur.
      continue
    }
    const releve = JSON.parse(brut) as { packs: Pack[] }
    for (const p of releve.packs) parCle.set(`${p.make}|${p.generation}|${p.position}`, p)
    console.log(`Relevé lu : ${fichier} (${releve.packs.length} packs)`)
  }

  // ---- Le suivi photo ------------------------------------------------------
  const table = parseCsv(await readFile(cheminSuivi, 'utf8'), ';')
  const colonne = (nom: string) => table.headers.indexOf(nom)
  const iRang = colonne('rang')
  const iType = colonne('type')
  const iDossier = colonne('dossier')
  const iStatut = colonne('statut')
  if ([iRang, iType, iDossier, iStatut].some((i) => i < 0)) {
    console.error(`Colonnes attendues absentes de ${cheminSuivi} : rang, type, dossier, statut.`)
    process.exitCode = 1
    return
  }

  type Ligne = { rang: string; type: string; dossier: string; statut: string }
  const lignes: Ligne[] = table.rows.map((r) => ({
    rang: r[iRang] ?? '',
    type: r[iType] ?? '',
    dossier: r[iDossier] ?? '',
    statut: r[iStatut] ?? '',
  }))
  const faites = lignes.filter((l) => l.statut === 'fait')

  // ---- Appariement ---------------------------------------------------------
  const parSlug = new Map<string, { pack: Pack; lignes: Ligne[] }>()
  const refus = { typeInconnu: 0, cheminIllisible: 0, aucunPack: 0 }

  for (const ligne of faites) {
    const position = POSITION_PAR_TYPE[ligne.type]
    if (!position) {
      refus.typeInconnu += 1
      continue
    }
    const cle = cleDuDossier(ligne.dossier)
    if (!cle) {
      refus.cheminIllisible += 1
      continue
    }
    const pack = parCle.get(`${cle.marque}|${cle.generation}|${position}`)
    if (!pack) {
      refus.aucunPack += 1
      continue
    }
    const entree = parSlug.get(pack.slug)
    if (entree) entree.lignes.push(ligne)
    else parSlug.set(pack.slug, { pack, lignes: [ligne] })
  }

  const retenus = [...parSlug.values()]
    .map(({ pack, lignes: l }) => ({ pack, ligne: meilleurRang(l)!, concurrents: l.length - 1 }))
    .filter((x) => x.ligne)
    .sort((a, b) => Number(a.ligne.rang) - Number(b.ligne.rang))

  console.log(`\nJeux de photos terminés : ${faites.length}`)
  console.log(`  appariés à une fiche : ${faites.length - refus.typeInconnu - refus.cheminIllisible - refus.aucunPack}`)
  console.log(`  famille absente du catalogue : ${refus.typeInconnu}`)
  console.log(`  véhicule absent du catalogue : ${refus.aucunPack}`)
  if (refus.cheminIllisible) console.log(`  chemin illisible : ${refus.cheminIllisible}`)
  console.log(`Fiches visées : ${retenus.length}` + (limite === Infinity ? '' : `, limitées à ${limite}`))

  // ---- La pose -------------------------------------------------------------
  const compte = { posees: 0, deja: 0, fichesFaites: 0, sansFichier: 0, sansFiche: 0, refusees: 0 }

  for (const { pack, ligne } of retenus.slice(0, limite === Infinity ? undefined : limite)) {
    const produit = await prisma.product.findUnique({
      where: { slug: pack.slug },
      select: {
        id: true,
        media: { select: { id: true, mediaId: true, role: true, position: true } },
      },
    })
    if (!produit) {
      compte.sansFiche += 1
      continue
    }

    const dossier = path.join(racinePhotos, ligne.dossier)
    const medias: { mediaId: string; position: number }[] = []
    let manque = false

    for (const [rang, vue] of VUES.entries()) {
      const chemin = path.join(dossier, vue.fichier)
      let resultat
      try {
        resultat = await deposer(
          chemin,
          vue.alt(pack.positionLabel, pack.vehicleLabel),
          vue.legende,
          `rendus/${pack.make}`,
        )
      } catch {
        manque = true
        break
      }
      if ('erreur' in resultat) {
        console.error(`  ${pack.slug} — ${vue.fichier} refusé : ${resultat.erreur}`)
        compte.refusees += 1
        manque = true
        break
      }
      if ('media' in resultat && resultat.media) medias.push({ mediaId: resultat.media.id, position: rang })
    }

    if (manque) {
      compte.sansFichier += 1
      continue
    }
    if (essai) {
      compte.fichesFaites += 1
      continue
    }

    /*
      Une transaction par fiche : les trois vues arrivent ensemble ou pas du
      tout. Une fiche qui n'aurait que le comparatif, sans le gros plan,
      raconterait l'histoire à moitié.
    */
    await prisma.$transaction(async (tx) => {
      const nôtres = new Set(medias.map((m) => m.mediaId))
      // Un rendu étranger déjà posé descend après les nôtres, il ne disparaît pas.
      const etrangers = produit.media.filter((m) => m.role === 'RESULT' && !nôtres.has(m.mediaId))
      for (const [i, m] of [...etrangers].reverse().entries()) {
        await tx.productMedia.update({
          where: { id: m.id },
          data: { position: VUES.length + etrangers.length - 1 - i },
        })
      }
      for (const m of medias) {
        await tx.productMedia.upsert({
          where: {
            productId_mediaId_role: { productId: produit.id, mediaId: m.mediaId, role: 'RESULT' },
          },
          update: { position: m.position },
          create: { productId: produit.id, mediaId: m.mediaId, role: 'RESULT', position: m.position },
        })
      }
    })

    compte.fichesFaites += 1
    compte.posees += medias.length
    if (compte.fichesFaites % 25 === 0) {
      process.stdout.write(`\r  fiches traitées : ${compte.fichesFaites}`)
    }
  }

  if (compte.fichesFaites >= 25) process.stdout.write('\n')
  console.log(
    `\n${compte.fichesFaites} fiche(s) ${essai ? 'seraient pourvues' : 'pourvues'} de leurs trois rendus.`,
  )
  if (compte.sansFichier) console.log(`${compte.sansFichier} fiche(s) laissées : images introuvables sur le disque.`)
  if (compte.sansFiche) console.log(`${compte.sansFiche} fiche(s) laissées : slug absent de cette base.`)
  if (compte.refusees) console.log(`${compte.refusees} image(s) refusées par le contrôle de fichier.`)
  console.log('Aucun visuel existant n’a été retiré ; la vignette du catalogue est inchangée.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
