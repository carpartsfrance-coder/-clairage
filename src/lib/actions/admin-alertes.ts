'use server'

import { headers } from 'next/headers'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { adresseDeNotificationAcceptee, libelleAppareil } from '../chat'
import { notifierEquipe } from '../alertes-equipe'

/**
 * Abonner un appareil de l'équipe aux alertes instantanées, le désabonner,
 * et lui envoyer une alerte d'essai.
 *
 * L'abonnement est rattaché au membre connecté : un appareil partagé qui
 * change de main change de destinataire (l'adresse de l'appareil est unique).
 */

export type AbonnementNavigateur = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type ResultatAlertes = { ok: boolean; message: string }

const CLE = /^[A-Za-z0-9_-]{8,200}={0,2}$/

export async function enregistrerAppareil(abonnement: AbonnementNavigateur): Promise<ResultatAlertes> {
  const staff = await requireStaff('sav.handle')
  const { endpoint, keys } = abonnement ?? ({} as AbonnementNavigateur)
  if (!adresseDeNotificationAcceptee(endpoint) || !CLE.test(keys?.p256dh ?? '') || !CLE.test(keys?.auth ?? '')) {
    return { ok: false, message: 'Cet appareil a fourni un abonnement que la boutique ne reconnaît pas.' }
  }
  const label = libelleAppareil((await headers()).get('user-agent') ?? '')
  const existant = await prisma.staffPushSubscription.findUnique({ where: { endpoint }, select: { id: true } })
  await prisma.staffPushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: staff.id, label },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: staff.id, label },
  })
  if (!existant) await audit(staff, 'alertes.abonnement', 'StaffPushSubscription', null, null, { label }).catch(() => {})
  return { ok: true, message: `Alertes actives sur cet appareil (${label}).` }
}

export async function retirerAppareil(endpoint: string): Promise<ResultatAlertes> {
  const staff = await requireStaff('sav.handle')
  if (typeof endpoint !== 'string' || !endpoint) return { ok: false, message: 'Appareil inconnu.' }
  await prisma.staffPushSubscription.deleteMany({ where: { endpoint, userId: staff.id } })
  return { ok: true, message: 'Alertes coupées sur cet appareil.' }
}

export async function envoyerAlerteEssai(): Promise<ResultatAlertes> {
  const staff = await requireStaff('sav.handle')
  const { envoyees, echecs } = await notifierEquipe(
    {
      titre: 'Alerte d’essai — LEDVROOM',
      texte: 'Si vous lisez ceci, les questions des visiteurs vous arriveront ici, tout de suite.',
      url: '/admin/discussions',
      etiquette: 'essai',
    },
    { userId: staff.id },
  )
  if (envoyees === 0 && echecs === 0) {
    return { ok: false, message: 'Aucun appareil abonné à votre nom : activez d’abord les alertes.' }
  }
  if (echecs > 0 && envoyees === 0) {
    return { ok: false, message: 'L’alerte n’a pas pu partir. Désactivez puis réactivez les alertes sur cet appareil.' }
  }
  return {
    ok: true,
    message:
      envoyees > 1
        ? `Alerte envoyée à vos ${envoyees} appareils. Elle doit arriver dans les secondes qui viennent.`
        : 'Alerte envoyée. Elle doit arriver dans les secondes qui viennent.',
  }
}
