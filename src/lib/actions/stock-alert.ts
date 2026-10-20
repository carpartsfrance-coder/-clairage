'use server'

import { z } from 'zod'
import { prisma } from '../db'
import { throttle, throttleMessage } from '../auth/throttle'
import { sellableQuantity } from '../cart'
import { VEHICLE_COOKIE } from '../session'
import { cookies } from 'next/headers'

/**
 * Alerte de retour en stock.
 *
 * La fiche d'un produit en rupture proposait de prévenir le client, sans rien
 * enregistrer : une promesse d'interface, et un client qui attend un message
 * qui ne partira jamais. Cette action enregistre vraiment la demande.
 *
 * Quatre règles, et elles tiennent toutes à la même idée — ne rien promettre
 * qu'on ne puisse tenir :
 *
 * 1. **Aucune alerte sur un produit disponible.** Si la variante est vendable,
 *    on ne pose pas d'alerte : le client doit acheter, pas attendre.
 * 2. **Pas de doublon.** La contrainte d'unicité (variante, adresse) le
 *    garantit en base ; redemander la même alerte confirme l'existante au lieu
 *    d'en créer une seconde, et aucun second message ne partira.
 * 3. **Aucune date inventée.** L'action n'annonce aucun délai : elle dit
 *    qu'on écrira dès le retour, ce qui est exactement ce qu'elle fait.
 * 4. **Le contexte est relu en base.** Le navigateur n'envoie qu'un
 *    identifiant de variante ; le véhicule vient du cookie de session, pas du
 *    formulaire.
 *
 * L'envoi, lui, est le travail du cron : voir `src/lib/stock-alerts.ts`.
 */

export type StockAlertState = {
  ok?: boolean
  message?: string
  error?: string
}

const schema = z.object({
  variantId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Cette adresse e-mail n'est pas valide."),
})

export async function requestStockAlert(
  _previous: StockAlertState,
  formData: FormData,
): Promise<StockAlertState> {
  const parsed = schema.safeParse({
    variantId: formData.get('variantId'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Demande invalide.' }
  }
  const { variantId, email } = parsed.data

  /*
    Limitation de débit : le formulaire est public et ne demande qu'une
    adresse. Sans garde-fou, il sert à inscrire n'importe qui depuis
    n'importe où.
  */
  const limite = await throttle('stockAlert', email)
  if (!limite.allowed) return { error: throttleMessage(limite.retryAfterSeconds) }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      active: true,
      product: { select: { status: true, name: true } },
    },
  })
  if (!variant || !variant.active || variant.product.status !== 'PUBLISHED') {
    return { error: "Cet article n'existe plus." }
  }

  // Règle 1 : rien à attendre si c'est vendable aujourd'hui.
  const vendable = await sellableQuantity(variantId)
  if (vendable === null || vendable > 0) {
    return {
      ok: true,
      message: `${variant.product.name} est de nouveau disponible : vous pouvez le commander.`,
    }
  }

  const configurationId = (await cookies()).get(VEHICLE_COOKIE)?.value ?? null

  const existante = await prisma.stockAlert.findUnique({
    where: { variantId_email: { variantId, email } },
    select: { id: true, notifiedAt: true, cancelledAt: true },
  })

  if (existante && !existante.cancelledAt && !existante.notifiedAt) {
    // Règle 2 : on confirme, on ne duplique pas.
    return { ok: true, message: 'Vous êtes déjà inscrit : nous vous écrirons dès le retour.' }
  }

  await prisma.stockAlert.upsert({
    where: { variantId_email: { variantId, email } },
    create: {
      variantId,
      email,
      configurationId,
    },
    // Une alerte déjà notifiée ou annulée se rouvre : le client redemande,
    // c'est une nouvelle attente, et elle repart à zéro.
    update: { notifiedAt: null, cancelledAt: null, configurationId, createdAt: new Date() },
  })

  return {
    ok: true,
    message: 'C’est noté. Nous vous écrirons dès que cette référence revient en stock.',
  }
}
