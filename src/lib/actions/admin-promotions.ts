'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff, audit } from '../admin/guard'
import { normaliserCode } from '../promotions'

/**
 * Création, modification et activation des codes promo.
 *
 * Les montants se saisissent en euros et les pourcentages en %, comme le
 * gérant les pense ; ils sont stockés en centimes et en points de base.
 */

export type PromoState = { error?: string; notice?: string }

const euros = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
const entier = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) ? n : NaN
}
const date = (v: FormDataEntryValue | null, finDeJournee = false) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(`${s}T${finDeJournee ? '23:59:59' : '00:00:00'}+01:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const schema = z.object({
  code: z
    .string()
    .min(3, 'Le code doit faire au moins 3 caractères.')
    .max(30, 'Le code est trop long (30 caractères au plus).')
    .regex(/^[A-Z0-9_-]+$/, 'Le code ne peut contenir que des lettres, des chiffres, - et _.'),
  label: z.string().trim().min(1, 'Donnez un nom à ce code (il apparaît dans le panier).').max(120),
  type: z.enum(['PERCENT', 'FIXED', 'FREE_SHIPPING']),
})

export async function enregistrerPromotion(_prev: PromoState, formData: FormData): Promise<PromoState> {
  const staff = await requireStaff('promotions.edit')
  const id = String(formData.get('id') ?? '') || null

  const parsed = schema.safeParse({
    code: normaliserCode(String(formData.get('code') ?? '')),
    label: formData.get('label'),
    type: formData.get('type'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' }
  const { code, label, type } = parsed.data

  let value = 0
  if (type === 'PERCENT') {
    const p = Number(String(formData.get('value') ?? '').trim().replace(',', '.'))
    if (!Number.isFinite(p) || p <= 0 || p > 100) return { error: 'Le pourcentage doit être entre 1 et 100.' }
    value = Math.round(p * 100)
  } else if (type === 'FIXED') {
    const m = euros(formData.get('value'))
    if (m === null || Number.isNaN(m) || m <= 0) return { error: 'Indiquez le montant de la remise en euros.' }
    value = m
  }

  const minOrderCents = euros(formData.get('minOrder'))
  const maxRedemptions = entier(formData.get('maxRedemptions'))
  const maxPerCustomer = entier(formData.get('maxPerCustomer'))
  const startsAt = date(formData.get('startsAt'))
  const endsAt = date(formData.get('endsAt'), true)
  if ([minOrderCents, maxRedemptions, maxPerCustomer].some((n) => Number.isNaN(n) || (n !== null && n < 0))) {
    return { error: 'Un des nombres saisis n’est pas valable.' }
  }
  if (startsAt === undefined || endsAt === undefined) return { error: 'Une des dates n’est pas valable.' }
  if (startsAt && endsAt && endsAt < startsAt) return { error: 'La date de fin est avant la date de début.' }

  const data = {
    code,
    label,
    type,
    value,
    minOrderCents,
    maxRedemptions,
    maxPerCustomer,
    startsAt,
    endsAt,
    freeShipping: type === 'FREE_SHIPPING' || formData.get('freeShipping') === 'on',
    active: formData.get('active') === 'on',
  }

  const doublon = await prisma.promotion.findUnique({ where: { code }, select: { id: true } })
  if (doublon && doublon.id !== id) return { error: `Le code ${code} existe déjà.` }

  if (id) {
    const avant = await prisma.promotion.findUnique({ where: { id } })
    if (!avant) return { error: 'Ce code n’existe plus.' }
    await prisma.promotion.update({ where: { id }, data })
    await audit(staff, 'promotion.update', 'Promotion', id, JSON.parse(JSON.stringify(avant)), JSON.parse(JSON.stringify(data)))
  } else {
    const cree = await prisma.promotion.create({ data })
    await audit(staff, 'promotion.create', 'Promotion', cree.id, null, JSON.parse(JSON.stringify(data)))
  }
  revalidatePath('/admin/promotions')
  return { notice: id ? `Code ${code} enregistré.` : `Code ${code} créé. Il marche tout de suite dans le panier.` }
}

export async function basculerPromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff('promotions.edit')
  const id = String(formData.get('id') ?? '')
  const promo = await prisma.promotion.findUnique({ where: { id }, select: { active: true } })
  if (!promo) return
  await prisma.promotion.update({ where: { id }, data: { active: !promo.active } })
  await audit(staff, promo.active ? 'promotion.disable' : 'promotion.enable', 'Promotion', id, { active: promo.active }, { active: !promo.active })
  revalidatePath('/admin/promotions')
}
