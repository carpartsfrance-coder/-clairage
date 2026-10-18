/**
 * Erreurs de webhook.
 *
 * La distinction porte à conséquence, parce que le code de réponse décide de ce
 * que fait le prestataire ensuite :
 *
 *  - **Refus** (`WebhookRefusedError`) : l'appel n'est pas authentique. Chez
 *    Stripe, c'est une signature absente ou fausse. On répond 400 et on ne
 *    souhaite aucune relance : il n'y a rien à rejouer.
 *
 *  - **Panne passagère** (toute autre erreur) : notre côté, ou le prestataire,
 *    n'a pas pu répondre. On répond 500 pour que l'appel soit RELANCÉ. C'est
 *    vital chez Mollie, qui relance dix fois sur vingt-six heures puis
 *    abandonne définitivement — et qui ne permet pas de redéclencher un appel
 *    soi-même. Répondre 400 à une panne passagère brûlerait une tentative.
 */
export class WebhookRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookRefusedError'
  }
}
