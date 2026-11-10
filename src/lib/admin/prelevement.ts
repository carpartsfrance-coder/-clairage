import { nomUtileDuConditionnement } from '../nom-conditionnement'
import type { listToPrepare } from '../queries/admin'

/**
 * La liste à prélever pour les commandes à préparer, regroupée par SKU.
 *
 * Un kit n'existe pas en rayon : ce qu'on va chercher, ce sont ses
 * composants (quantité du composant × quantité commandée).
 */
export type LigneDePrelevement = {
  sku: string
  designation: string
  quantite: number
  commandes: Set<string>
}

export function listePrelevement(
  orders: Awaited<ReturnType<typeof listToPrepare>>,
): LigneDePrelevement[] {
  const parSku = new Map<string, LigneDePrelevement>()

  function ajouter(sku: string, designation: string, quantite: number, orderId: string) {
    const ligne = parSku.get(sku)
    if (ligne) {
      ligne.quantite += quantite
      ligne.commandes.add(orderId)
      return
    }
    parSku.set(sku, { sku, designation, quantite, commandes: new Set([orderId]) })
  }

  for (const order of orders) {
    for (const line of order.lines) {
      const composants = line.variant?.components ?? []
      if (composants.length > 0) {
        for (const composant of composants) {
          ajouter(
            composant.component.sku,
            [
              composant.component.product.name,
              nomUtileDuConditionnement(composant.component.name, composant.component.product.name),
            ]
              .filter(Boolean)
              .join(' — '),
            composant.quantity * line.quantity,
            order.id,
          )
        }
      } else {
        // Pas de kit : on prélève la variante vendue, telle qu’elle a été
        // facturée (nom figé dans la ligne de commande).
        ajouter(
          line.sku,
          [line.productName, nomUtileDuConditionnement(line.variantName, line.productName)]
            .filter(Boolean)
            .join(' — '),
          line.quantity,
          order.id,
        )
      }
    }
  }

  return [...parSku.values()].sort((a, b) => a.sku.localeCompare(b.sku, 'fr'))
}
