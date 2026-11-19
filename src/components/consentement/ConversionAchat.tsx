'use client'

import { useEffect } from 'react'
import { envoiConversionAchat } from '@/lib/google-ads'
import {
  EVENEMENT_CONSENTEMENT,
  choixEnregistre,
  envoyer,
  refusDuNavigateur,
} from './accord'

/**
 * La conversion « achat » remontée à Google Ads, depuis la page de
 * confirmation.
 *
 * **`transaction_id` est la pièce maîtresse**, pas un ornement. La page de
 * confirmation est rechargée : le client y revient depuis son e-mail, et elle
 * se rafraîchit d'elle-même toutes les dix secondes tant que la banque n'a pas
 * répondu. Sans numéro de transaction, chaque passage compterait une vente de
 * plus, et le ROAS de la campagne serait faux d'autant. Avec lui, Google
 * reconnaît la commande déjà reçue et ignore les doublons. Le repère local
 * ci-dessous évite les envois inutiles dans une même navigation ; c'est
 * `transaction_id` qui protège des rechargements.
 *
 * Ce qui part : la référence de commande, le montant, la devise, et
 * l'**empreinte** de l'e-mail du client (conversions améliorées). Jamais
 * l'adresse e-mail elle-même, ni le nom, ni l'adresse postale, ni les
 * articles. L'empreinte est calculée côté serveur (`lib/google-ads-serveur.ts`)
 * : l'adresse en clair ne passe même pas par ce composant. Elle permet à
 * Google de rattacher la vente au clic quand les cookies n'y suffisent pas
 * (autre appareil, cookies effacés, Safari).
 *
 * L'empreinte est posée par `set` **avant** l'événement : gtag joint les
 * `user_data` en place au moment où la conversion part, pas après.
 *
 * Rien n'est envoyé sans accord explicite — voir `accord.ts`. Si le
 * visiteur accepte alors que cette page est déjà affichée, l'envoi part à ce
 * moment-là.
 */

/** Les ventes déjà envoyées dans cette navigation. */
const envoyees = new Set<string>()

export function ConversionAchat({
  reference,
  valeurCents,
  devise,
  empreinteEmail,
}: {
  reference: string
  valeurCents: number
  devise: string
  /** SHA-256 de l'e-mail normalisé, ou `null` si l'adresse est inutilisable. */
  empreinteEmail: string | null
}) {
  useEffect(() => {
    function tenter() {
      if (envoyees.has(reference)) return
      if (refusDuNavigateur() || choixEnregistre() !== 'accepte') return
      envoyees.add(reference)
      if (empreinteEmail) {
        envoyer('set', 'user_data', { sha256_email_address: empreinteEmail })
      }
      envoyer('event', 'conversion', {
        send_to: envoiConversionAchat(),
        // Google attend des unités, pas des centimes.
        value: valeurCents / 100,
        currency: devise,
        transaction_id: reference,
      })
    }
    tenter()
    window.addEventListener(EVENEMENT_CONSENTEMENT, tenter)
    return () => window.removeEventListener(EVENEMENT_CONSENTEMENT, tenter)
  }, [reference, valeurCents, devise, empreinteEmail])

  return null
}
