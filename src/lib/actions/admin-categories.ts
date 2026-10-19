'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff } from '../admin/guard'

/**
 * Gestion des catégories depuis le back-office.
 *
 * C'est l'écriture qui manquait pour que la navigation soit réellement
 * pilotable : le menu est construit depuis les catégories publiées
 * (`lib/queries/navigation.ts`), donc leur ordre, leur visibilité et leur
 * famille décident de ce que le client voit. Sans ces actions, changer le menu
 * demandait une migration ou une requête à la main.
 *
 * Trois garde-fous, et ils expliquent les refus :
 *
 * 1. **Dépublier n'efface rien.** Une catégorie retirée du menu garde ses
 *    produits et peut revenir ; aucune suppression n'est proposée ici, parce
 *    qu'elle casserait les liens déjà partagés et les rattachements produits.
 * 2. **Une catégorie reste joignable par son adresse même dépubliée** côté
 *    back-office : seul le site public l'ignore. Masquer dans l'administration
 *    ce qu'on vient de masquer au public rendrait l'opération irréversible à
 *    l'aveugle.
 * 3. **L'ordre est global et explicite.** On enregistre la position de chaque
 *    ligne d'un coup, pas un « monter / descendre » qui dépend de l'état lu à
 *    l'écran : deux onglets ouverts ne doivent pas se marcher dessus.
 */

export type CategoryAdminState = { error?: string; notice?: string }

const visibiliteSchema = z.object({
  categoryId: z.string().min(1),
  published: z.enum(['true', 'false']),
})

/** Publie ou dépublie une catégorie. Le menu suit immédiatement. */
export async function toggleCategoryVisibility(
  _state: CategoryAdminState,
  formData: FormData,
): Promise<CategoryAdminState> {
  await requireStaff('catalog.edit')

  const parsed = visibiliteSchema.safeParse({
    categoryId: formData.get('categoryId'),
    published: formData.get('published'),
  })
  if (!parsed.success) return { error: 'Demande invalide.' }

  try {
    const category = await prisma.category.update({
      where: { id: parsed.data.categoryId },
      data: { published: parsed.data.published === 'true' },
      select: { name: true, published: true },
    })

    revalidatePath('/admin/catalogue/categories')
    // Le menu est rendu dans le gabarit : il faut invalider la racine.
    revalidatePath('/', 'layout')

    return {
      notice: category.published
        ? `« ${category.name} » est publiée et réapparaît dans le menu.`
        : `« ${category.name} » est retirée du menu. Ses produits et son adresse sont conservés.`,
    }
  } catch (error) {
    console.error('[admin] visibilité de catégorie', error)
    return { error: "La catégorie n'a pas pu être mise à jour." }
  }
}

const ordreSchema = z.object({
  positions: z.array(z.object({ id: z.string().min(1), position: z.number().int().min(0) })),
})

/** Enregistre l'ordre de toutes les lignes affichées, en une transaction. */
export async function reorderCategories(
  _state: CategoryAdminState,
  formData: FormData,
): Promise<CategoryAdminState> {
  await requireStaff('catalog.edit')

  const brut = formData.getAll('position').map((valeur) => String(valeur))
  const ids = formData.getAll('categoryId').map((valeur) => String(valeur))

  if (brut.length !== ids.length) return { error: 'Demande invalide.' }

  const parsed = ordreSchema.safeParse({
    positions: ids.map((id, index) => ({ id, position: Number(brut[index]) })),
  })
  if (!parsed.success) {
    return { error: 'Les positions doivent être des nombres entiers positifs.' }
  }

  try {
    await prisma.$transaction(
      parsed.data.positions.map((entry) =>
        prisma.category.update({ where: { id: entry.id }, data: { position: entry.position } }),
      ),
    )

    revalidatePath('/admin/catalogue/categories')
    revalidatePath('/', 'layout')
    return { notice: "L'ordre des catégories est enregistré." }
  } catch (error) {
    console.error('[admin] ordre des catégories', error)
    return { error: "L'ordre n'a pas pu être enregistré." }
  }
}
