'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff } from '../admin/guard'
import { releverManques, publiable } from '../admin/completeness'

/**
 * Édition des fiches produit depuis le back-office.
 *
 * L'écran produit était en **lecture seule** : tout venait des imports, et
 * corriger une rubrique manquante ou un texte alternatif absent demandait une
 * requête à la main. Le relevé des manques montrait les trous sans permettre
 * de les boucher.
 *
 * Ce qui est éditable ici est exactement ce que le relevé reproche : rubrique,
 * accroche, référencement, textes alternatifs, et le statut. Le reste — prix,
 * stock, compatibilités, composition — a ses propres écrans ou ses propres
 * imports, et mélanger les deux donnerait un formulaire que personne ne relit.
 *
 * **Deux garde-fous, et le second est le plus important :**
 *
 * 1. `catalog.edit` pour modifier, `catalog.publish` pour publier. Ce sont des
 *    droits distincts parce que ce sont des gestes distincts : corriger une
 *    coquille n'est pas mettre une fiche en ligne.
 * 2. **On refuse de publier une fiche incomplète.** Le relevé est rejoué côté
 *    serveur au moment de la publication, et un manque bloquant arrête
 *    l'opération avec sa raison. Le cahier des charges demande d'« empêcher
 *    les validations incohérentes » : les empêcher à l'écran ne suffit pas,
 *    une action de serveur est un point d'entrée public.
 */

export type ProductEditState = {
  ok?: boolean
  message?: string
  error?: string
}

const texteOptionnel = z
  .string()
  .trim()
  .transform((valeur) => (valeur.length === 0 ? null : valeur))

const schemaInfos = z.object({
  productId: z.string().min(1),
  tagline: texteOptionnel,
  metaTitle: texteOptionnel,
  metaDescription: texteOptionnel,
  /** Rubriques retenues, dans l'ordre d'affichage. */
  categoryIds: z.array(z.string()).max(5),
})

export async function updateProductInfo(
  _previous: ProductEditState,
  formData: FormData,
): Promise<ProductEditState> {
  await requireStaff('catalog.edit')

  const parsed = schemaInfos.safeParse({
    productId: formData.get('productId'),
    tagline: formData.get('tagline') ?? '',
    metaTitle: formData.get('metaTitle') ?? '',
    metaDescription: formData.get('metaDescription') ?? '',
    categoryIds: formData.getAll('categoryIds').filter((valeur): valeur is string => typeof valeur === 'string' && valeur.length > 0),
  })
  if (!parsed.success) return { error: 'Formulaire invalide.' }
  const { productId, tagline, metaTitle, metaDescription, categoryIds } = parsed.data

  const produit = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  })
  if (!produit) return { error: 'Produit introuvable.' }

  /*
    Les rubriques sont réécrites d'un bloc, avec leur position. Un « ajouter /
    retirer » ligne à ligne dépendrait de ce que l'écran a lu au chargement :
    deux onglets ouverts se marcheraient dessus.
  */
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { tagline, metaTitle, metaDescription },
    }),
    prisma.productCategory.deleteMany({ where: { productId } }),
    ...categoryIds.map((categoryId, index) =>
      prisma.productCategory.create({ data: { productId, categoryId, position: index } }),
    ),
  ])

  revalidatePath(`/admin/catalogue/${productId}`)
  revalidatePath(`/p/${produit.slug}`)
  return { ok: true, message: 'Fiche enregistrée.' }
}

const schemaAlt = z.object({
  productId: z.string().min(1),
  mediaId: z.string().min(1),
  alt: z.string().trim().max(300),
})

/**
 * Texte alternatif d'un visuel.
 *
 * Il vit sur le média, pas sur le rattachement : la même image réutilisée
 * ailleurs décrit la même chose.
 */
export async function updateMediaAlt(
  _previous: ProductEditState,
  formData: FormData,
): Promise<ProductEditState> {
  await requireStaff('catalog.edit')

  const parsed = schemaAlt.safeParse({
    productId: formData.get('productId'),
    mediaId: formData.get('mediaId'),
    alt: formData.get('alt') ?? '',
  })
  if (!parsed.success) return { error: 'Formulaire invalide.' }

  await prisma.media.update({
    where: { id: parsed.data.mediaId },
    data: { alt: parsed.data.alt.length > 0 ? parsed.data.alt : null },
  })

  revalidatePath(`/admin/catalogue/${parsed.data.productId}`)
  return { ok: true, message: 'Texte alternatif enregistré.' }
}

const schemaStatut = z.object({
  productId: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
})

export async function setProductStatus(
  _previous: ProductEditState,
  formData: FormData,
): Promise<ProductEditState> {
  const parsed = schemaStatut.safeParse({
    productId: formData.get('productId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'Statut invalide.' }
  const { productId, status } = parsed.data

  // Publier est un droit distinct de modifier.
  await requireStaff(status === 'PUBLISHED' ? 'catalog.publish' : 'catalog.edit')

  const produit = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      categories: true,
      specs: true,
      media: { include: { media: { select: { alt: true } } } },
      variants: {
        include: {
          fitments: { select: { status: true, source: true, verifiedAt: true } },
        },
      },
    },
  })
  if (!produit) return { error: 'Produit introuvable.' }

  if (status === 'PUBLISHED') {
    const manques = releverManques(produit)
    if (!publiable(manques)) {
      const bloquants = manques.filter((manque) => manque.niveau === 'bloquant')
      return {
        error: `Publication refusée — ${bloquants.map((manque) => manque.champ.toLowerCase()).join(', ')}. Corrigez ces points, puis réessayez.`,
      }
    }
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      status,
      // La date de publication marque la première mise en ligne, et ne bouge
      // plus ensuite : elle sert de repère, pas de date de dernière
      // modification.
      publishedAt: status === 'PUBLISHED' ? (produit.publishedAt ?? new Date()) : produit.publishedAt,
      archivedAt: status === 'ARCHIVED' ? new Date() : null,
    },
  })

  revalidatePath(`/admin/catalogue/${productId}`)
  revalidatePath(`/p/${produit.slug}`)
  revalidatePath('/admin/catalogue')

  const libelles = { DRAFT: 'remise en brouillon', PUBLISHED: 'publiée', ARCHIVED: 'archivée' }
  return { ok: true, message: `Fiche ${libelles[status]}.` }
}
