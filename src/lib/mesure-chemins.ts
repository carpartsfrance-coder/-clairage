/**
 * Ce que la mesure d'audience a le droit d'enregistrer d'une page et d'un clic.
 *
 * La mesure doit rester anonyme (exemption de consentement de la CNIL) : rien
 * de ce qu'elle garde ne doit permettre de retrouver une personne. Or certaines
 * adresses de pages portent un identifiant — le numéro d'une commande, d'une
 * facture, ou le jeton d'un lien « mot de passe oublié », qui est une clé du
 * compte. Et certains textes cliqués, dans le compte client ou la commande,
 * contiennent une adresse, un e-mail ou une référence de commande.
 *
 * Ces fonctions sont appelées dans le navigateur (Mesure.tsx), pour que rien de
 * tout cela ne parte, puis de nouveau par /api/mesure, qui ne fait confiance
 * à aucun envoi.
 */

const MASQUES: Array<[RegExp, string]> = [
  [/^\/commande\/[^/]+/, '/commande/…'],
  [/^\/compte\/commandes\/[^/]+/, '/compte/commandes/…'],
  [/^\/documents\/[^/]+/, '/documents/…'],
  [/^\/mot-de-passe-oublie\/[^/]+/, '/mot-de-passe-oublie/…'],
]

/** Le chemin, sans numéro de commande, de facture ni jeton. */
export function cheminSansIdentifiant(chemin: string): string {
  for (const [motif, masque] of MASQUES) {
    if (motif.test(chemin)) return chemin.replace(motif, masque)
  }
  return chemin
}

/** Pages où un texte cliqué peut contenir une donnée personnelle. */
const PAGES_PRIVEES =
  /^\/(compte|commande|connexion|inscription|mot-de-passe-oublie|suivi|contact|documents|verification)(\/|$)/

/**
 * Le texte du lien ou du bouton cliqué, ou rien s'il peut désigner quelqu'un :
 * un e-mail partout ; sur les pages privées, aussi tout texte qui contient
 * quatre chiffres d'affilée (code postal, téléphone, référence de commande).
 * Ailleurs les chiffres restent, ils sont utiles : « Peugeot 208 (2012–2019) ».
 */
export function libelleSansDonneePerso(
  chemin: string,
  libelle: string | null | undefined,
): string | undefined {
  if (!libelle) return undefined
  if (libelle.includes('@')) return undefined
  if (PAGES_PRIVEES.test(chemin) && /\d{4}/.test(libelle)) return undefined
  return libelle
}

/**
 * Les étapes qu'une page peut signaler à la mesure (attribut
 * `data-mesure-etape`) : la confirmation ne compte comme vente que si le
 * paiement est réellement encaissé, pas quand il a échoué ou attend encore.
 */
export const ETAPES_SIGNALEES = new Set(['commande-payee'])

/**
 * D'où vient une visite, d'après l'adresse d'arrivée et la page précédente.
 * Les clics de publicité portent un repère ajouté par la régie : Google en a
 * plusieurs (gclid, et gbraid / wbraid sur iPhone, où gclid manque souvent).
 */
export function sourceDeLaVisite(
  params: Pick<URLSearchParams, 'get' | 'has'>,
  referrer: string,
  origine: string,
): string {
  const court = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80)
  const utm = params.get('utm_source')?.trim()
  const campagne = params.get('utm_campaign')?.trim()
  if (utm) return court(campagne ? `${utm} / ${campagne}` : utm)
  if (['gclid', 'gbraid', 'wbraid', 'gad_source'].some((cle) => params.has(cle))) {
    return 'google (publicité)'
  }
  if (params.has('msclkid')) return 'bing (publicité)'
  if (params.has('ttclid')) return 'tiktok (publicité)'
  if (params.has('fbclid')) return 'facebook / instagram'
  try {
    const ref = referrer ? new URL(referrer) : null
    if (ref && ref.origin !== origine) return ref.hostname.replace(/^www\./, '')
  } catch {}
  return 'direct'
}
