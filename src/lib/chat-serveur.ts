import 'server-only'
import { randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { Conversation, ConversationMessage, Prisma } from '@prisma/client'
import { prisma } from './db'
import { CART_COOKIE, getSelectedVehicle } from './session'
import { emailIsSimulated, sendEmail } from './email'
import { identity, siteConfig } from './identity'
import { ARGS_COUVERTURE, couverture } from './media-couverture'
import { couvertureType } from './images-types'
import { availabilityForKit, availabilityForVariant, availabilityLabel, isPurchasable } from './stock'
import type { CarteProduit, LignePanier, MessageVu } from './chat'

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

/* -------------------------------------------------------------------------- */
/* L'article conseillé                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'il faut lire d'une variante pour en faire une carte : les mêmes
 * lectures que le panier (`lib/cart.ts`) — photo de couverture, stock, kit —
 * pour que la carte et le panier ne disent jamais deux choses différentes.
 */
export const INCLURE_VARIANTE_CONSEIL = {
  product: {
    select: {
      slug: true,
      name: true,
      vehicleType: true,
      status: true,
      media: { ...ARGS_COUVERTURE, include: { media: true } },
    },
  },
  components: { orderBy: { position: 'asc' as const }, include: { component: true } },
} satisfies Prisma.ProductVariantInclude

export const INCLURE_CONSEIL = {
  variant: { include: INCLURE_VARIANTE_CONSEIL },
} satisfies Prisma.ConversationMessageInclude

type VarianteConseil = Prisma.ProductVariantGetPayload<{ include: typeof INCLURE_VARIANTE_CONSEIL }>
export type MessageAvecConseil = Prisma.ConversationMessageGetPayload<{ include: typeof INCLURE_CONSEIL }>

/**
 * La carte d'un article, ou rien s'il n'est plus en vente. Un conseil vieux
 * de trois jours sur un article retiré du catalogue garde son texte et perd
 * sa carte : mieux vaut pas de bouton qu'un bouton qui échoue.
 */
export function carteDuConseil(variante: VarianteConseil | null): CarteProduit | null {
  if (!variante || !variante.active || variante.product.status !== 'PUBLISHED') return null
  const dispo =
    variante.components.length > 0
      ? availabilityForKit(
          variante.components.map((entree) => ({
            quantity: entree.quantity,
            required: entree.required,
            component: entree.component,
          })),
        )
      : availabilityForVariant(variante)
  const photo = couverture(variante.product.media)?.media ?? couvertureType(variante.product)
  return {
    variantId: variante.id,
    nom: variante.product.name,
    option: variante.name !== variante.product.name ? variante.name : null,
    prixCents: variante.priceCents,
    image: photo ? { url: photo.url, alt: photo.alt ?? variante.product.name } : null,
    url: `/p/${variante.product.slug}`,
    achetable: isPurchasable(dispo),
    dispo: availabilityLabel(dispo),
  }
}

/** Une variante que l'équipe peut conseiller : active, et sur une fiche en ligne. */
export async function varianteConseillable(id: string): Promise<VarianteConseil | null> {
  if (!id) return null
  return prisma.productVariant
    .findFirst({
      where: { id, active: true, product: { status: 'PUBLISHED' } },
      include: INCLURE_VARIANTE_CONSEIL,
    })
    .catch(() => null)
}

export type ProduitConseillable = { produit: string; slug: string; variantes: CarteProduit[] }

function parProduit(variantes: VarianteConseil[]): ProduitConseillable[] {
  const groupes = new Map<string, ProduitConseillable>()
  for (const variante of variantes) {
    const carte = carteDuConseil(variante)
    if (!carte) continue
    const groupe = groupes.get(variante.product.slug) ?? {
      produit: variante.product.name,
      slug: variante.product.slug,
      variantes: [],
    }
    groupe.variantes.push(carte)
    groupes.set(variante.product.slug, groupe)
  }
  return [...groupes.values()]
}

/** Les conditionnements de la fiche que regardait le visiteur. */
export async function variantesDeLaFiche(slug: string | null): Promise<ProduitConseillable[]> {
  if (!slug) return []
  const variantes = await prisma.productVariant
    .findMany({
      where: { active: true, product: { slug, status: 'PUBLISHED' } },
      orderBy: { position: 'asc' },
      include: INCLURE_VARIANTE_CONSEIL,
    })
    .catch(() => [])
  return parProduit(variantes)
}

/**
 * Recherche d'un article à conseiller : chaque mot doit se retrouver dans le
 * nom du produit, celui du conditionnement ou la référence. Seuls les
 * articles en vente sont proposés — conseiller un brouillon enverrait le
 * client sur une page introuvable.
 */
export async function chercherConseils(terme: string): Promise<ProduitConseillable[]> {
  const mots = terme
    .split(/\s+/)
    .map((mot) => mot.trim())
    .filter((mot) => mot.length >= 2)
    .slice(0, 6)
  if (mots.length === 0) return []
  const variantes = await prisma.productVariant
    .findMany({
      where: {
        active: true,
        product: { status: 'PUBLISHED' },
        AND: mots.map((mot) => ({
          OR: [
            { sku: { contains: mot, mode: 'insensitive' as const } },
            { name: { contains: mot, mode: 'insensitive' as const } },
            { product: { name: { contains: mot, mode: 'insensitive' as const } } },
          ],
        })),
      },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
      take: 16,
      include: INCLURE_VARIANTE_CONSEIL,
    })
    .catch(() => [])
  return parProduit(variantes).slice(0, 6)
}

/** Les messages tels que le navigateur les reçoit. */
export function versLeNavigateur(messages: MessageAvecConseil[]): MessageVu[] {
  return messages.map((message) => {
    const produit = carteDuConseil(message.variant)
    return {
      id: message.id,
      de: message.authorKind === 'customer' ? 'client' : 'equipe',
      texte: message.body,
      le: message.createdAt.toISOString(),
      ...(produit ? { produit } : {}),
    }
  })
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
  conseil: CarteProduit | null = null,
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
        conseilNom: conseil ? [conseil.nom, conseil.option].filter(Boolean).join(' — ') : '',
        conseilLien: conseil ? `${siteConfig.url}${conseil.url}` : '',
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

/**
 * Nombre de discussions ouvertes dont le dernier mot est au visiteur.
 *
 * Lu à chaque page du back-office pour la pastille du menu : borné aux 200
 * discussions les plus récentes, ce qui reste une lecture légère. `cache`
 * évite de le relire deux fois dans la même requête (menu et titre).
 */
export const questionsEnAttente = cache(async (): Promise<number> => {
  try {
    const ouvertes = await prisma.conversation.findMany({
      where: { status: 'OPEN' },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      select: { messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { authorKind: true } } },
    })
    return ouvertes.filter((d) => d.messages[0]?.authorKind === 'customer').length
  } catch {
    return 0
  }
})
