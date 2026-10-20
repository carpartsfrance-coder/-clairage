import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Rattache un logo **fourni en local** à une marque du référentiel véhicule.
 *
 * `import-brand-logos.ts` ne sait prendre que ce que Wikimedia Commons
 * héberge, c'est-à-dire des fichiers sous le seuil d'originalité, donc dans le
 * domaine public. Six marques du catalogue n'y ont rien : Alfa Romeo, Lotus,
 * Buell, Can-Am, MBK et Polaris. Leur emblème est une œuvre originale, Commons
 * ne le reproduit pas, et aucune recherche ne le fera apparaître.
 *
 * Ce script est l'autre porte : il prend le fichier que l'exploitant a obtenu
 * — dossier de presse du constructeur, charte fournie par le distributeur, ou
 * l'image servie par le site officiel de la marque — et le fait entrer par le
 * même chemin que n'importe quel téléversement d'admin.
 *
 * **Il ne tranche aucune question de droit, et n'en invente aucune.** Un logo
 * de constructeur est une marque déposée : l'afficher pour désigner la
 * compatibilité d'un produit relève de l'usage nominatif, et cette décision
 * appartient à l'exploitant. Ce qu'on peut garantir, en revanche, c'est que le
 * choix reste vérifiable : la provenance passée en argument est enregistrée
 * dans la légende du média, et l'écran des médias l'affiche.
 *
 * Trois garanties reprises de l'import Commons, pour les mêmes raisons :
 *
 * 1. **Le contenu décide, pas l'extension.** Les octets passent par
 *    `inspectUpload` : un `.svg` qui servirait autre chose est refusé.
 * 2. **Le dépôt passe par la couche de stockage**, donc par `MEDIA_DRIVER` —
 *    jamais une écriture directe dans `public/uploads`, qui disparaîtrait au
 *    déploiement suivant.
 * 3. **Rejouable sans doublon.** La clé porte une empreinte du contenu : le
 *    même fichier deux fois réutilise le même média.
 *
 * Un logo déjà en place n'est pas remplacé en silence ; `--remplacer` le dit.
 *
 *   npm run logo:marque -- <slug> <fichier> --provenance "<d'où il vient>"
 *   npm run logo:marque -- buell ./buell.png --provenance "…" --remplacer
 */

type Arguments = {
  slug: string
  fichier: string
  provenance: string | null
  remplacer: boolean
}

function lireArguments(argv: string[]): Arguments | { erreur: string } {
  const remplacer = argv.includes('--remplacer')

  const iProvenance = argv.indexOf('--provenance')
  const provenance = iProvenance === -1 ? null : (argv[iProvenance + 1] ?? null)
  if (iProvenance !== -1 && !provenance) {
    return { erreur: '--provenance attend une valeur.' }
  }

  // Les deux premiers arguments qui ne sont ni un drapeau ni sa valeur.
  const positionnels = argv.filter((valeur, index) => {
    if (valeur.startsWith('--')) return false
    if (index > 0 && argv[index - 1] === '--provenance') return false
    return true
  })

  const [slug, fichier] = positionnels
  if (!slug || !fichier) {
    return {
      erreur:
        'Usage : npm run logo:marque -- <slug> <fichier> --provenance "<d’où il vient>" [--remplacer]',
    }
  }

  return { slug, fichier, provenance, remplacer }
}

async function main() {
  const args = lireArguments(process.argv.slice(2))
  if ('erreur' in args) {
    console.error(args.erreur)
    process.exitCode = 1
    return
  }

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(
      `Stockage « ${etat.driver} » inutilisable : ${etat.problem}\n` +
        "Aucun logo n'est rattaché — mieux vaut rien qu'un média pointant vers un fichier absent.",
    )
    process.exitCode = 1
    return
  }

  /*
    La marque est lue AVANT le dépôt. Déposer puis découvrir que le slug
    n'existe pas laisserait un fichier orphelin dans le stockage, que plus
    rien ne désignerait.
  */
  const marque = await prisma.vehicleMake.findUnique({
    where: { slug: args.slug },
    select: { id: true, name: true, logoMediaId: true },
  })
  if (!marque) {
    console.error(
      `Aucune marque « ${args.slug} » au référentiel véhicule.\n` +
        'Le slug est celui de la base, pas le nom affiché : « ds-automobiles », « can-am », « alfa-romeo ».',
    )
    process.exitCode = 1
    return
  }
  if (marque.logoMediaId && !args.remplacer) {
    console.error(
      `${marque.name} a déjà un logo rattaché. Relancez avec --remplacer pour le remplacer.`,
    )
    process.exitCode = 1
    return
  }

  const chemin = path.resolve(process.cwd(), args.fichier)
  let bytes: Buffer
  try {
    bytes = await readFile(chemin)
  } catch {
    console.error(`Fichier illisible : ${chemin}`)
    process.exitCode = 1
    return
  }

  const controle = await inspectUpload(new File([new Uint8Array(bytes)], path.basename(chemin)))
  if (!controle.ok) {
    console.error(`Fichier refusé : ${controle.error}`)
    process.exitCode = 1
    return
  }

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const suffixe = `-${empreinte}.${controle.extension}`

  let media = await prisma.media.findFirst({ where: { storageKey: { endsWith: suffixe } } })
  let depose = false

  if (!media) {
    const fichier = await putFile({
      bytes: controle.bytes,
      mimeType: controle.mimeType,
      extension: controle.extension,
      prefix: 'marques',
    })
    media = await prisma.media.create({
      data: {
        storageKey: fichier.key,
        url: fichier.url,
        mimeType: fichier.mimeType,
        sizeBytes: fichier.sizeBytes,
        alt: `Logo ${marque.name}`,
        // D'où vient l'image, pour que le choix reste vérifiable au lieu
        // d'être perdu le jour où on se demandera qui l'a posée et pourquoi.
        caption: args.provenance,
        /*
          `nature` reste UNSPECIFIED : un logo de constructeur n'est ni une
          photo du produit, ni une illustration d'un rendu, ni une photo
          d'essai. Lui coller l'une de ces natures tromperait l'écran des
          médias, qui s'en sert pour dire au client ce qu'il regarde.
        */
        nature: 'UNSPECIFIED',
      },
    })
    depose = true
  }

  if (marque.logoMediaId === media.id) {
    console.log(`· ${marque.name} portait déjà ce fichier — rien à faire.`)
    return
  }

  await prisma.vehicleMake.update({ where: { id: marque.id }, data: { logoMediaId: media.id } })
  console.log(
    `✓ ${marque.name} — ${depose ? 'déposé' : 'média existant réutilisé'} : ${media.url}` +
      (args.provenance ? `\n  provenance : ${args.provenance}` : ''),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
