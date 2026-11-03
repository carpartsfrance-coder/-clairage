import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile, storageStatus } from '../src/lib/storage/driver'

const prisma = new PrismaClient()

/**
 * Pose un visuel commun en tête de toutes les fiches d'une gamme.
 *
 * Pourquoi un script et pas le back-office : une gamme compte plus de mille
 * fiches. Les rattacher à la main est hors de portée, et surtout les médias
 * **ne se déploient pas avec le code** — ils vivent en base et dans le stockage
 * objet, donc par environnement. Un visuel posé en développement n'existe pas
 * en production, et aucune fusion ne l'y portera. D'où la même construction que
 * `import-logos-fournis.ts` : le fichier est versionné, et une commande le pose
 * là où on l'exécute.
 *
 * Quatre partis pris :
 *
 * 1. **Le contenu est vérifié, pas l'extension.** Les octets passent par
 *    `inspectUpload`, exactement comme un téléversement d'admin.
 *
 * 2. **Le dépôt passe par la couche de stockage**, donc par `MEDIA_DRIVER` :
 *    disque local en développement, stockage objet en production. Écrire
 *    directement dans `public/uploads` produirait, en production, des médias
 *    pointant vers des fichiers effacés au déploiement suivant.
 *
 * 3. **Rejouable sans accumuler de doublons.** La clé de stockage porte une
 *    empreinte du contenu : avant tout dépôt on cherche un média qui la porte
 *    déjà, et une fiche déjà rattachée est laissée telle quelle. Deux
 *    exécutions ne créent ni deux médias, ni deux rattachements.
 *
 * 4. **Rien n'est supprimé par défaut.** Les visuels déjà en place descendent
 *    d'un rang, ils ne disparaissent pas. `--remplacer` les détache, et le dit
 *    fiche par fiche — c'est une décision, pas un effet de bord.
 *
 * Le visuel devient le premier de la fiche : c'est lui que montrent la liste du
 * catalogue, la recherche, le panier et les vignettes de partage, qui ne lisent
 * jamais que le premier.
 *
 *   npm run visuel:gamme -- --essai       → n'écrit rien, dit ce qu'il ferait
 *   npm run visuel:gamme                  → pose le visuel, garde l'existant
 *   npm run visuel:gamme -- --remplacer   → détache aussi les visuels produit
 *                                            précédents, en les nommant
 */

type Gamme = {
  /** Clé passée en argument. */
  cle: string
  /** Fichier versionné, relatif à la racine du dépôt. */
  fichier: string
  /**
   * Les fiches visées. Le préfixe du nom est le seul critère disponible : ces
   * fiches ne portent aucune rubrique, une sélection par rubrique n'attraperait
   * donc rien. Il est volontairement littéral, pour être vérifiable d'un coup
   * d'œil sur le catalogue.
   */
  prefixeNom: string
  /**
   * Texte alternatif. Il décrit ce que l'image MONTRE, pas la fiche qui la
   * porte : un même fichier sert mille fiches, un texte nommant un véhicule
   * serait faux neuf cent quatre-vingt-dix-neuf fois.
   */
  alt: string
  /**
   * Légende. Elle est **vue par le client** : la galerie la pose en cartouche
   * dans le coin du visuel (`ProductGallery`), en petites capitales et sur 75 %
   * de la largeur au plus. Trois mots, pas une phrase — une légende longue
   * revient en travers de la photo. Elle a sa raison d'être ici : un même
   * fichier illustre désormais plus de mille véhicules, et le dire vaut mieux
   * que laisser croire que le module photographié est exactement celui qui
   * sera livré.
   */
  legende: string
  /** Dossier logique dans le stockage. */
  dossier: string
}

const GAMMES: Gamme[] = [
  {
    cle: 'plaque',
    fichier: 'prisma/visuels-packs/eclairage-de-plaque.webp',
    prefixeNom: 'Pack LED éclairage de plaque',
    alt: "Deux modules LED d'éclairage de plaque LEDVROOM, l'un vu de dos montrant son circuit et son connecteur, l'autre de face montrant ses diodes, devant leur emballage.",
    legende: 'Visuel de gamme',
    dossier: 'packs',
  },
]

const essai = process.argv.includes('--essai')
const remplacer = process.argv.includes('--remplacer')
const cleDemandee = process.argv.slice(2).find((a) => !a.startsWith('--'))

async function main() {
  const gamme = GAMMES.find((g) => g.cle === cleDemandee)
  if (!gamme) {
    console.error(
      `Gamme inconnue : ${cleDemandee ?? '(aucune)'}\n` +
        `Gammes connues : ${GAMMES.map((g) => g.cle).join(', ')}\n\n` +
        '  npm run visuel:gamme -- plaque --essai',
    )
    process.exitCode = 1
    return
  }

  /*
    Un stockage mal réglé ne se voit qu'au moment où un fichier manque,
    c'est-à-dire sur la fiche d'un client. On refuse avant d'écrire la moindre
    ligne : mieux vaut rien que mille médias pointant vers des fichiers absents.
  */
  const etat = storageStatus()
  if (!etat.ok) {
    console.error(`Stockage « ${etat.driver} » inutilisable : ${etat.problem}`)
    process.exitCode = 1
    return
  }

  const produits = await prisma.product.findMany({
    where: { name: { startsWith: gamme.prefixeNom, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      media: {
        select: { id: true, mediaId: true, position: true, role: true, media: { select: { url: true } } },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  console.log(`Gamme « ${gamme.cle} » : ${produits.length} fiches dont le nom commence par « ${gamme.prefixeNom} ».`)
  if (produits.length === 0) return
  console.log(`Stockage : ${etat.driver}${essai ? '  —  ESSAI, rien ne sera écrit' : ''}`)

  // ---- Le média, déposé une seule fois et partagé -------------------------
  const chemin = path.join(process.cwd(), gamme.fichier)
  const octets = await readFile(chemin)
  const controle = await inspectUpload(new File([new Uint8Array(octets)], path.basename(chemin)))
  if (!controle.ok) {
    console.error(`Fichier refusé (${gamme.fichier}) : ${controle.error}`)
    process.exitCode = 1
    return
  }

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const suffixe = `-${empreinte}.${controle.extension}`
  let media = await prisma.media.findFirst({ where: { storageKey: { endsWith: suffixe } } })

  if (media) {
    /*
      Le fichier versionné fait foi, sa description aussi. Sans cette remise à
      niveau, corriger un texte alternatif ou une légende obligerait à repasser
      par le back-office alors que le script vient de dire « déjà en place » :
      rejouable à moitié, c'est-à-dire pas rejouable.
    */
    const aCorriger =
      media.alt !== gamme.alt || media.caption !== gamme.legende || media.nature !== 'PRODUCT_PHOTO'
    if (aCorriger && !essai) {
      media = await prisma.media.update({
        where: { id: media.id },
        data: { alt: gamme.alt, caption: gamme.legende, nature: 'PRODUCT_PHOTO' },
      })
    }
    console.log(
      `Visuel déjà en médiathèque (${media.url})${aCorriger ? ` — description ${essai ? 'à remettre' : 'remise'} à niveau` : ''}.`,
    )
  } else if (essai) {
    console.log(`Visuel à déposer : ${(controle.bytes.length / 1024).toFixed(0)} Ko, ${controle.mimeType}.`)
  } else {
    const depose = await putFile({
      bytes: controle.bytes,
      mimeType: controle.mimeType,
      extension: controle.extension,
      prefix: gamme.dossier,
    })
    media = await prisma.media.create({
      data: {
        storageKey: depose.key,
        url: depose.url,
        mimeType: depose.mimeType,
        sizeBytes: depose.sizeBytes,
        alt: gamme.alt,
        caption: gamme.legende,
        // Photographie du produit réel : la galerie n'a donc pas à prévenir le
        // client qu'il regarde un rendu. Lui coller ILLUSTRATION afficherait un
        // avertissement mensonger.
        nature: 'PRODUCT_PHOTO',
      },
    })
    console.log(`Visuel déposé : ${media.url}`)
  }

  // ---- Les rattachements ---------------------------------------------------
  let poses = 0
  let deja = 0
  let detaches = 0

  for (const produit of produits) {
    const dejaLa = media ? produit.media.find((m) => m.mediaId === media!.id && m.role === 'PRODUCT') : undefined

    // Les autres visuels produit de la fiche, dans l'ordre où elle les montre.
    const autres = produit.media.filter((m) => m.role === 'PRODUCT' && m.mediaId !== media?.id)

    if (dejaLa && dejaLa.position === 0 && !remplacer) {
      deja += 1
      continue
    }

    if (essai) {
      if (!dejaLa) poses += 1
      if (remplacer) detaches += autres.length
      continue
    }

    /*
      Une transaction par fiche : poser le visuel et décaler les autres doivent
      réussir ou échouer ensemble. Deux positions 0 sur une même fiche, ce
      serait un ordre d'affichage tiré au sort.
    */
    await prisma.$transaction(async (tx) => {
      if (remplacer && autres.length > 0) {
        await tx.productMedia.deleteMany({ where: { id: { in: autres.map((m) => m.id) } } })
        detaches += autres.length
      } else {
        // Décalage d'un rang, du dernier au premier : la contrainte d'unicité
        // porte sur (produit, média, rôle) et non sur la position, mais un
        // décalage en bloc laisserait l'ordre relatif intact seulement s'il
        // part de la fin.
        for (const m of [...autres].reverse()) {
          await tx.productMedia.update({ where: { id: m.id }, data: { position: m.position + 1 } })
        }
      }

      if (dejaLa) {
        await tx.productMedia.update({ where: { id: dejaLa.id }, data: { position: 0 } })
      } else {
        await tx.productMedia.create({
          data: { productId: produit.id, mediaId: media!.id, role: 'PRODUCT', position: 0 },
        })
      }
    })

    poses += 1
  }

  console.log(
    `\n${essai ? 'À poser' : 'Posé'} en première position : ${poses}` +
      `  —  déjà en place : ${deja}` +
      (remplacer ? `  —  visuels ${essai ? 'à détacher' : 'détachés'} : ${detaches}` : ''),
  )
  if (!remplacer && !essai) {
    console.log("Les visuels précédents sont conservés, d'un rang plus bas. « --remplacer » les détache.")
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
