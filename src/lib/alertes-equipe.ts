import 'server-only'
import webpush from 'web-push'
import { prisma } from './db'
import { can } from './admin/permissions'
import { identity, siteConfig } from './identity'

/**
 * Alertes instantanées : la notification du navigateur sur les appareils de
 * l'équipe, à chaque question posée dans la bulle.
 *
 * **Pourquoi en plus de l'e-mail.** Un visiteur venu d'une annonce reste
 * 38 secondes en médiane sur une fiche. Un e-mail arrive quand la messagerie
 * du téléphone veut bien le relever ; une notification sonne tout de suite.
 * L'e-mail reste : c'est la trace, et le filet si aucun appareil n'est abonné.
 *
 * **Sans service extérieur.** Le navigateur de l'équipe donne lui-même
 * l'adresse où le joindre (chez Apple, Google ou Mozilla, selon l'appareil)
 * et les clés qui chiffrent le message : le transporteur ne peut pas le lire.
 * Il n'y a ni compte à créer, ni abonnement à payer.
 *
 * **Les clés VAPID** signent nos envois, pour que les services de
 * notification sachent qu'ils viennent bien de la boutique. Elles sont lues
 * dans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` si ces variables existent ;
 * sinon elles sont créées au premier besoin et gardées en base, dans un
 * réglage du groupe `secret` que la page Paramètres n'affiche pas. Les
 * changer désabonne tous les appareils : il faudrait réactiver les alertes
 * sur chacun.
 */

const CLE_VAPID = 'push.vapid'

type Cles = { publicKey: string; privateKey: string }

let enMemoire: Cles | null = null

async function clesVapid(): Promise<Cles> {
  if (enMemoire) return enMemoire
  const depuisEnv = {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  }
  if (depuisEnv.publicKey && depuisEnv.privateKey) return (enMemoire = depuisEnv)

  const lire = async () => {
    const reglage = await prisma.setting.findUnique({ where: { key: CLE_VAPID } })
    const v = reglage?.value as Partial<Cles> | null | undefined
    return v?.publicKey && v?.privateKey ? { publicKey: v.publicKey, privateKey: v.privateKey } : null
  }

  const existantes = await lire()
  if (existantes) return (enMemoire = existantes)

  // Première fois : on crée la paire. Deux requêtes simultanées pourraient
  // chacune en créer une ; la clé du réglage étant unique, la seconde échoue
  // et relit celle de la première — tout le monde finit avec la même paire.
  const nouvelles = webpush.generateVAPIDKeys()
  try {
    await prisma.setting.create({
      data: {
        key: CLE_VAPID,
        value: { publicKey: nouvelles.publicKey, privateKey: nouvelles.privateKey },
        group: 'secret',
        label: 'Clés de signature des alertes instantanées',
      },
    })
    return (enMemoire = nouvelles)
  } catch {
    const gagnantes = await lire()
    if (!gagnantes) throw new Error('Clés des alertes introuvables')
    return (enMemoire = gagnantes)
  }
}

/** La clé publique, que le navigateur demande pour s'abonner. */
export async function clePubliqueAlertes(): Promise<string | null> {
  try {
    return (await clesVapid()).publicKey
  } catch (error) {
    console.error('[alertes] clés indisponibles', error)
    return null
  }
}

/**
 * Qui signe : l'adresse du site, ou à défaut l'adresse de contact. Apple
 * refuse une adresse locale, d'où le repli en développement.
 */
function signataire(): string {
  return siteConfig.url.startsWith('https://')
    ? siteConfig.url
    : `mailto:${identity.contact.email ?? 'contact@example.com'}`
}

export type Alerte = {
  titre: string
  texte: string
  /** Page ouverte au toucher de la notification. */
  url: string
  /** Une notification de même étiquette remplace la précédente. */
  etiquette: string
}

/**
 * Sonne sur les appareils abonnés.
 *
 * Par défaut, ceux de toute l'équipe qui peut répondre aux discussions ;
 * `seulement` restreint à un membre (alerte de test). Un appareil que le
 * service déclare disparu (404, 410 : alertes désactivées, navigateur
 * réinstallé) est retiré de la liste. Une panne ne remonte jamais jusqu'au
 * visiteur : son message est déjà enregistré.
 */
export async function notifierEquipe(
  alerte: Alerte,
  seulement?: { userId: string },
): Promise<{ envoyees: number; echecs: number }> {
  try {
    const cles = await clesVapid()
    const appareils = await prisma.staffPushSubscription.findMany({
      where: seulement ? { userId: seulement.userId } : {},
      include: { user: { select: { staffRole: true } } },
    })
    const destinataires = appareils.filter(
      (a) => a.user.staffRole && can(a.user.staffRole, 'sav.handle'),
    )
    if (destinataires.length === 0) return { envoyees: 0, echecs: 0 }

    const charge = JSON.stringify({
      titre: alerte.titre.slice(0, 80),
      texte: alerte.texte.slice(0, 180),
      url: alerte.url,
      tag: alerte.etiquette,
    })

    const resultats = await Promise.allSettled(
      destinataires.map(async (a) => {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            charge,
            {
              vapidDetails: { subject: signataire(), ...cles },
              // Une question vieille de dix minutes ne mérite plus de sonner.
              TTL: 600,
              urgency: 'high',
              timeout: 5000,
            },
          )
          await prisma.staffPushSubscription
            .update({ where: { id: a.id }, data: { lastSentAt: new Date() } })
            .catch(() => {})
        } catch (error) {
          const statut = (error as { statusCode?: number }).statusCode
          if (statut === 404 || statut === 410) {
            await prisma.staffPushSubscription.delete({ where: { id: a.id } }).catch(() => {})
          }
          throw error
        }
      }),
    )
    const echecs = resultats.filter((r) => r.status === 'rejected')
    for (const echec of echecs) {
      console.error('[alertes] notification non remise', (echec as PromiseRejectedResult).reason)
    }
    return { envoyees: resultats.length - echecs.length, echecs: echecs.length }
  } catch (error) {
    console.error('[alertes] envoi impossible', error)
    return { envoyees: 0, echecs: 1 }
  }
}
