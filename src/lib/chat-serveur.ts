import 'server-only'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import type { Conversation, ConversationMessage } from '@prisma/client'
import { prisma } from './db'
import { CART_COOKIE, getSelectedVehicle } from './session'
import { emailIsSimulated, sendEmail } from './email'
import { identity, siteConfig } from './identity'
import type { LignePanier, MessageVu } from './chat'

/**
 * Discussion en direct : lecture, écriture, alertes.
 *
 * Les règles (qui prévenir, quand relayer) sont dans `chat.ts` ; ce fichier
 * les applique.
 */

/** Clé du réglage « l'équipe répond en ce moment ». */
export const CLE_DISPONIBILITE = 'chat.disponible'

/**
 * L'équipe est-elle là pour répondre ?
 *
 * Réglé depuis la boîte des discussions. Sans réglage enregistré, la réponse
 * est oui : la bulle vient d'être posée, et elle doit fonctionner dès le
 * premier jour sans qu'on ait à penser à l'allumer.
 */
export async function disponibiliteChat(): Promise<boolean> {
  try {
    const reglage = await prisma.setting.findUnique({ where: { key: CLE_DISPONIBILITE } })
    return reglage ? reglage.value !== false : true
  } catch {
    // Base indisponible : on annonce l'absence, ce qui fait demander une
    // adresse au visiteur. C'est la promesse qu'on est sûr de tenir.
    return false
  }
}

/** 24 octets aléatoires, soit 32 caractères base64url. */
export function nouveauJeton(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Ce que l'équipe verra à côté de la question.
 *
 * **Tout est relu côté serveur.** Le navigateur n'envoie que l'identifiant de
 * la fiche ; le nom du produit, le véhicule et le panier viennent de la base
 * et des cookies de la boutique. Un visiteur ne peut donc pas faire afficher
 * à l'équipe un contexte qui n'est pas le sien — la même règle que la
 * demande de vérification de compatibilité (`actions/support.ts`).
 */
export async function contexteDuVisiteur(slug: string | null): Promise<{
  productSlug: string | null
  productName: string | null
  vehicleLabel: string | null
  cart: LignePanier[]
}> {
  const [produit, vehicule, panier] = await Promise.all([
    slug
      ? prisma.product
          .findFirst({ where: { slug, status: 'PUBLISHED' }, select: { slug: true, name: true } })
          .catch(() => null)
      : Promise.resolve(null),
    getSelectedVehicle(),
    lirePanierDuVisiteur(),
  ])
  return {
    productSlug: produit?.slug ?? null,
    productName: produit?.name ?? null,
    vehicleLabel: vehicule
      ? [vehicule.label, vehicule.equipmentLabel].filter(Boolean).join(' · ')
      : null,
    cart: panier,
  }
}

async function lirePanierDuVisiteur(): Promise<LignePanier[]> {
  const token = (await cookies()).get(CART_COOKIE)?.value
  if (!token) return []
  try {
    const panier = await prisma.cart.findUnique({
      where: { token },
      select: {
        lines: {
          select: {
            quantity: true,
            variant: { select: { name: true, priceCents: true, product: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
          take: 20,
        },
      },
    })
    return (panier?.lines ?? []).map((ligne) => ({
      produit: ligne.variant.product.name,
      // Une déclinaison unique porte souvent le nom du produit : le répéter
      // entre parenthèses n'apprendrait rien à l'équipe.
      option: ligne.variant.name === ligne.variant.product.name ? '' : ligne.variant.name,
      quantite: ligne.quantity,
      prixCents: ligne.variant.priceCents,
    }))
  } catch {
    return []
  }
}

/** Les messages tels que le navigateur les reçoit. */
export function versLeNavigateur(messages: ConversationMessage[]): MessageVu[] {
  return messages.map((message) => ({
    id: message.id,
    de: message.authorKind === 'customer' ? 'client' : 'equipe',
    texte: message.body,
    le: message.createdAt.toISOString(),
  }))
}

/**
 * Alerte l'équipe d'un nouveau message.
 *
 * Envoyée à l'adresse de contact de la boutique, comme les demandes SAV. Le
 * sujet porte le produit : sur un téléphone, c'est la seule ligne lue avant
 * d'ouvrir. Un échec d'envoi ne fait jamais échouer le message du visiteur —
 * il est enregistré, et la boîte des discussions le montre.
 */
export async function alerterEquipe(discussion: Conversation, texte: string): Promise<void> {
  const destinataire = identity.contact.email
  if (!destinataire) return
  try {
    await sendEmail({
      template: 'chat.message',
      to: destinataire,
      subject: `Question en direct${discussion.productName ? ` — ${discussion.productName}` : ''}`,
      variables: {
        id: discussion.id,
        message: texte,
        produit: discussion.productName ?? '',
        vehicule: discussion.vehicleLabel ?? '',
        page: discussion.pagePath ?? '',
        email: discussion.email ?? '',
        panier: resumePanier(discussion.cart),
      },
    })
    await prisma.conversation.update({
      where: { id: discussion.id },
      data: { alertedAt: new Date() },
    })
  } catch (error) {
    console.error('[chat] alerte équipe non envoyée', error)
  }
}

/**
 * Envoie une réponse de l'équipe au visiteur qui a quitté la page.
 *
 * Renvoie ce qu'il faut dire à l'équipe : envoyé, simulé, ou en échec.
 */
export async function relayerReponse(
  discussion: Conversation,
  message: ConversationMessage,
): Promise<'envoye' | 'simule' | 'echec'> {
  if (!discussion.email) return 'echec'
  try {
    const { simulated } = await sendEmail({
      template: 'chat.reponse',
      to: discussion.email,
      subject: `${identity.name} — réponse à votre question`,
      variables: {
        message: message.body,
        produit: discussion.productName ?? '',
        lien: `${siteConfig.url}${discussion.pagePath ?? '/'}`,
      },
    })
    if (!simulated) {
      await prisma.conversationMessage.update({
        where: { id: message.id },
        data: { emailedAt: new Date() },
      })
    }
    return simulated ? 'simule' : 'envoye'
  } catch (error) {
    console.error('[chat] relais par e-mail impossible', error)
    return 'echec'
  }
}

/** Vrai quand aucun e-mail ne peut réellement partir (développement). */
export function chatSansEmail(): boolean {
  return emailIsSimulated()
}

function resumePanier(valeur: unknown): string {
  if (!Array.isArray(valeur) || valeur.length === 0) return ''
  return (valeur as LignePanier[])
    .map((l) => `${l.quantite} × ${l.produit}${l.option ? ` (${l.option})` : ''}`)
    .join(', ')
}
