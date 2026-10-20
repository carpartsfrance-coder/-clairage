import 'server-only'
import { prisma } from './db'
import { sellableQuantity } from './cart'
import { siteConfig } from './identity'

/**
 * Envoi des alertes de retour en stock.
 *
 * **Pourquoi un balayage, et non un déclenchement à l'écriture.** Le stock
 * remonte par plusieurs chemins — réception fournisseur, annulation de
 * commande, libération d'une réservation expirée, correction manuelle en
 * back-office — et chacun passe par un code différent. Accrocher l'envoi à
 * l'un d'eux reviendrait à prévenir dans un cas sur quatre, en silence. Le
 * cron repasse toutes les dix minutes sur les alertes en attente et regarde
 * l'état réel : un seul endroit à tenir, et aucun chemin oublié.
 *
 * **Un seul message par demande.** `notifiedAt` est posé AVANT la mise en
 * file. Si l'envoi échoue, le travail est rejoué par la file — mais la demande
 * n'est pas re-balayée, et le client ne reçoit pas deux messages parce qu'un
 * cron s'est chevauché avec le précédent.
 *
 * **Rien n'est réservé.** L'alerte prévient, elle ne met pas de côté : le
 * message le dit, parce qu'un client qui arrive deux jours plus tard sur une
 * rupture aurait le sentiment d'avoir été joué.
 */

export type AlerteARelancer = {
  id: string
  email: string
  variantId: string
  productName: string
  productSlug: string
  variantName: string
}

/**
 * Décide, pour un lot d'alertes et l'état du stock, lesquelles partent.
 *
 * Isolé du reste pour être testable : c'est la règle, pas la plomberie.
 * `vendable` vaut `null` quand la vente à découvert est ouverte — la référence
 * est alors commandable, donc l'alerte a lieu d'être envoyée.
 */
export function alertesAEnvoyer<T extends { id: string; variantId: string }>(
  alertes: readonly T[],
  vendableParVariante: ReadonlyMap<string, number | null>,
): T[] {
  return alertes.filter((alerte) => {
    const vendable = vendableParVariante.get(alerte.variantId)
    if (vendable === undefined) return false
    return vendable === null || vendable > 0
  })
}

/**
 * Relève les alertes en attente dont la référence est revenue, met un e-mail
 * en file pour chacune, et les marque notifiées. Renvoie le nombre d'envois
 * mis en file.
 */
export async function notifierRetoursEnStock(limite = 200): Promise<number> {
  const enAttente = await prisma.stockAlert.findMany({
    where: { notifiedAt: null, cancelledAt: null },
    take: limite,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      variantId: true,
      variant: {
        select: { name: true, product: { select: { name: true, slug: true, status: true } } },
      },
    },
  })
  if (enAttente.length === 0) return 0

  /*
    Une référence dépubliée ne déclenche rien : écrire « c'est revenu » en
    renvoyant vers une page qui répond 404 serait pire que le silence.
  */
  const servables = enAttente.filter((alerte) => alerte.variant.product.status === 'PUBLISHED')

  const vendableParVariante = new Map<string, number | null>()
  for (const variantId of new Set(servables.map((alerte) => alerte.variantId))) {
    vendableParVariante.set(variantId, await sellableQuantity(variantId))
  }

  const aEnvoyer = alertesAEnvoyer(servables, vendableParVariante)
  let misEnFile = 0

  for (const alerte of aEnvoyer) {
    // `updateMany` avec la condition `notifiedAt: null` : si un autre passage
    // l'a prise entre-temps, le compte vaut 0 et on ne met rien en file.
    const prise = await prisma.stockAlert.updateMany({
      where: { id: alerte.id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    })
    if (prise.count === 0) continue

    await prisma.jobQueue.create({
      data: {
        kind: 'email.send',
        payload: {
          template: 'stock.retour',
          to: alerte.email,
          subject: '',
          /*
            `variables` et non `secrets` : le nom du produit et son URL
            publique n'ont rien de confidentiel, et les voir dans `EmailLog`
            est précisément ce qui permet de vérifier ce qui est parti.
          */
          variables: {
            productName: alerte.variant.product.name,
            variantName: alerte.variant.name,
            productUrl: `${siteConfig.url}/p/${alerte.variant.product.slug}`,
          },
        },
      },
    })
    misEnFile += 1
  }

  return misEnFile
}
