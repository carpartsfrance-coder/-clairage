'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../db'
import { requireStaff, audit, staffName } from '../admin/guard'
import { orderReservationLines, releaseReservation } from '../stock-reservation'
import { sendEmail } from '../email'
import { identity } from '../identity'

/**
 * Actions d'administration sur les commandes.
 *
 * Trois règles :
 *
 * 1. **Chaque action revérifie le droit.** La page qui affiche le bouton l'a
 *    déjà fait, mais une action de serveur est un point d'entrée public : elle
 *    est atteignable sans jamais voir la page.
 * 2. **La remise en stock est un choix explicite**, jamais une conséquence
 *    automatique d'un remboursement ou d'une annulation. Un article revenu
 *    cassé ne retourne pas en rayon, et seule la personne qui a le colis en
 *    main peut en décider.
 * 3. **Tout est tracé** dans `AuditLog` (qui a fait quoi) et `OrderEvent`
 *    (ce qu'il s'est passé sur la commande, visible du client quand c'est
 *    pertinent).
 */

export type AdminState = { error?: string; notice?: string }

/* -------------------------------------------------------------------------- */
/* Préparation et expédition                                                  */
/* -------------------------------------------------------------------------- */

const shipSchema = z.object({
  orderId: z.string().min(1),
  carrier: z.string().trim().min(1, 'Transporteur requis').max(80),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: z.string().trim().url('URL de suivi invalide').max(500).optional().or(z.literal('')),
  notifyCustomer: z.boolean().default(true),
})

export async function shipOrder(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireStaff('orders.fulfil')

  const parsed = shipSchema.safeParse({
    orderId: formData.get('orderId'),
    carrier: formData.get('carrier'),
    trackingNumber: formData.get('trackingNumber') || undefined,
    trackingUrl: formData.get('trackingUrl') || undefined,
    notifyCustomer: formData.get('notifyCustomer') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' }
  }

  const { orderId, carrier, trackingNumber, trackingUrl, notifyCustomer } = parsed.data

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: { where: { parentLineId: null } } },
    })
    if (!order) return { error: 'Commande introuvable.' }

    // On n'expédie pas ce qui n'est pas payé : ce serait livrer à crédit sans
    // l'avoir décidé.
    if (order.paymentStatus !== 'PAID') {
      return { error: "Cette commande n'est pas payée : elle ne peut pas être expédiée." }
    }
    if (order.status === 'CANCELLED') {
      return { error: 'Cette commande est annulée.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.create({
        data: {
          orderId,
          carrier,
          trackingNumber: trackingNumber || null,
          trackingUrl: trackingUrl || null,
          shippedAt: new Date(),
          lines: order.lines.map((line) => ({
            orderLineId: line.id,
            sku: line.sku,
            quantity: line.quantity,
          })) as Prisma.InputJsonValue,
        },
      })
      await tx.order.update({
        where: { id: orderId },
        data: { fulfillmentStatus: 'FULFILLED', status: 'SHIPPED' },
      })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'order.shipped',
          message: trackingNumber
            ? `Expédiée par ${carrier}, suivi ${trackingNumber}.`
            : `Expédiée par ${carrier}.`,
          actorId: staff.id,
          actorKind: 'staff',
        },
      })
    })

    await audit(staff, 'order.ship', 'Order', orderId, null, {
      carrier,
      trackingNumber: trackingNumber ?? null,
    })

    if (notifyCustomer) {
      await sendEmail({
        template: 'commande.expedition',
        to: order.email,
        subject: `${identity.name} — commande ${order.reference} expédiée`,
        variables: {
          reference: order.reference,
          carrier,
          trackingNumber: trackingNumber ?? null,
        },
        // L'URL de suivi n'est pas un secret, mais elle identifie le colis :
        // on la garde hors du journal par prudence.
        secrets: trackingUrl ? { trackingUrl } : undefined,
      }).catch((error) => console.error('[admin] e-mail d’expédition', error))
    }

    revalidatePath(`/admin/commandes/${orderId}`)
    revalidatePath('/admin/preparation')
    return {
      notice: notifyCustomer
        ? 'Expédition enregistrée, le client a été prévenu.'
        : 'Expédition enregistrée. Aucun e-mail envoyé.',
    }
  } catch (error) {
    console.error('[admin] expédition impossible', error)
    return { error: "L'expédition n'a pas pu être enregistrée." }
  }
}

/* -------------------------------------------------------------------------- */
/* Annulation                                                                 */
/* -------------------------------------------------------------------------- */

const cancelSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3, 'Indiquez un motif').max(300),
  /** Remise en stock : décision explicite, jamais déduite. */
  restock: z.boolean().default(false),
  notifyCustomer: z.boolean().default(true),
})

export async function cancelOrder(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireStaff('orders.cancel')

  const parsed = cancelSchema.safeParse({
    orderId: formData.get('orderId'),
    reason: formData.get('reason'),
    restock: formData.get('restock') === 'on',
    notifyCustomer: formData.get('notifyCustomer') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' }
  }

  const { orderId, reason, restock, notifyCustomer } = parsed.data

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return { error: 'Commande introuvable.' }
    if (order.status === 'CANCELLED') return { error: 'Cette commande est déjà annulée.' }

    const lines = await orderReservationLines(orderId)

    await prisma.$transaction(async (tx) => {
      if (restock) {
        if (order.paymentStatus === 'PAID') {
          // Commande payée : le stock était sorti, il faut le faire rentrer.
          for (const line of lines) {
            await tx.productVariant.update({
              where: { id: line.variantId },
              data: { stockOnHand: { increment: line.quantity } },
            })
            await tx.stockMovement.create({
              data: {
                variantId: line.variantId,
                delta: line.quantity,
                reason: 'cancel',
                reference: order.reference,
                actorId: staff.id,
              },
            })
          }
        } else {
          // Commande non payée : le stock était seulement réservé.
          await releaseReservation(tx, lines)
        }
      } else if (order.paymentStatus !== 'PAID') {
        // Même sans remise en rayon, une réservation sur une commande annulée
        // doit être rendue : sinon elle bloque du stock pour toujours.
        await releaseReservation(tx, lines)
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'order.cancelled',
          message: restock
            ? `Annulée par ${staffName(staff)} : ${reason}. Articles remis en stock.`
            : `Annulée par ${staffName(staff)} : ${reason}. Stock inchangé.`,
          actorId: staff.id,
          actorKind: 'staff',
        },
      })
    })

    await audit(staff, 'order.cancel', 'Order', orderId, { status: order.status }, {
      status: 'CANCELLED',
      reason,
      restock,
    })

    if (notifyCustomer) {
      await sendEmail({
        template: 'commande.annulation',
        to: order.email,
        subject: `${identity.name} — commande ${order.reference} annulée`,
        variables: { reference: order.reference, reason },
      }).catch((error) => console.error('[admin] e-mail d’annulation', error))
    }

    revalidatePath(`/admin/commandes/${orderId}`)
    return {
      notice: restock
        ? 'Commande annulée, articles remis en stock.'
        : 'Commande annulée. Le stock n’a pas été modifié.',
    }
  } catch (error) {
    console.error('[admin] annulation impossible', error)
    return { error: "L'annulation n'a pas abouti." }
  }
}

/* -------------------------------------------------------------------------- */
/* Remboursement                                                              */
/* -------------------------------------------------------------------------- */

const refundSchema = z.object({
  orderId: z.string().min(1),
  /** Montant en euros saisi par l'opérateur, converti en centimes ici. */
  amount: z.coerce.number().positive('Montant invalide'),
  reason: z.string().trim().min(3, 'Indiquez un motif').max(300),
  restock: z.boolean().default(false),
  notifyCustomer: z.boolean().default(true),
})

export async function refundOrder(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const staff = await requireStaff('orders.refund')

  const parsed = refundSchema.safeParse({
    orderId: formData.get('orderId'),
    amount: formData.get('amount'),
    reason: formData.get('reason'),
    restock: formData.get('restock') === 'on',
    notifyCustomer: formData.get('notifyCustomer') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' }
  }

  const { orderId, reason, restock, notifyCustomer } = parsed.data
  const amountCents = Math.round(parsed.data.amount * 100)

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: true, payments: { where: { status: 'PAID' }, take: 1 } },
    })
    if (!order) return { error: 'Commande introuvable.' }
    if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
      return { error: "Cette commande n'a pas été encaissée : il n'y a rien à rembourser." }
    }

    const alreadyRefunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
    const remaining = order.totalCents - alreadyRefunded

    if (amountCents > remaining) {
      // Garde-fou : on ne rembourse jamais plus que ce qui a été encaissé.
      return {
        error: `Montant trop élevé : il reste ${(remaining / 100).toFixed(2)} € remboursables sur cette commande.`,
      }
    }

    const lines = restock ? await orderReservationLines(orderId) : []
    const totalRefunded = alreadyRefunded + amountCents

    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          orderId,
          provider: order.payments[0]?.provider ?? 'manuel',
          amountCents,
          reason,
          restock,
          createdBy: staff.id,
        },
      })

      if (restock) {
        for (const line of lines) {
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { stockOnHand: { increment: line.quantity } },
          })
          await tx.stockMovement.create({
            data: {
              variantId: line.variantId,
              delta: line.quantity,
              reason: 'refund',
              reference: order.reference,
              actorId: staff.id,
            },
          })
        }
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: totalRefunded >= order.totalCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'payment.refunded',
          message:
            `Remboursement de ${(amountCents / 100).toFixed(2)} € par ${staffName(staff)} : ${reason}. ` +
            (restock ? 'Articles remis en stock.' : 'Stock inchangé.'),
          actorId: staff.id,
          actorKind: 'staff',
        },
      })
    })

    await audit(staff, 'order.refund', 'Order', orderId, { alreadyRefunded }, {
      amountCents,
      reason,
      restock,
      totalRefunded,
    })

    if (notifyCustomer) {
      await sendEmail({
        template: 'commande.remboursement',
        to: order.email,
        subject: `${identity.name} — remboursement de la commande ${order.reference}`,
        variables: { reference: order.reference, amountCents, reason },
      }).catch((error) => console.error('[admin] e-mail de remboursement', error))
    }

    revalidatePath(`/admin/commandes/${orderId}`)
    return {
      notice:
        `Remboursement de ${(amountCents / 100).toFixed(2)} € enregistré. ` +
        (restock ? 'Articles remis en stock.' : 'Le stock n’a pas été modifié.') +
        " Il n'a pas été exécuté chez le prestataire de paiement : à faire depuis son tableau de bord.",
    }
  } catch (error) {
    console.error('[admin] remboursement impossible', error)
    return { error: "Le remboursement n'a pas pu être enregistré." }
  }
}

/* -------------------------------------------------------------------------- */
/* Notes internes                                                             */
/* -------------------------------------------------------------------------- */

const noteSchema = z.object({
  orderId: z.string().min(1),
  body: z.string().trim().min(1, 'Note vide').max(2000),
})

export async function addOrderNote(_previous: AdminState, formData: FormData): Promise<AdminState> {
  // 'orders.note' et non 'orders.view' : écrire dans le dossier n'est pas le
  // lire. Masquer le formulaire ne protégeait rien — l'action est atteignable
  // sans jamais voir la page.
  const staff = await requireStaff('orders.note')

  const parsed = noteSchema.safeParse({
    orderId: formData.get('orderId'),
    body: formData.get('body'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Note invalide.' }

  try {
    await prisma.orderEvent.create({
      data: {
        orderId: parsed.data.orderId,
        // `note.internal` : l'espace client ne rend que les événements dont
        // actorKind n'est pas 'staff', cette note n'y apparaîtra donc jamais.
        type: 'note.internal',
        message: `${staffName(staff)} : ${parsed.data.body}`,
        actorId: staff.id,
        actorKind: 'staff',
      },
    })
    revalidatePath(`/admin/commandes/${parsed.data.orderId}`)
    return { notice: 'Note ajoutée. Elle est interne : le client ne la voit pas.' }
  } catch (error) {
    console.error('[admin] note impossible', error)
    return { error: "La note n'a pas pu être enregistrée." }
  }
}
