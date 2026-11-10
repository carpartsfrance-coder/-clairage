'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { slugify } from '../admin/vehicles'

/** Rédaction des guides de montage, publiés sous /guides/<adresse>. */

export type GuideState = { error?: string; notice?: string }

const DIFFICULTES = ['UNKNOWN', 'EASY', 'MEDIUM', 'HARD'] as const

export async function enregistrerGuide(_prev: GuideState, formData: FormData): Promise<GuideState> {
  const staff = await requireStaff('catalog.edit')
  const id = String(formData.get('id') ?? '') || null
  const title = String(formData.get('title') ?? '').trim()
  // Le navigateur envoie les retours à la ligne en \r\n ; un intertitre doit
  // être suivi d'une ligne vide pour être lu comme tel (components/ui/Prose).
  const body = String(formData.get('body') ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^(## .*)\n(?!\n)/gm, '$1\n\n')
    .trim()
  const summary = String(formData.get('summary') ?? '').trim() || null
  const slug = slugify(String(formData.get('slug') ?? '').trim() || title)
  const difficulte = String(formData.get('difficulty') ?? 'UNKNOWN')
  const duree = String(formData.get('durationMinutes') ?? '').trim()
  const publie = formData.get('published') === 'on'

  if (!title) return { error: 'Donnez un titre au guide.' }
  if (title.length > 160) return { error: 'Le titre est trop long (160 caractères au plus).' }
  if (!body) return { error: 'Le guide est vide : écrivez les étapes du montage.' }
  if (!slug) return { error: 'L’adresse du guide est vide.' }
  if (!DIFFICULTES.includes(difficulte as (typeof DIFFICULTES)[number])) return { error: 'Difficulté inconnue.' }
  const durationMinutes = duree ? Number(duree) : null
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 600)) {
    return { error: 'La durée doit être un nombre de minutes (ex. 15).' }
  }

  const doublon = await prisma.guide.findUnique({ where: { slug }, select: { id: true } })
  if (doublon && doublon.id !== id) return { error: `Un autre guide utilise déjà l’adresse /guides/${slug}.` }

  const avant = id ? await prisma.guide.findUnique({ where: { id } }) : null
  if (id && !avant) return { error: 'Ce guide n’existe plus.' }

  const data = {
    title,
    slug,
    summary,
    body,
    difficulty: difficulte as (typeof DIFFICULTES)[number],
    durationMinutes,
    metaDescription: summary,
    publishedAt: publie ? (avant?.publishedAt ?? new Date()) : null,
  }

  const guide = id
    ? await prisma.guide.update({ where: { id }, data })
    : await prisma.guide.create({ data })
  await audit(
    staff,
    id ? 'guide.update' : 'guide.create',
    'Guide',
    guide.id,
    avant ? { title: avant.title, slug: avant.slug, publishedAt: avant.publishedAt?.toISOString() ?? null } : null,
    { title, slug, publishedAt: data.publishedAt?.toISOString() ?? null },
  )
  revalidatePath('/admin/guides')
  revalidatePath('/guides')
  revalidatePath(`/guides/${slug}`)
  if (avant && avant.slug !== slug) revalidatePath(`/guides/${avant.slug}`)
  if (!id) redirect(`/admin/guides?modifier=${guide.id}&cree=1`)
  return { notice: publie ? `Enregistré. En ligne sur /guides/${slug}.` : 'Enregistré en brouillon (pas visible des clients).' }
}
