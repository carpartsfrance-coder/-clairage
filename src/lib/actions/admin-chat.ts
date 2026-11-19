'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { doitRelayerParEmail, nettoyerMessage, REPONSE_MAX, visiteurPresent } from '../chat'
import {
  carteDuConseil,
  chercherConseils,
  CLE_DISPONIBILITE,
  relayerReponse,
  varianteConseillable,
  type ProduitConseillable,
} from '../chat-serveur'

/**
 * Discussions en direct, côté équipe : répondre, clore, dire si l'on est là.
 *
 * Chaque action redemande `requireStaff` : une action de serveur est un point
 * d'entrée public, que la page l'affiche ou non (voir `admin/guard.ts`).
 */

export type DiscussionState = { error?: string; notice?: string }

export async function repondreDiscussion(
  _prev: DiscussionState,
  formData: FormData,
): Promise<DiscussionState> {
  const staff = await requireStaff('sav.handle')
  const id = String(formData.get('id') ?? '')
  const texte = nettoyerMessage(formData.get('body'), REPONSE_MAX) ?? ''

  // L'article joint est relu ici : un identifiant venu du formulaire ne
  // prouve pas qu'il est encore en vente.
  const varianteId = String(formData.get('variantId') ?? '')
  const variante = varianteId ? await varianteConseillable(varianteId) : null
  if (varianteId && !variante) {
    return { error: 'Cet article n’est plus en vente : choisissez-en un autre.' }
  }
  if (!texte && !variante) return { error: 'Le message est vide.' }

  const discussion = await prisma.conversation.findUnique({ where: { id } })
  if (!discussion) return { error: 'Discussion introuvable.' }

  const maintenant = new Date()
  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: id,
      authorKind: 'staff',
      authorId: staff.id,
      body: texte,
      variantId: variante?.id ?? null,
    },
  })
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: maintenant, staffReadAt: maintenant, status: 'OPEN' },
  })
  await audit(staff, 'chat.reply', 'Conversation', id, null, null).catch(() => {})

  /*
    Ce que l'équipe doit savoir après avoir répondu : le visiteur l'a-t-il
    sous les yeux, l'a-t-il reçue par e-mail, ou ne la verra-t-il qu'en
    revenant ? Les trois appellent des suites différentes.
  */
  let notice: string
  if (visiteurPresent(discussion.customerSeenAt, maintenant)) {
    notice = 'Réponse affichée chez le visiteur, qui est sur la page.'
  } else if (doitRelayerParEmail(discussion, maintenant)) {
    const envoi = await relayerReponse(discussion, message, carteDuConseil(variante))
    notice =
      envoi === 'envoye'
        ? `Le visiteur a quitté la page : réponse envoyée aussi à ${discussion.email}.`
        : envoi === 'simule'
          ? 'Le visiteur a quitté la page. Envoi d’e-mail simulé ici : aucun prestataire n’est configuré.'
          : 'Le visiteur a quitté la page, et l’e-mail n’a pas pu partir. Réessayez dans un instant.'
  } else {
    notice =
      'Réponse enregistrée. Le visiteur a quitté la page sans laisser d’e-mail : il la verra s’il revient sur le site depuis le même appareil.'
  }

  revalidatePath(`/admin/discussions/${id}`)
  revalidatePath('/admin/discussions')
  return { notice }
}

export async function changerStatutDiscussion(
  _prev: DiscussionState,
  formData: FormData,
): Promise<DiscussionState> {
  const staff = await requireStaff('sav.handle')
  const id = String(formData.get('id') ?? '')
  const close = formData.get('statut') === 'CLOSED'
  const discussion = await prisma.conversation.findUnique({ where: { id }, select: { status: true } })
  if (!discussion) return { error: 'Discussion introuvable.' }

  await prisma.conversation.update({ where: { id }, data: { status: close ? 'CLOSED' : 'OPEN' } })
  await audit(staff, close ? 'chat.close' : 'chat.reopen', 'Conversation', id, discussion, null).catch(
    () => {},
  )
  revalidatePath(`/admin/discussions/${id}`)
  revalidatePath('/admin/discussions')
  return {
    notice: close
      ? 'Discussion close. Si le visiteur réécrit, elle se rouvrira d’elle-même.'
      : 'Discussion rouverte.',
  }
}

/**
 * « Je suis là » / « Je m'absente ».
 *
 * Absente, l'équipe ne ferme pas la bulle : elle change ce qu'elle promet.
 * Le visiteur lit « nous vous répondons dès notre retour » et doit laisser
 * une adresse avec sa question. Une bulle qui disparaîtrait le soir
 * laisserait croire au visiteur du lendemain qu'il a rêvé.
 */
export async function changerDisponibilite(
  _prev: DiscussionState,
  formData: FormData,
): Promise<DiscussionState> {
  const staff = await requireStaff('sav.handle')
  const disponible = formData.get('disponible') === 'oui'
  const avant = await prisma.setting.findUnique({ where: { key: CLE_DISPONIBILITE } })
  await prisma.setting.upsert({
    where: { key: CLE_DISPONIBILITE },
    create: {
      key: CLE_DISPONIBILITE,
      value: disponible,
      group: 'discussion',
      label: 'Discussion en direct : équipe disponible',
      updatedBy: staff.id,
    },
    update: { value: disponible, updatedBy: staff.id },
  })
  await audit(staff, 'chat.availability', 'Setting', CLE_DISPONIBILITE, avant?.value ?? null, disponible).catch(
    () => {},
  )
  revalidatePath('/admin/discussions')
  return {
    notice: disponible
      ? 'Vous apparaissez « en ligne » dans la bulle.'
      : 'Vous apparaissez « absents » : les visiteurs laissent leur e-mail avec leur question.',
  }
}

/**
 * Recherche d'un article à joindre à une réponse. Réservée à l'équipe qui
 * répond : une action de serveur est un point d'entrée public, et cette
 * recherche lit le catalogue avec les stocks.
 */
export async function chercherConseil(terme: string): Promise<ProduitConseillable[]> {
  await requireStaff('sav.handle')
  if (typeof terme !== 'string') return []
  return chercherConseils(terme.slice(0, 80))
}
