'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { paymentIsSimulated } from '../payments'
import { applyPaymentOutcome } from '../orders'
import { prisma } from '../db'

/**
 * Issues du paiement simulé.
 *
 * Elles appellent `applyPaymentOutcome`, exactement comme le webhook Stripe :
 * le tunnel qu'on vérifie ici est bien celui qui tournera en production. Seul
 * l'encaissement diffère.
 *
 * Double garde : la fonction refuse de s'exécuter si un prestataire réel est
 * configuré, et refuse en production quoi qu'il arrive. Une issue de paiement
 * déclenchable depuis le navigateur serait sinon une porte ouverte sur la
 * validation gratuite de n'importe quelle commande.
 */

const schema = z.object({
  providerRef: z.string().trim().min(1),
  outcome: z.enum(['paid', 'failed', 'expired']),
})

export async function simulatePaymentOutcome(formData: FormData) {
  if (process.env.NODE_ENV === 'production' || !paymentIsSimulated()) {
    throw new Error('Le paiement simulé est indisponible dans cette configuration.')
  }

  const parsed = schema.safeParse({
    providerRef: formData.get('providerRef'),
    outcome: formData.get('outcome'),
  })
  if (!parsed.success) throw new Error('Demande invalide.')

  const payment = await prisma.payment.findUnique({
    where: { providerRef: parsed.data.providerRef },
    select: {
      orderId: true,
      amountCents: true,
      provider: true,
      order: { select: { guestToken: true } },
    },
  })
  if (!payment) throw new Error('Paiement introuvable.')
  if (payment.provider !== 'simulation') {
    throw new Error("Ce paiement n'est pas une simulation.")
  }

  await applyPaymentOutcome(
    parsed.data.providerRef,
    parsed.data.outcome,
    parsed.data.outcome === 'paid' ? payment.amountCents : null,
    { simulated: true, triggeredBy: 'page de simulation' },
  )

  // Le jeton suit la redirection : sans lui, le client se verrait refuser
  // l'accès à sa propre commande.
  const token = payment.order.guestToken ? `?t=${payment.order.guestToken}` : ''
  redirect(
    parsed.data.outcome === 'paid'
      ? `/commande/${payment.orderId}/confirmation${token}`
      : `/commande/${payment.orderId}/paiement${token ? `${token}&` : '?'}echec=${parsed.data.outcome}`,
  )
}
