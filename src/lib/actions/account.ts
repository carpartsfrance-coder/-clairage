'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { prisma } from '../db'
import { getCurrentUser } from '../auth/session'
import { throttle, throttleMessage } from '../auth/throttle'
import { VEHICLE_COOKIE } from '../session'

/**
 * Actions de l'espace client.
 *
 * Toutes commencent par retrouver l'utilisateur de la session et posent son
 * identifiant dans le `where`. Un identifiant d'adresse ou de véhicule deviné
 * ne donne donc accès à rien : la requête ne trouve simplement pas la ligne.
 */

export type AccountState = { error?: string; notice?: string }

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().max(60).optional(),
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  company: z.string().trim().max(120).optional(),
  line1: z.string().trim().min(1, 'Adresse requise').max(160),
  line2: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().min(4, 'Code postal requis').max(12),
  city: z.string().trim().min(1, 'Ville requise').max(80),
  country: z.string().trim().length(2).default('FR'),
  phone: z.string().trim().max(32).optional(),
  isDefaultShipping: z.boolean().default(false),
})

export async function saveAddress(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Vous devez être connecté.' }

  const parsed = addressSchema.safeParse({
    id: formData.get('id') || undefined,
    label: formData.get('label') || undefined,
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    company: formData.get('company') || undefined,
    line1: formData.get('line1'),
    line2: formData.get('line2') || undefined,
    postalCode: formData.get('postalCode'),
    city: formData.get('city'),
    country: formData.get('country') || 'FR',
    phone: formData.get('phone') || undefined,
    isDefaultShipping: formData.get('isDefaultShipping') === 'on',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse incomplète.' }
  }

  const { id, isDefaultShipping, ...fields } = parsed.data
  const data = {
    ...fields,
    label: fields.label || null,
    company: fields.company || null,
    line2: fields.line2 || null,
    phone: fields.phone || null,
    isDefaultShipping,
    isDefaultBilling: isDefaultShipping,
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (isDefaultShipping) {
        // Une seule adresse par défaut : on retire le drapeau des autres avant
        // de le poser, sinon deux adresses se disputeraient le titre.
        await tx.address.updateMany({
          where: { userId: user.id },
          data: { isDefaultShipping: false, isDefaultBilling: false },
        })
      }

      if (id) {
        // `userId` dans le where : modifier l'adresse d'un autre est impossible.
        const updated = await tx.address.updateMany({
          where: { id, userId: user.id },
          data,
        })
        if (updated.count !== 1) throw new Error('adresse introuvable')
      } else {
        await tx.address.create({ data: { ...data, userId: user.id } })
      }
    })
  } catch (error) {
    console.error('[compte] enregistrement de l’adresse impossible', error)
    return { error: "L'adresse n'a pas pu être enregistrée." }
  }

  revalidatePath('/compte/adresses')
  return { notice: id ? 'Adresse modifiée.' : 'Adresse ajoutée.' }
}

export async function deleteAddress(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/connexion')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  try {
    await prisma.address.deleteMany({ where: { id, userId: user.id } })
  } catch (error) {
    console.error('[compte] suppression de l’adresse impossible', error)
  }
  revalidatePath('/compte/adresses')
}

/* -------------------------------------------------------------------------- */
/* Véhicules enregistrés                                                      */
/* -------------------------------------------------------------------------- */

const saveVehicleSchema = z.object({
  configurationId: z.string().min(1),
  nickname: z.string().trim().max(60).optional(),
  plate: z.string().trim().max(16).optional(),
})

/** Enregistre le véhicule actuellement sélectionné dans la session. */
export async function saveCurrentVehicle(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Vous devez être connecté.' }

  const store = await cookies()
  const parsed = saveVehicleSchema.safeParse({
    configurationId: formData.get('configurationId') || store.get(VEHICLE_COOKIE)?.value,
    nickname: formData.get('nickname') || undefined,
    plate: formData.get('plate') || undefined,
  })

  if (!parsed.success) {
    return { error: "Sélectionnez d'abord un véhicule." }
  }

  try {
    const configuration = await prisma.vehicleConfiguration.findFirst({
      where: { id: parsed.data.configurationId, active: true },
      select: { id: true },
    })
    if (!configuration) return { error: 'Ce véhicule est introuvable.' }

    const count = await prisma.savedVehicle.count({ where: { userId: user.id } })

    await prisma.savedVehicle.upsert({
      where: { userId_configurationId: { userId: user.id, configurationId: configuration.id } },
      update: {
        nickname: parsed.data.nickname || null,
        plate: parsed.data.plate || null,
      },
      create: {
        userId: user.id,
        configurationId: configuration.id,
        nickname: parsed.data.nickname || null,
        plate: parsed.data.plate || null,
        // Le premier véhicule enregistré devient le principal.
        isPrimary: count === 0,
      },
    })
  } catch (error) {
    console.error('[compte] enregistrement du véhicule impossible', error)
    return { error: "Le véhicule n'a pas pu être enregistré." }
  }

  revalidatePath('/compte/vehicules')
  return { notice: 'Véhicule enregistré.' }
}

export async function deleteSavedVehicle(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/connexion')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  try {
    await prisma.savedVehicle.deleteMany({ where: { id, userId: user.id } })
  } catch (error) {
    console.error('[compte] suppression du véhicule impossible', error)
  }
  revalidatePath('/compte/vehicules')
}

/** Sélectionne un véhicule enregistré pour la navigation en cours. */
export async function useSavedVehicle(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/connexion')

  const id = String(formData.get('id') ?? '')
  const saved = await prisma.savedVehicle.findFirst({
    where: { id, userId: user.id },
    select: { configurationId: true },
  })
  if (!saved) return

  const store = await cookies()
  store.set(VEHICLE_COOKIE, saved.configurationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })

  redirect('/vehicule/resultats')
}

/* -------------------------------------------------------------------------- */
/* Commandes invité                                                           */
/* -------------------------------------------------------------------------- */

const lookupSchema = z.object({
  reference: z.string().trim().min(4).max(40),
  email: z.string().trim().toLowerCase().email(),
})

/**
 * Suivi d'une commande passée sans compte.
 *
 * Il faut la référence ET l'adresse e-mail : la référence seule est séquentielle
 * et donc devinable. La combinaison est limitée en fréquence, et le message
 * d'échec est le même que la commande existe ou non — sinon ce formulaire
 * deviendrait un moyen de tester des références.
 */
export async function lookupGuestOrder(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const parsed = lookupSchema.safeParse({
    reference: formData.get('reference'),
    email: formData.get('email'),
  })

  const neutral: AccountState = {
    error: 'Aucune commande ne correspond à cette référence et à cette adresse e-mail.',
  }
  if (!parsed.success) return neutral

  const limit = await throttle('orderLookup', parsed.data.reference)
  if (!limit.allowed) return { error: throttleMessage(limit.retryAfterSeconds) }

  let destination: string | null = null
  try {
    const order = await prisma.order.findFirst({
      where: {
        reference: { equals: parsed.data.reference, mode: 'insensitive' },
        email: { equals: parsed.data.email, mode: 'insensitive' },
      },
      select: { id: true, guestToken: true },
    })

    if (!order?.guestToken) return neutral
    destination = `/commande/${order.id}/confirmation?t=${order.guestToken}`
  } catch (error) {
    console.error('[suivi] recherche impossible', error)
    return { error: 'Le suivi est indisponible pour le moment.' }
  }

  redirect(destination)
}

/**
 * Rattache une commande invité au compte connecté.
 *
 * Demande la référence en plus de l'adresse : sans elle, il suffirait de
 * s'inscrire avec l'adresse d'un autre pour récupérer ses commandes, puisque
 * les adresses ne sont pas encore vérifiées.
 */
export async function attachGuestOrder(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Vous devez être connecté.' }

  const parsed = lookupSchema.safeParse({
    reference: formData.get('reference'),
    email: formData.get('email') || user.email,
  })
  if (!parsed.success) return { error: 'Référence ou adresse e-mail invalide.' }

  const limit = await throttle('orderLookup', parsed.data.reference)
  if (!limit.allowed) return { error: throttleMessage(limit.retryAfterSeconds) }

  try {
    const order = await prisma.order.findFirst({
      where: {
        reference: { equals: parsed.data.reference, mode: 'insensitive' },
        email: { equals: parsed.data.email, mode: 'insensitive' },
        userId: null,
      },
      select: { id: true },
    })

    if (!order) {
      return {
        error:
          'Aucune commande sans compte ne correspond à cette référence et à cette adresse e-mail.',
      }
    }

    await prisma.order.update({ where: { id: order.id }, data: { userId: user.id } })
  } catch (error) {
    console.error('[compte] rattachement impossible', error)
    return { error: 'Le rattachement a échoué.' }
  }

  revalidatePath('/compte/commandes')
  return { notice: 'Commande rattachée à votre compte.' }
}
