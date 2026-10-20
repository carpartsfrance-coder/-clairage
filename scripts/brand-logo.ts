import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { inspectUpload, putFile } from '../src/lib/storage/driver'

/**
 * Rattachement d'un logo **fourni en local** à une marque du référentiel.
 *
 * Le cœur est ici, et non dans l'un des deux scripts, parce qu'il y en a deux :
 * `attach-brand-logo.ts` pose un fichier à la main, `import-logos-fournis.ts`
 * rejoue le lot complet dans un nouvel environnement. Les deux doivent poser
 * les mêmes octets par le même chemin — sinon la production finirait avec des
 * médias que le développement ne connaît pas, ou l'inverse.
 *
 * Trois garanties, reprises de l'import Commons et pour les mêmes raisons :
 *
 * 1. **Le contenu décide, pas l'extension.** Les octets passent par
 *    `inspectUpload`, exactement comme un téléversement d'admin : un `.svg`
 *    qui servirait autre chose est refusé.
 * 2. **Le dépôt passe par la couche de stockage**, donc par `MEDIA_DRIVER` —
 *    jamais une écriture directe dans `public/uploads`, qui disparaîtrait au
 *    déploiement suivant.
 * 3. **Rejouable sans doublon.** La clé de stockage porte une empreinte du
 *    contenu : le même fichier déposé deux fois réutilise le même média.
 *
 * La marque est lue AVANT le dépôt. Déposer puis découvrir que le slug n'existe
 * pas laisserait un fichier orphelin dans le stockage, que plus rien ne
 * désignerait.
 */

export type ResultatLogo =
  | { etat: 'rattaché' | 'remplacé'; marque: string; url: string; nouveau: boolean }
  | { etat: 'déjà rattaché'; marque: string }
  | { etat: 'refusé'; marque: string; raison: string }

export async function rattacherLogo(options: {
  prisma: PrismaClient
  /** Slug de la base, pas le nom affiché : « ds-automobiles », « can-am ». */
  slug: string
  /** Chemin du fichier, absolu ou relatif au répertoire courant. */
  fichier: string
  /**
   * D'où vient l'image, enregistré dans la légende du média.
   *
   * Un logo de constructeur est une marque déposée : l'afficher pour désigner
   * la compatibilité d'un produit relève de l'usage nominatif, et cette
   * décision appartient à l'exploitant. Le code n'en tranche rien ; il garde
   * seulement de quoi vérifier le choix, plutôt que de laisser une image sans
   * origine dans la médiathèque.
   */
  provenance?: string | null
  /** Sans ce drapeau, un logo déjà en place est laissé intact. */
  remplacer?: boolean
}): Promise<ResultatLogo> {
  const { prisma, slug, provenance = null, remplacer = false } = options

  const marque = await prisma.vehicleMake.findUnique({
    where: { slug },
    select: { id: true, name: true, logoMediaId: true },
  })
  if (!marque) {
    return { etat: 'refusé', marque: slug, raison: 'aucune marque de ce slug au référentiel' }
  }

  /*
    On ne refuse pas tout de suite un logo déjà en place : il peut s'agir du
    même fichier, et redire « déjà rattaché » vaut mieux que réclamer
    `--remplacer` pour une opération qui ne changerait rien. C'est l'empreinte
    du contenu, plus bas, qui tranche.
  */
  const avaitUnLogo = marque.logoMediaId !== null

  const chemin = path.resolve(process.cwd(), options.fichier)
  let bytes: Buffer
  try {
    bytes = await readFile(chemin)
  } catch {
    return { etat: 'refusé', marque: marque.name, raison: `fichier illisible : ${chemin}` }
  }

  const controle = await inspectUpload(new File([new Uint8Array(bytes)], path.basename(chemin)))
  if (!controle.ok) {
    return { etat: 'refusé', marque: marque.name, raison: controle.error }
  }

  const empreinte = createHash('sha256').update(controle.bytes).digest('hex').slice(0, 12)
  const suffixe = `-${empreinte}.${controle.extension}`

  let media = await prisma.media.findFirst({ where: { storageKey: { endsWith: suffixe } } })

  // Le même fichier, déjà posé sur cette marque : rien à faire, et surtout pas
  // un second dépôt.
  if (media && marque.logoMediaId === media.id) {
    return { etat: 'déjà rattaché', marque: marque.name }
  }

  if (avaitUnLogo && !remplacer) {
    return {
      etat: 'refusé',
      marque: marque.name,
      raison: 'un autre logo est déjà rattaché — relancer avec --remplacer',
    }
  }

  const nouveau = media === null
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
        alt: `Logo ${marque.name}`,
        caption: provenance,
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

  await prisma.vehicleMake.update({ where: { id: marque.id }, data: { logoMediaId: media.id } })
  return {
    etat: avaitUnLogo ? 'remplacé' : 'rattaché',
    marque: marque.name,
    url: media.url,
    nouveau,
  }
}
