'use server'

import { revalidatePath } from 'next/cache'
import { planifierFiligrane } from '../storage/filigraner-existants'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff, audit } from '../admin/guard'
import { deleteFile, inspectUpload, putFile, storageStatus } from '../storage'
import { deplacer, ordreAffichage, type Deplacement } from '../admin/media-order'
import { ROLE_LABELS } from '../media-role'

/**
 * Visuels d'une fiche produit : ajouter, rattacher, ordonner, retirer.
 *
 * Jusqu'ici la médiathèque savait téléverser et la fiche savait corriger un
 * texte alternatif, mais **rien ne rattachait une image à un produit** : il
 * fallait passer par un import ou une requête à la main. Une fiche créée au
 * back-office restait donc sans visuel, c'est-à-dire impubliable en pratique —
 * le relevé des manques le reprochait sans offrir le geste.
 *
 * Ces actions sont séparées de `admin-media.ts`, qui administre la médiathèque
 * elle-même (le fichier, sa nature, sa suppression). Ici, on administre le
 * **rattachement** : quel visuel, à quel rôle, dans quel ordre, sur quelle
 * fiche. Un même fichier peut servir sur deux fiches, et le détacher d'une ne
 * doit pas le retirer de l'autre.
 *
 * Trois choix tiennent dans ce fichier et méritent d'être dits :
 *
 * 1. **Seules les images sont acceptées.** La médiathèque accepte aussi les
 *    PDF, utiles ailleurs (notices, factures). Dans une galerie, un PDF
 *    s'afficherait comme un cadre cassé sur la fiche publique.
 * 2. **Les positions sont renumérotées après chaque changement.** Les imports
 *    laissent des positions à 0 et des trous ; une liste qu'on réordonne doit
 *    partir d'une séquence propre, sinon « monter d'un cran » devient un coup
 *    de dés.
 * 3. **Le droit est `catalog.edit`, pas `catalog.publish`.** Poser un visuel
 *    sur un brouillon ne met rien en ligne. La garde est dans chaque action,
 *    pas seulement dans l'écran : une action de serveur est un point d'entrée
 *    public.
 */

export type ProductMediaState = {
  ok?: boolean
  message?: string
  error?: string
  /** Média créé, pour que l'écran puisse pointer dessus. */
  mediaId?: string
}

const ROLES = ['PRODUCT', 'RESULT', 'KIT_CONTENT', 'INSTALL'] as const
const NATURES = ['UNSPECIFIED', 'PRODUCT_PHOTO', 'ILLUSTRATION', 'TEST_PHOTO', 'DIAGRAM'] as const

/**
 * Remet les positions à plat, dans l'ordre que la boutique affichera.
 *
 * Appelé après tout changement de composition. Écrire les quelques lignes
 * d'une fiche coûte moins qu'une séquence à trous, qui finit par rendre les
 * flèches de l'écran inopérantes sans que personne comprenne pourquoi.
 */
async function renumeroter(productId: string): Promise<void> {
  const rattachements = await prisma.productMedia.findMany({
    where: { productId },
    select: { id: true, role: true, position: true },
  })

  const ordonnes = ordreAffichage(rattachements)
  await prisma.$transaction(
    ordonnes.map((item, index) =>
      prisma.productMedia.update({ where: { id: item.id }, data: { position: index } }),
    ),
  )
}

/**
 * Rafraîchit ce que le changement touche.
 *
 * La fiche publique d'abord, parce que c'est elle qui montre la galerie. La
 * médiathèque ensuite : elle affiche le nombre de rattachements de chaque
 * fichier, et c'est ce nombre qui autorise ou refuse une suppression.
 */
async function rafraichir(productId: string): Promise<void> {
  const produit = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  })

  revalidatePath(`/admin/catalogue/${productId}`)
  revalidatePath('/admin/medias')
  if (produit) revalidatePath(`/p/${produit.slug}`)
  // Un rendu ajouté ou passé au rôle « rendu » reçoit son filigrane tout de suite.
  planifierFiligrane()
}

/** Position suivante, à la fin du groupe de rôle visé. */
async function positionSuivante(productId: string): Promise<number> {
  const dernier = await prisma.productMedia.aggregate({
    where: { productId },
    _max: { position: true },
  })
  return (dernier._max.position ?? -1) + 1
}

/* -------------------------------------------------------------------------- */
/* Ajouter un visuel : téléversement puis rattachement                        */
/* -------------------------------------------------------------------------- */

const schemaAjout = z.object({
  productId: z.string().min(1),
  role: z.enum(ROLES),
  nature: z.enum(NATURES),
  alt: z.string().trim().max(300).optional(),
})

/**
 * Téléverse un fichier et le rattache à la fiche, en un geste.
 *
 * Un fichier par appel, et c'est voulu : l'écran en envoie plusieurs à la
 * suite pour pouvoir dire lequel a échoué et pourquoi. Regroupés dans une
 * seule requête, cinq photos de trois mégaoctets dépasseraient le plafond de
 * corps d'une action de serveur (10 Mo, voir `next.config.ts`) et la requête
 * serait coupée sans message — l'utilisateur verrait un formulaire muet.
 */
export async function addProductMedia(
  _previous: ProductMediaState,
  formData: FormData,
): Promise<ProductMediaState> {
  const staff = await requireStaff('catalog.edit')

  const etat = storageStatus()
  if (!etat.ok) {
    // On refuse plutôt que d'écrire là où le fichier disparaîtra.
    return { error: `Stockage mal configuré. ${etat.problem ?? ''}`.trim() }
  }

  const parsed = schemaAjout.safeParse({
    productId: formData.get('productId'),
    role: formData.get('role') || 'PRODUCT',
    nature: formData.get('nature') || 'PRODUCT_PHOTO',
    alt: formData.get('alt') || undefined,
  })
  if (!parsed.success) return { error: 'Informations du visuel invalides.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Aucun fichier reçu.' }

  const produit = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true },
  })
  if (!produit) return { error: 'Produit introuvable.' }

  const inspected = await inspectUpload(file)
  if (!inspected.ok) return { error: inspected.error }
  if (!inspected.mimeType.startsWith('image/')) {
    return {
      error:
        'Une galerie n’affiche que des images. Un PDF se dépose dans la médiathèque, pas sur une fiche.',
    }
  }

  try {
    const stored = await putFile({
      bytes: inspected.bytes,
      mimeType: inspected.mimeType,
      extension: inspected.extension,
      prefix: 'produits',
    })

    const media = await prisma.media.create({
      data: {
        storageKey: stored.key,
        url: stored.url,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        alt: parsed.data.alt || null,
        nature: parsed.data.nature,
        createdBy: staff.id,
      },
    })

    await prisma.productMedia.create({
      data: {
        productId: parsed.data.productId,
        mediaId: media.id,
        role: parsed.data.role,
        position: await positionSuivante(parsed.data.productId),
      },
    })

    await renumeroter(parsed.data.productId)
    await audit(staff, 'product.media.add', 'ProductMedia', media.id, null, {
      productId: parsed.data.productId,
      key: stored.key,
      role: parsed.data.role,
      nature: parsed.data.nature,
    })
    await rafraichir(parsed.data.productId)

    return {
      ok: true,
      mediaId: media.id,
      message: parsed.data.alt
        ? 'Visuel ajouté.'
        : 'Visuel ajouté. Il lui manque un texte alternatif : sans lui, l’image est muette pour une partie des visiteurs.',
    }
  } catch (error) {
    console.error('[fiche] ajout de visuel impossible', error)
    return { error: "Le fichier n'a pas pu être enregistré." }
  }
}

/* -------------------------------------------------------------------------- */
/* Rattacher un visuel déjà en médiathèque                                    */
/* -------------------------------------------------------------------------- */

const schemaRattachement = z.object({
  productId: z.string().min(1),
  mediaId: z.string().min(1),
  role: z.enum(ROLES),
})

/**
 * Rattache un fichier existant.
 *
 * Le même visuel sert souvent sur plusieurs fiches — un schéma de brochage, un
 * comparatif de teintes. Le téléverser à nouveau créerait deux fichiers à
 * décrire, à corriger et à remplacer séparément.
 */
export async function attachProductMedia(
  _previous: ProductMediaState,
  formData: FormData,
): Promise<ProductMediaState> {
  const staff = await requireStaff('catalog.edit')

  const parsed = schemaRattachement.safeParse({
    productId: formData.get('productId'),
    mediaId: formData.get('mediaId'),
    role: formData.get('role') || 'PRODUCT',
  })
  if (!parsed.success) return { error: 'Visuel ou rôle invalide.' }
  const { productId, mediaId, role } = parsed.data

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, mimeType: true, alt: true },
  })
  if (!media) return { error: 'Visuel introuvable en médiathèque.' }
  if (!media.mimeType.startsWith('image/')) {
    return { error: 'Ce fichier n’est pas une image : il ne peut pas entrer dans une galerie.' }
  }

  // La contrainte d'unicité porte sur (produit, média, rôle). On vérifie avant
  // d'écrire pour dire laquelle, plutôt que de renvoyer une erreur de base.
  const deja = await prisma.productMedia.findFirst({
    where: { productId, mediaId },
    select: { role: true },
  })
  if (deja) {
    return {
      error:
        deja.role === role
          ? 'Ce visuel est déjà sur la fiche.'
          : `Ce visuel est déjà sur la fiche, au rôle « ${ROLE_LABELS[deja.role] ?? deja.role} ». Changez son rôle plutôt que de le rattacher deux fois.`,
    }
  }

  try {
    const rattachement = await prisma.productMedia.create({
      data: { productId, mediaId, role, position: await positionSuivante(productId) },
    })

    await renumeroter(productId)
    await audit(staff, 'product.media.attach', 'ProductMedia', rattachement.id, null, {
      productId,
      mediaId,
      role,
    })
    await rafraichir(productId)

    return {
      ok: true,
      message: media.alt
        ? 'Visuel rattaché.'
        : 'Visuel rattaché. Il n’a pas de texte alternatif : renseignez-le ci-dessous.',
    }
  } catch (error) {
    console.error('[fiche] rattachement impossible', error)
    return { error: "Le rattachement n'a pas abouti." }
  }
}

/* -------------------------------------------------------------------------- */
/* Retirer un visuel                                                          */
/* -------------------------------------------------------------------------- */

const schemaRetrait = z.object({
  productId: z.string().min(1),
  attachmentId: z.string().min(1),
  /** Supprimer aussi le fichier, quand il ne sert nulle part ailleurs. */
  supprimerFichier: z.boolean(),
})

/**
 * Détache un visuel de la fiche, et supprime le fichier si demandé.
 *
 * Les deux gestes sont distincts et le second est irréversible, d'où le double
 * contrôle : la suppression du fichier est refusée dès qu'il sert ailleurs,
 * même si l'écran l'a proposée. Entre l'affichage et le clic, une autre fiche a
 * pu le rattacher.
 */
export async function detachProductMedia(
  _previous: ProductMediaState,
  formData: FormData,
): Promise<ProductMediaState> {
  const staff = await requireStaff('catalog.edit')

  const parsed = schemaRetrait.safeParse({
    productId: formData.get('productId'),
    attachmentId: formData.get('attachmentId'),
    supprimerFichier: formData.get('supprimerFichier') !== null,
  })
  if (!parsed.success) return { error: 'Visuel non précisé.' }
  const { productId, attachmentId, supprimerFichier } = parsed.data

  const rattachement = await prisma.productMedia.findUnique({
    where: { id: attachmentId },
    select: { id: true, productId: true, mediaId: true, role: true },
  })
  if (!rattachement || rattachement.productId !== productId) {
    return { error: 'Ce visuel n’est pas sur cette fiche.' }
  }

  try {
    await prisma.productMedia.delete({ where: { id: attachmentId } })
    await renumeroter(productId)
    await audit(
      staff,
      'product.media.detach',
      'ProductMedia',
      attachmentId,
      { productId, mediaId: rattachement.mediaId, role: rattachement.role },
      null,
    )

    let message = 'Visuel retiré de la fiche. Le fichier reste en médiathèque.'

    if (supprimerFichier) {
      const media = await prisma.media.findUnique({
        where: { id: rattachement.mediaId },
        select: {
          storageKey: true,
          /*
            Les cinq relations, et pas seulement les fiches : un fichier qui
            sert de visuel de rubrique, de logo de marque, d'illustration
            d'équipement ou de photo de génération doit survivre au retrait
            d'une fiche. Supprimé, il laisserait un carré vide dans un menu,
            sans erreur ni trace.
          */
          _count: {
            select: {
              products: true,
              categoryHeroes: true,
              vehicleMakeLogos: true,
              equipmentIllustrations: true,
              vehicleGenerationPhotos: true,
            },
          },
        },
      })

      if (!media) {
        message = 'Visuel retiré de la fiche.'
      } else {
        const usages =
          media._count.products +
          media._count.categoryHeroes +
          media._count.vehicleMakeLogos +
          media._count.equipmentIllustrations +
          media._count.vehicleGenerationPhotos
        if (usages > 0) {
          message =
            `Visuel retiré de la fiche. Le fichier a été conservé : il sert encore à ${usages} endroit${usages > 1 ? 's' : ''}.`
        } else {
          // La base d'abord, le fichier ensuite. Dans l'autre ordre, un échec
          // en base laisserait une ligne qui pointe vers un fichier disparu.
          await prisma.media.delete({ where: { id: rattachement.mediaId } })
          await deleteFile(media.storageKey)
          await audit(staff, 'media.delete', 'Media', rattachement.mediaId, {
            key: media.storageKey,
          }, null)
          message = 'Visuel retiré de la fiche et fichier supprimé.'
        }
      }
    }

    await rafraichir(productId)
    return { ok: true, message }
  } catch (error) {
    console.error('[fiche] retrait de visuel impossible', error)
    return { error: "Le retrait n'a pas abouti." }
  }
}

/* -------------------------------------------------------------------------- */
/* Ordonner                                                                   */
/* -------------------------------------------------------------------------- */

const schemaDeplacement = z.object({
  productId: z.string().min(1),
  attachmentId: z.string().min(1),
  deplacement: z.enum(['avant', 'apres', 'premier']),
})

/**
 * Déplace un visuel dans son groupe de rôle.
 *
 * L'ordre n'est pas décoratif : le premier visuel de rôle « Produit » est la
 * vignette du produit dans tout le catalogue, et la galerie ouvre dessus.
 */
export async function moveProductMedia(
  _previous: ProductMediaState,
  formData: FormData,
): Promise<ProductMediaState> {
  const staff = await requireStaff('catalog.edit')

  const parsed = schemaDeplacement.safeParse({
    productId: formData.get('productId'),
    attachmentId: formData.get('attachmentId'),
    deplacement: formData.get('deplacement'),
  })
  if (!parsed.success) return { error: 'Déplacement invalide.' }
  const { productId, attachmentId, deplacement } = parsed.data

  const rattachements = await prisma.productMedia.findMany({
    where: { productId },
    select: { id: true, role: true, position: true },
  })
  if (!rattachements.some((item) => item.id === attachmentId)) {
    return { error: 'Ce visuel n’est pas sur cette fiche.' }
  }

  const ordre = deplacer(rattachements, attachmentId, deplacement as Deplacement)
  // Rien à écrire : le visuel est déjà au bout de son groupe. Ce n'est pas une
  // erreur, et l'écran n'a pas à afficher un refus pour un clic sans effet.
  if (!ordre) return { ok: true }

  try {
    await prisma.$transaction(
      ordre.map((id, index) =>
        prisma.productMedia.update({ where: { id }, data: { position: index } }),
      ),
    )
    await audit(staff, 'product.media.reorder', 'Product', productId, null, {
      attachmentId,
      deplacement,
    })
    await rafraichir(productId)
    return { ok: true, message: 'Ordre enregistré.' }
  } catch (error) {
    console.error('[fiche] réordonnancement impossible', error)
    return { error: "L'ordre n'a pas pu être enregistré." }
  }
}

/* -------------------------------------------------------------------------- */
/* Changer de rôle                                                            */
/* -------------------------------------------------------------------------- */

const schemaRole = z.object({
  productId: z.string().min(1),
  attachmentId: z.string().min(1),
  role: z.enum(ROLES),
})

/**
 * Change le rôle d'un visuel.
 *
 * C'est le geste qui déplace une image d'un groupe de la galerie à un autre —
 * et qui engage la fiche : un visuel passé en « rendu » est présenté au client
 * comme le résultat obtenu. Le visuel arrive en fin de son nouveau groupe,
 * jamais en tête : devenir la vignette du produit se demande explicitement.
 */
export async function setProductMediaRole(
  _previous: ProductMediaState,
  formData: FormData,
): Promise<ProductMediaState> {
  const staff = await requireStaff('catalog.edit')

  const parsed = schemaRole.safeParse({
    productId: formData.get('productId'),
    attachmentId: formData.get('attachmentId'),
    role: formData.get('role'),
  })
  if (!parsed.success) return { error: 'Rôle invalide.' }
  const { productId, attachmentId, role } = parsed.data

  const rattachement = await prisma.productMedia.findUnique({
    where: { id: attachmentId },
    select: { productId: true, mediaId: true, role: true },
  })
  if (!rattachement || rattachement.productId !== productId) {
    return { error: 'Ce visuel n’est pas sur cette fiche.' }
  }
  if (rattachement.role === role) return { ok: true }

  const conflit = await prisma.productMedia.findFirst({
    where: { productId, mediaId: rattachement.mediaId, role },
    select: { id: true },
  })
  if (conflit) {
    return {
      error: `Ce visuel occupe déjà le rôle « ${ROLE_LABELS[role] ?? role} » sur cette fiche. Retirez le doublon plutôt que de changer celui-ci.`,
    }
  }

  try {
    const fin = await positionSuivante(productId)
    await prisma.productMedia.update({
      where: { id: attachmentId },
      data: { role, position: fin },
    })
    await renumeroter(productId)
    await audit(
      staff,
      'product.media.role',
      'ProductMedia',
      attachmentId,
      { role: rattachement.role },
      { role },
    )
    await rafraichir(productId)

    return { ok: true, message: `Visuel déplacé vers « ${ROLE_LABELS[role] ?? role} ».` }
  } catch (error) {
    console.error('[fiche] changement de rôle impossible', error)
    return { error: "Le changement de rôle n'a pas abouti." }
  }
}
