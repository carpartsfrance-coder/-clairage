/**
 * Suivi des conversions Google Ads : les deux valeurs du compte, et la valeur
 * d'une vente.
 *
 * **Rien en dur.** L'identifiant `AW-…` et le libellé de l'action de
 * conversion sont donnés par Google Ads au moment où l'action est créée dans
 * le compte (Objectifs → Conversions → Nouvelle action de conversion). Ils
 * arrivent donc par l'environnement, comme `GOOGLE_SITE_VERIFICATION` : voir
 * `.env.example`. Tant qu'ils ne sont pas renseignés, **rien n'est posé dans
 * les pages** — ni balise, ni bandeau. Le site reste exactement ce qu'il est
 * aujourd'hui, et c'est volontaire : un bandeau de consentement qui ne
 * commande rien n'aurait aucun sens.
 *
 * Les deux valeurs sont publiques par nature (elles sont lues dans la page
 * par le navigateur du visiteur) : ce ne sont pas des secrets, d'où le
 * préfixe `NEXT_PUBLIC_`.
 */

/** `AW-123456789`, donné par Google Ads. */
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? ''

/** Le libellé de l'action de conversion « achat » (la suite après la barre). */
export const GOOGLE_ADS_LIBELLE_ACHAT =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LIBELLE_ACHAT?.trim() ?? ''

/**
 * Les deux valeurs sont là et ont la bonne forme.
 *
 * Le format est vérifié, pas seulement la présence : un `AW-` oublié ou un
 * libellé collé à l'identifiant donnerait une balise qui se charge, ne
 * remonte rien, et ne le dit pas. Autant ne rien poser du tout.
 */
export function baliseGoogleAdsConfiguree(): boolean {
  return (
    /^AW-[A-Za-z0-9_-]+$/.test(GOOGLE_ADS_ID) &&
    /^[A-Za-z0-9_-]+$/.test(GOOGLE_ADS_LIBELLE_ACHAT)
  )
}

/** `AW-123456789/AbC-dEf…` : ce que gtag attend en `send_to`. */
export function envoiConversionAchat(): string {
  return `${GOOGLE_ADS_ID}/${GOOGLE_ADS_LIBELLE_ACHAT}`
}

/**
 * La valeur d'une vente, en centimes : **TTC, remise déduite, port exclu**.
 *
 * Les trois décisions, et pourquoi :
 *
 * - **TTC**, parce que le flux Shopping annonce des prix TTC
 *   (`lib/flux-google.ts` : `g:price` reprend `priceCents`, et les prix de la
 *   boutique contiennent la TVA — voir `computeTotals`). Envoyer du HT ici
 *   mettrait les deux chiffres sur deux échelles : un article à 30 € dans le
 *   flux rapporterait 25 € en conversion, et tout ROAS cible serait faux de
 *   20 %.
 * - **Remise déduite**, parce qu'elle est déjà dans `totalCents` et qu'une
 *   vente à −20 % a rapporté 20 % de moins. C'est de l'argent encaissé qu'on
 *   mesure, pas un prix de catalogue.
 * - **Port exclu**, pour deux raisons. Google le connaît déjà à part
 *   (`g:shipping` dans le flux) : le compter ici le compterait deux fois. Et
 *   surtout, le port n'est pas un revenu que la campagne a produit — l'y
 *   inclure gonfle le ROAS des petits paniers, où il pèse le plus lourd, donc
 *   pousse les enchères vers exactement les commandes qui rapportent le moins.
 *
 * `totalCents = subtotalCents − discountCents + shippingCents` (lib/orders.ts),
 * donc retirer le port revient au sous-total remisé.
 */
export function valeurConversionCents(order: {
  totalCents: number
  shippingCents: number
}): number {
  return Math.max(0, order.totalCents - order.shippingCents)
}

/**
 * Un paiement de test ne doit jamais être remonté comme une vente : il
 * polluerait les conversions du compte, et les enchères intelligentes
 * apprendraient sur des commandes qui n'existent pas.
 *
 * L'exception est le développement, où **tout** paiement est simulé : sans
 * elle, le branchement serait invérifiable en local. Sur Render, `NODE_ENV`
 * vaut `production`, donc la garde s'applique — y compris pour une commande
 * de test passée sur le site réel avec les clés de test du prestataire.
 */
export function paiementReportable(isTestPayment: boolean): boolean {
  return !isTestPayment || process.env.NODE_ENV !== 'production'
}
