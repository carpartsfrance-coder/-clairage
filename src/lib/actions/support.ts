'use server'

import { z } from 'zod'
import { prisma } from '../db'
import { getCurrentUser } from '../auth/session'
import { throttle, throttleMessage } from '../auth/throttle'
import { nextOrderReference } from '../stock-reservation'

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

    /*
      Aucun e-mail n'est envoyé ici. L'expédition réelle n'est pas encore
      activée sur cet environnement, et une confirmation qui annoncerait un
      message parti serait fausse. La demande, elle, est bien enregistrée : le
      retour le dit, et donne la référence pour la suivre.
    */
    return { reference, withoutEmail: true }
  } catch (error) {
    console.error('[sav] demande de vérification impossible', error)
    return { error: "La demande n'a pas pu être enregistrée. Réessayez dans un instant." }
  }
}
