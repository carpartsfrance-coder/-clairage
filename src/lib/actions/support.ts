'use server'

import { z } from 'zod'
import { prisma } from '../db'
import { getCurrentUser } from '../auth/session'
import { throttle, throttleMessage } from '../auth/throttle'
import { nextOrderReference } from '../stock-reservation'
import { buildContactDescription, contactSchema, contactSubjectLabel } from '../support'
import { emailIsSimulated, sendEmail } from '../email'
import { identity } from '../identity'

/**
 * Demande de vérification de compatibilité.
 *
 * Elle existe parce que la fiche produit avait un trou : quand la
 * compatibilité n'est pas établie, elle disait « demandez-nous de vérifier »
 * et renvoyait vers une page de contact qui n'est pas construite. Le client
 * n'avait donc aucun moyen de faire vérifier quoi que ce soit, et le bouton
 * principal restait « Ajouter au panier » — soit la seule action réellement
 * disponible, sur une pièce dont on ne sait pas si elle convient.
 *
 * La demande ouvre une vraie demande SAV, visible dans le back-office avec les
 * autres. Elle n'est pas une simulation.
 *
 * **Le contexte n'est jamais repris du formulaire.** Le navigateur n'envoie
 * que des identifiants ; les libellés (produit, conditionnement, véhicule,
 * équipement d'origine) sont relus en base au moment d'enregistrer. Un client
 * ne peut donc pas faire écrire au SAV une demande portant sur autre chose que
 * ce qu'il regardait.
 */

export type FitmentCheckState = {
  error?: string
  /** Référence de la demande ouverte, quand elle a abouti. */
  reference?: string
  /** Vrai quand aucun envoi d'e-mail n'est configuré : il faut le dire. */
  withoutEmail?: boolean
}

const schema = z
  .object({
    variantId: z.string().optional().or(z.literal('')),
    /** Génération visée quand la demande ne porte pas sur une référence. */
    generationId: z.string().optional().or(z.literal('')),
    configurationId: z.string().optional().or(z.literal('')),
    email: z.string().trim().email('Adresse e-mail invalide').max(160),
    message: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Boolean(value.variantId || value.generationId || value.configurationId), {
    message: 'Demande sans objet : aucune référence ni véhicule.',
  })

export async function requestFitmentCheck(
  _state: FitmentCheckState,
  formData: FormData,
): Promise<FitmentCheckState> {
  const parsed = schema.safeParse({
    variantId: formData.get('variantId') ?? '',
    generationId: formData.get('generationId') ?? '',
    configurationId: formData.get('configurationId') ?? '',
    email: formData.get('email'),
    message: formData.get('message') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Demande incomplète.' }
  }

  const { variantId, generationId, configurationId, email, message } = parsed.data

  const limite = await throttle('fitmentCheck', email)
  if (!limite.allowed) return { error: throttleMessage(limite.retryAfterSeconds) }

  try {
    // Les libellés viennent de la base, pas du formulaire.
    const variant = variantId
      ? await prisma.productVariant.findUnique({
          where: { id: variantId },
          include: { product: { select: { name: true, slug: true, status: true } } },
        })
      : null
    if (variantId && (!variant || !variant.active || variant.product.status !== 'PUBLISHED')) {
      return { error: "Cette référence n'est plus disponible." }
    }

    const configuration = configurationId
      ? await prisma.vehicleConfiguration.findUnique({
          where: { id: configurationId },
          include: {
            equipment: true,
            generation: { include: { model: { include: { make: true } } } },
          },
        })
      : null

    // À défaut de configuration (l'équipement n'est pas encore choisi), la
    // génération suffit à savoir de quel véhicule on parle.
    const generation =
      configuration?.generation ??
      (generationId
        ? await prisma.vehicleGeneration.findUnique({
            where: { id: generationId },
            include: { model: { include: { make: true } } },
          })
        : null)

    const vehicule = generation
      ? `${generation.model.make.name} ${generation.name}` +
        (generation.yearTo
          ? ` (${generation.yearFrom}–${generation.yearTo})`
          : ` (depuis ${generation.yearFrom})`)
      : 'Non précisé'

    const user = await getCurrentUser()

    /*
      Le contexte est écrit dans la description ET dans `lines`. La description
      est ce que lit l'équipe ; `lines` garde les identifiants, pour rattacher
      la réponse à la bonne référence sans la retrouver au texte.
    */
    const description = [
      variant ? `Produit : ${variant.product.name}` : null,
      variant ? `Conditionnement : ${variant.name} (réf. ${variant.sku})` : null,
      `Véhicule : ${vehicule}`,
      `Équipement d'origine : ${configuration?.equipment.label ?? 'Non précisé'}`,
      message ? `\nMessage du client :\n${message}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const reference = await prisma.$transaction(async (tx) => {
      const numero = await nextOrderReference(tx, 'SAV')
      await tx.supportTicket.create({
        data: {
          reference: numero,
          email,
          userId: user?.id ?? null,
          type: 'QUESTION',
          reason: variant
            ? 'Vérification de compatibilité'
            : "Identification de l'équipement d'origine",
          description,
          lines: {
            variantId: variant?.id ?? null,
            sku: variant?.sku ?? null,
            productSlug: variant?.product.slug ?? null,
            configurationId: configuration?.id ?? null,
            generationId: generation?.id ?? null,
          },
        },
      })
      return numero
    })

    const envoye = await prevenir({
      reference,
      email,
      subject: 'Vérification de compatibilité',
      description,
      orderReference: null,
    })
    return { reference, withoutEmail: !envoye }
  } catch (error) {
    console.error('[sav] demande de vérification impossible', error)
    return { error: "La demande n'a pas pu être enregistrée. Réessayez dans un instant." }
  }
}

/* -------------------------------------------------------------------------- */
/* Prise de contact                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Demande de contact ouverte depuis /contact.
 *
 * Même mécanique que la vérification de compatibilité, et c'est voulu : une
 * seule file de demandes, un seul format de référence, un seul écran de
 * traitement. Ce qui change, c'est le point de départ — ici le client n'arrive
 * pas d'une fiche produit, il n'y a donc aucun contexte à reprendre, et c'est
 * lui qui dit de quoi il veut parler.
 *
 * **Le formulaire ne dicte aucun libellé.** Le sujet circule par clé et son
 * intitulé est relu dans `CONTACT_SUBJECTS` ; la commande n'est nommée dans la
 * demande que si elle a été retrouvée en base. Le client choisit ce dont il
 * parle, pas ce qui sera écrit.
 */
export type ContactState = {
  error?: string
  /** Référence de la demande ouverte, quand elle a abouti. */
  reference?: string
  /** Vrai quand aucun envoi d'e-mail n'est configuré : il faut le dire. */
  withoutEmail?: boolean
}

export async function requestContact(
  _state: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    subject: formData.get('subject'),
    email: formData.get('email'),
    orderReference: formData.get('orderReference') ?? '',
    vehicle: formData.get('vehicle') ?? '',
    message: formData.get('message') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Demande incomplète.' }
  }

  const { subject, email, orderReference, vehicle, message } = parsed.data

  const limite = await throttle('contactRequest', email)
  if (!limite.allowed) return { error: throttleMessage(limite.retryAfterSeconds) }

  try {
    const user = await getCurrentUser()

    /*
      Rattachement de la commande.

      Référence ET adresse, comme le suivi invité : les références sont
      séquentielles, donc devinables, et une référence seule suffirait à relier
      n'importe qui à la commande d'un autre. Un client connecté est reconnu à
      son compte — il arrive qu'on commande avec une adresse et qu'on écrive
      depuis une autre.

      La recherche passe par le compteur `orderLookup`, celui du suivi : c'est
      la même capacité, elle doit coûter le même nombre d'essais. Sans cela, ce
      formulaire deviendrait le moyen de tester des références sans limite.
    */
    let order: { id: string; reference: string; placedAt: Date } | null = null
    if (orderReference) {
      const essai = await throttle('orderLookup', orderReference)
      if (!essai.allowed) return { error: throttleMessage(essai.retryAfterSeconds) }

      const trouvee = await prisma.order.findFirst({
        where: {
          reference: { equals: orderReference, mode: 'insensitive' },
          OR: [
            { email: { equals: email, mode: 'insensitive' } },
            ...(user ? [{ userId: user.id }] : []),
          ],
        },
        select: { id: true, reference: true, placedAt: true, createdAt: true },
      })

      /*
        Pas de rattachement silencieux : la demande partirait en disant porter
        sur une commande que le SAV ne pourrait pas ouvrir. Le client corrige
        sa référence, ou vide le champ et l'écrit dans son message.
      */
      if (!trouvee) {
        return {
          error:
            'Aucune commande ne correspond à cette référence et à cette adresse e-mail. Corrigez-la, ou laissez le champ vide.',
        }
      }

      // `placedAt` reste vide tant que la commande n'est pas payée : la date de
      // création situe quand même la demande dans le temps.
      order = {
        id: trouvee.id,
        reference: trouvee.reference,
        placedAt: trouvee.placedAt ?? trouvee.createdAt,
      }
    }

    const description = buildContactDescription({
      subject,
      message,
      vehicle: vehicle || null,
      order: order ? { reference: order.reference, placedAt: order.placedAt } : null,
      account: user ? { email: user.email } : null,
    })

    const reference = await prisma.$transaction(async (tx) => {
      const numero = await nextOrderReference(tx, 'SAV')
      await tx.supportTicket.create({
        data: {
          reference: numero,
          email,
          userId: user?.id ?? null,
          orderId: order?.id ?? null,
          type: 'QUESTION',
          reason: contactSubjectLabel(subject),
          description,
          // Les identifiants restent à côté du texte : l'équipe retrouve la
          // commande sans la relire dans la description.
          lines: {
            subject,
            orderId: order?.id ?? null,
            orderReference: order?.reference ?? null,
            // À côté du texte comme le reste : les demandes « véhicule non
            // listé » se relèvent ainsi d'un coup, pour savoir quelles photos
            // produire en priorité.
            vehicle: vehicle || null,
          },
        },
      })
      return numero
    })

    const envoye = await prevenir({
      reference,
      email,
      subject: contactSubjectLabel(subject),
      description,
      orderReference: order?.reference ?? null,
    })
    return { reference, withoutEmail: !envoye }
  } catch (error) {
    console.error('[sav] prise de contact impossible', error)
    return { error: "La demande n'a pas pu être enregistrée. Réessayez dans un instant." }
  }
}

/**
 * Accusé de réception au client, et alerte à l'équipe.
 *
 * Jusqu'ici, aucune demande ne partait par e-mail : l'envoi n'était pas
 * configuré. Il l'est en production, et la page de contact disait encore au
 * client qu'il ne recevrait rien — sur un site qu'il ne connaît pas, c'est
 * une raison de ne pas acheter. Quand l'envoi reste simulé (développement),
 * rien ne part et le retour le dit, comme avant.
 *
 * Un envoi en échec ne fait jamais échouer la demande : elle est enregistrée,
 * et l'équipe la voit dans le back-office.
 */
async function prevenir(demande: {
  reference: string
  email: string
  subject: string
  description: string
  orderReference: string | null
}): Promise<boolean> {
  if (emailIsSimulated()) return false
  try {
    await sendEmail({
      template: 'sav.ouverture',
      to: demande.email,
      subject: `${identity.name} — demande ${demande.reference} reçue`,
      variables: { reference: demande.reference, orderReference: demande.orderReference ?? '' },
    })
  } catch (error) {
    console.error('[sav] accusé de réception non envoyé', error)
    return false
  }
  if (identity.contact.email) {
    await sendEmail({
      template: 'equipe.demande',
      to: identity.contact.email,
      subject: `Nouvelle demande ${demande.reference} — ${demande.subject}`,
      variables: {
        reference: demande.reference,
        subject: demande.subject,
        email: demande.email,
        orderReference: demande.orderReference ?? '',
        message: demande.description,
      },
    }).catch((error) => console.error('[sav] alerte équipe non envoyée', error))
  }
  return true
}
