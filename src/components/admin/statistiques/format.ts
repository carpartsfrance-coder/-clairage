/**
 * Mise en forme commune aux écrans de statistiques : nombres, taux, durées,
 * noms de pages et de provenances. Un seul endroit, pour qu'un « 12 s » ou un
 * « 4,2 % » se lise de la même façon partout.
 */

export const nb = (n: number) => n.toLocaleString('fr-FR')

/** Pourcentage arrondi à l'unité, ou un tiret si la base est nulle. */
export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—')

/** Avec une décimale : un taux d'achat se lit souvent entre 0 et 5 %. */
export const pct1 = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1).replace('.', ',')} %` : '—'

/** Une durée lisible : « 8 s », « 1 min 05 », « 1 h 02 ». */
export function duree(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')}`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export const euros = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export const nomSource = (source: string | null) =>
  !source ? '—' : source === 'direct' ? 'Accès direct ou inconnu' : source

const NOMS_PAGES: Array<[RegExp, string]> = [
  [/^\/$/, 'Accueil'],
  [/^\/panier$/, 'Panier'],
  [/^\/commande$/, 'Commande (adresse, livraison)'],
  [/^\/commande\/[^/]+\/paiement$/, 'Paiement'],
  [/^\/commande\/[^/]+\/confirmation$/, 'Commande confirmée'],
  [/^\/vehicule\/resultats/, 'Résultats pour le véhicule'],
  [/^\/vehicule$/, 'Choix du véhicule'],
  [/^\/recherche$/, 'Recherche'],
  [/^\/c$/, 'Toutes les catégories'],
  [/^\/cookies$/, 'Cookies'],
  [/^\/contact$/, 'Contact'],
]

/** Le nom humain d'une page, quand elle en a un. */
export function nomPage(path: string | null): string | null {
  if (!path) return null
  for (const [re, nom] of NOMS_PAGES) if (re.test(path)) return nom
  return null
}

const heure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const jourHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export const formatHeure = (d: Date) => heure.format(d)
export const formatJourHeure = (d: Date) => jourHeure.format(d)
