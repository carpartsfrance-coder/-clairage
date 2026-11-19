import 'server-only'
import { createHash } from 'node:crypto'

/**
 * L'empreinte de l'e-mail du client, pour les conversions améliorées de
 * Google Ads.
 *
 * **Ce qui part, et ce qui ne part pas.** Google ne reçoit jamais l'adresse
 * elle-même : seulement son empreinte SHA-256, calculée ici, côté serveur,
 * avant que la page ne parte vers le navigateur. Une empreinte ne se
 * « déchiffre » pas : elle ne sert qu'à reconnaître une adresse que Google
 * connaît déjà (celle du compte Google de l'acheteur), pour rattacher la
 * vente au clic publicitaire quand les cookies n'y suffisent pas (autre
 * appareil, cookies effacés, Safari). Rien n'est envoyé sans l'accord du
 * visiteur : voir `components/consentement/ConversionAchat.tsx`.
 *
 * **La forme exacte compte.** Google compare des empreintes : une majuscule
 * ou un espace de trop donne une autre empreinte, et la vente n'est
 * rattachée à rien. D'où la normalisation qu'il demande avant le calcul :
 * espaces retirés, minuscules, et pour Gmail les points de la partie avant
 * l'arobase supprimés (Gmail les ignore : `jean.dupont` et `jeandupont` sont
 * la même boîte).
 */
export function empreinteEmail(email: string): string | null {
  let adresse = email.trim().toLowerCase()
  const arobase = adresse.lastIndexOf('@')
  if (arobase <= 0 || arobase === adresse.length - 1) return null
  const domaine = adresse.slice(arobase + 1)
  if (domaine === 'gmail.com' || domaine === 'googlemail.com') {
    adresse = `${adresse.slice(0, arobase).replaceAll('.', '')}@${domaine}`
  }
  return createHash('sha256').update(adresse).digest('hex')
}
