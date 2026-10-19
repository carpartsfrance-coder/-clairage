'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff, audit } from '../admin/guard'
import { deleteFile, inspectUpload, putFile, storageStatus } from '../storage'

/**
 * Téléversement et administration des médias.
 *
 * Le contrôle du fichier est fait deux fois, et c'est voulu : la taille et le
 * type annoncés viennent du navigateur, donc d'une source non fiable.
 * `inspectUpload` relit les octets d'entête avant d'écrire quoi que ce soit.
 */

export type MediaState = { error?: string; notice?: string; mediaId?: string }

const uploadSchema = z.object({
  alt: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(300).optional(),
  nature: z.enum(['UNSPECIFIED', 'PRODUCT_PHOTO', 'ILLUSTRATION', 'TEST_PHOTO', 'DIAGRAM']),
  prefix: z.string().trim().regex(/^[a-z0-9-]{1,40}$/).optional(),
})

export async function uploadMedia(_previous: MediaState, formData: FormData): Promise<MediaState> {
  const staff = await requireStaff('catalog.edit')

  const status = storageStatus()
  if (!status.ok) {
    // On refuse plutôt que d'écrire là où le fichier disparaîtra.
    return { error: `Stockage mal configuré. ${status.problem ?? ''}`.trim() }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Aucun fichier reçu.' }

  const parsed = uploadSchema.safeParse({
    alt: formData.get('alt') || undefined,
    caption: formData.get('caption') || undefined,
    nature: formData.get('nature') || 'UNSPECIFIED',
    prefix: formData.get('prefix') || undefined,
  })
  if (!parsed.success) return { error: 'Informations du média invalides.' }

  const inspected = await inspectUpload(file)
  if (!inspected.ok) return { error: inspected.error }

  try {
    const stored = await putFile({
      bytes: inspected.bytes,
      mimeType: inspected.mimeType,
      extension: inspected.extension,
      prefix: parsed.data.prefix,
    })

    const media = await prisma.media.create({
      data: {
        storageKey: stored.key,
        url: stored.url,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        alt: parsed.data.alt || null,
        caption: parsed.data.caption || null,
        nature: parsed.data.nature,
        createdBy: staff.id,
      },
    })

    await audit(staff, 'media.upload', 'Media', media.id, null, {
      key: stored.key,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    })

    revalidatePath('/admin/medias')
    return {
      mediaId: media.id,
      notice: parsed.data.alt
        ? 'Média enregistré.'
        : "Média enregistré. Pensez à renseigner un texte alternatif : sans lui, l'image est muette pour une partie des visiteurs.",
    }
  } catch (error) {
    console.error('[medias] téléversement impossible', error)
    return { error: "Le fichier n'a pas pu être enregistré." }
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  alt: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(300).optional(),
  nature: z.enum(['UNSPECIFIED', 'PRODUCT_PHOTO', 'ILLUSTRATION', 'TEST_PHOTO', 'DIAGRAM']),
})

export async function updateMedia(_previous: MediaState, formData: FormData): Promise<MediaState> {
  const staff = await requireStaff('catalog.edit')

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    alt: formData.get('alt') || undefined,
    caption: formData.get('caption') || undefined,
    nature: formData.get('nature') || 'UNSPECIFIED',
  })
  if (!parsed.success) return { error: 'Informations invalides.' }

  try {
    const before = await prisma.media.findUnique({ where: { id: parsed.data.id } })
    if (!before) return { error: 'Média introuvable.' }

    await prisma.media.update({
      where: { id: parsed.data.id },
      data: {
        alt: parsed.data.alt || null,
        caption: parsed.data.caption || null,
        nature: parsed.data.nature,
      },
    })

    await audit(staff, 'media.update', 'Media', parsed.data.id, { alt: before.alt, nature: before.nature }, {
      alt: parsed.data.alt ?? null,
      nature: parsed.data.nature,
    })

    revalidatePath('/admin/medias')
    return { notice: 'Média mis à jour.' }
  } catch (error) {
    console.error('[medias] mise à jour impossible', error)
    return { error: "La mise à jour n'a pas abouti." }
  }
}

/**
 * Suppression.
 *
 * Elle est refusée — et le dit — quand le média est encore rattaché à une
 * fiche ou à une catégorie. Un clic qui ne fait rien sans rien expliquer
 * laisse croire à une panne ; ici le refus est un message.
 */
export async function removeMedia(_previous: MediaState, formData: FormData): Promise<MediaState> {
  const staff = await requireStaff('catalog.edit')
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Média non précisé.' }

  try {
    const media = await prisma.media.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true, categoryHeroes: true, vehicleMakeLogos: true },
        },
      },
    })
    if (!media) return { error: 'Média introuvable.' }

    // Les logos de marque comptent depuis qu'ils sont rattachables depuis
    // l'écran des véhicules : une garde qui n'en couvre que deux sur trois
    // laisse disparaître un logo sans prévenir.
    const uses =
      media._count.products + media._count.categoryHeroes + media._count.vehicleMakeLogos
    if (uses > 0) {
      return {
        error:
          `Ce média est utilisé à ${uses} endroit${uses > 1 ? 's' : ''} (fiches, catégories, logos de marque). ` +
          'Détachez-le d’abord : le supprimer laisserait un visuel manquant en ligne.',
      }
    }

    // La base d'abord, le fichier ensuite. Dans l'autre ordre, un échec de
    // suppression en base laisserait une ligne qui pointe vers un fichier
    // disparu — un carré vide servi sans erreur.
    await prisma.media.delete({ where: { id } })
    await deleteFile(media.storageKey)
    await audit(staff, 'media.delete', 'Media', id, { key: media.storageKey }, null)

    revalidatePath('/admin/medias')
    return { notice: 'Média supprimé.' }
  } catch (error) {
    console.error('[medias] suppression impossible', error)
    return { error: "La suppression n'a pas abouti." }
  }
}
