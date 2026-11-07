'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { TAG_CATALOGUE } from '../cache-catalogue'
import {
  codeDepuisLibelle,
  estUnPaysConnu,
  eurosEnCentimes,
  nomDuPays,
  paysDejaPris,
} from '../livraison-pays'

/**
 * Zones et modes de livraison, depuis le back-office.
 *
 * Avant cette page, les deux modes (Colissimo et point relais, France
 * seulement) venaient du script d'amorçage et ne se changeaient qu'en base.
 * Tout ce que le site affiche et facture sur la livraison découle de ces
 * lignes : le choix et le prix au moment de commander (`lib/orders.ts` relit
 * le prix ici, jamais dans le formulaire), l'accroche des fiches, la page
 * « Livraison et retours » et le bandeau « livraison offerte ».
 *
 * Trois règles expliquent les refus :
 *
 * 1. **Un pays n'appartient qu'à une zone** (`paysDejaPris`) : sinon une même
 *    adresse recevrait deux grilles de prix.
 * 2. **Rien n'est supprimé.** Un mode qu'on n'utilise plus se désactive : une
 *    commande passée garde le nom et le prix du mode qu'elle a payé, mais
 *    effacer la ligne casserait l'historique de l'écran d'administration.
 * 3. **Le prix est en euros TTC à la saisie, en centimes en base**, comme
 *    partout ailleurs dans le catalogue.
 */

export type LivraisonAdminState = { error?: string; notice?: string }

function rafraichir() {
  revalidatePath('/admin/livraison')
  // Le bandeau « livraison offerte dès … » est lu par le cache partagé du
  // catalogue. `updateTag` le vide tout de suite : la page suivante montre le
  // nouveau seuil (`revalidateTag(…, 'max')` servirait encore l'ancien une fois).
  updateTag(TAG_CATALOGUE)
}

/* -------------------------------------------------------------------------- */
/* Zones                                                                      */
/* -------------------------------------------------------------------------- */

const zoneSchema = z.object({
  zoneId: z.string().optional(),
  label: z.string().trim().min(2, 'Nom de zone trop court').max(60),
  countries: z.array(z.string().length(2)).min(1, 'Cochez au moins un pays'),
})

export async function enregistrerZone(
  _state: LivraisonAdminState,
  formData: FormData,
): Promise<LivraisonAdminState> {
  const staff = await requireStaff('settings.edit')

  const parsed = zoneSchema.safeParse({
    zoneId: formData.get('zoneId') || undefined,
    label: formData.get('label'),
    countries: formData.getAll('countries').map(String),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Zone invalide.' }
  const { zoneId, label, countries } = parsed.data

  const inconnus = countries.filter((code) => !estUnPaysConnu(code))
  if (inconnus.length > 0) return { error: `Pays inconnu : ${inconnus.join(', ')}.` }

  try {
    const zones = await prisma.shippingZone.findMany({
      select: { id: true, label: true, code: true, countries: true },
    })
    const conflits = paysDejaPris(countries, zones, zoneId ?? null)
    if (conflits.length > 0) {
      const liste = conflits.map((c) => `${nomDuPays(c.code)} (déjà dans « ${c.zone} »)`)
      return { error: `Un pays ne peut être que dans une zone : ${liste.join(', ')}.` }
    }

    if (zoneId) {
      const avant = zones.find((zone) => zone.id === zoneId)
      if (!avant) return { error: 'Zone introuvable.' }
      await prisma.shippingZone.update({ where: { id: zoneId }, data: { label, countries } })
      await audit(staff, 'shipping.zone.update', 'ShippingZone', zoneId, avant, { label, countries })
      rafraichir()
      return { notice: `Zone « ${label} » enregistrée (${countries.length} pays).` }
    }

    const pris = new Set(zones.map((zone) => zone.code))
    const base = codeDepuisLibelle(label)
    let code = base
    for (let i = 2; pris.has(code); i += 1) code = `${base}-${i}`
    const zone = await prisma.shippingZone.create({
      data: { code, label, countries, position: zones.length },
    })
    await audit(staff, 'shipping.zone.create', 'ShippingZone', zone.id, null, { code, label, countries })
    rafraichir()
    return {
      notice: `Zone « ${label} » créée. Ajoutez-lui un mode de livraison : sans mode actif, ses pays ne sont pas proposés à la commande.`,
    }
  } catch (error) {
    console.error('[admin] zone de livraison', error)
    return { error: "La zone n'a pas pu être enregistrée." }
  }
}

/* -------------------------------------------------------------------------- */
/* Modes                                                                      */
/* -------------------------------------------------------------------------- */

const entierFacultatif = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 90), 'Nombre de jours invalide')

const modeSchema = z.object({
  methodId: z.string().optional(),
  zoneId: z.string().min(1),
  label: z.string().trim().min(2, 'Nom du mode trop court').max(80),
  carrier: z.string().trim().max(60),
  price: z.string(),
  freeFrom: z.string(),
  minDays: entierFacultatif,
  maxDays: entierFacultatif,
  position: z.coerce.number().int().min(0).max(999),
  active: z.boolean(),
})

export async function enregistrerMode(
  _state: LivraisonAdminState,
  formData: FormData,
): Promise<LivraisonAdminState> {
  const staff = await requireStaff('settings.edit')

  const parsed = modeSchema.safeParse({
    methodId: formData.get('methodId') || undefined,
    zoneId: formData.get('zoneId'),
    label: formData.get('label'),
    carrier: formData.get('carrier') ?? '',
    price: formData.get('price') ?? '',
    freeFrom: formData.get('freeFrom') ?? '',
    minDays: formData.get('minDays') ?? '',
    maxDays: formData.get('maxDays') ?? '',
    position: formData.get('position') ?? '0',
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Mode invalide.' }
  const d = parsed.data

  const priceCents = eurosEnCentimes(d.price)
  if (priceCents === null || Number.isNaN(priceCents)) {
    return { error: 'Prix invalide : écrivez par exemple 5,90 (ou 0 pour gratuit).' }
  }
  const freeFromCents = eurosEnCentimes(d.freeFrom)
  if (freeFromCents !== null && Number.isNaN(freeFromCents)) {
    return { error: 'Seuil de livraison offerte invalide : écrivez par exemple 80, ou laissez vide.' }
  }
  if (d.minDays !== null && d.maxDays !== null && d.minDays > d.maxDays) {
    return { error: 'Le délai minimum dépasse le délai maximum.' }
  }

  const donnees = {
    label: d.label,
    carrier: d.carrier || null,
    priceCents,
    freeFromCents,
    minDays: d.minDays,
    maxDays: d.maxDays,
    position: d.position,
    active: d.active,
  }

  try {
    if (d.methodId) {
      const avant = await prisma.shippingMethod.findUnique({ where: { id: d.methodId } })
      if (!avant || avant.zoneId !== d.zoneId) return { error: 'Mode introuvable.' }
      await prisma.shippingMethod.update({ where: { id: d.methodId }, data: donnees })
      await audit(staff, 'shipping.method.update', 'ShippingMethod', d.methodId, avant, donnees)
      rafraichir()
      return {
        notice: d.active
          ? `« ${d.label} » enregistré.`
          : `« ${d.label} » enregistré et désactivé : il n'est plus proposé à la commande.`,
      }
    }

    const existants = await prisma.shippingMethod.findMany({
      where: { zoneId: d.zoneId },
      select: { code: true },
    })
    const pris = new Set(existants.map((m) => m.code))
    const base = codeDepuisLibelle(d.label)
    let code = base
    for (let i = 2; pris.has(code); i += 1) code = `${base}-${i}`
    const mode = await prisma.shippingMethod.create({ data: { ...donnees, code, zoneId: d.zoneId } })
    await audit(staff, 'shipping.method.create', 'ShippingMethod', mode.id, null, { ...donnees, code })
    rafraichir()
    return { notice: `Mode « ${d.label} » ajouté.` }
  } catch (error) {
    console.error('[admin] mode de livraison', error)
    return { error: "Le mode de livraison n'a pas pu être enregistré." }
  }
}
