/**
 * Pays de livraison possibles, et règles de saisie des zones et des modes.
 *
 * Module pur (ni base ni serveur) : la page « Livraison » du back-office, le
 * tunnel de commande et les tests s'en servent tous.
 *
 * La liste couvre l'Europe entière. Elle sépare l'Union européenne du reste,
 * parce qu'un envoi hors UE (Royaume-Uni, Suisse, Norvège…) passe en douane :
 * le client peut avoir des droits et une TVA locale à payer à la réception.
 * C'est à savoir avant d'ouvrir ces pays, pas après le premier colis bloqué.
 */

export type Pays = { code: string; nom: string; ue: boolean }

const UE = [
  ['FR', 'France'],
  ['BE', 'Belgique'],
  ['LU', 'Luxembourg'],
  ['DE', 'Allemagne'],
  ['NL', 'Pays-Bas'],
  ['IT', 'Italie'],
  ['ES', 'Espagne'],
  ['PT', 'Portugal'],
  ['AT', 'Autriche'],
  ['IE', 'Irlande'],
  ['DK', 'Danemark'],
  ['SE', 'Suède'],
  ['FI', 'Finlande'],
  ['PL', 'Pologne'],
  ['CZ', 'Tchéquie'],
  ['SK', 'Slovaquie'],
  ['HU', 'Hongrie'],
  ['SI', 'Slovénie'],
  ['HR', 'Croatie'],
  ['RO', 'Roumanie'],
  ['BG', 'Bulgarie'],
  ['GR', 'Grèce'],
  ['CY', 'Chypre'],
  ['MT', 'Malte'],
  ['EE', 'Estonie'],
  ['LV', 'Lettonie'],
  ['LT', 'Lituanie'],
] as const

const HORS_UE = [
  ['MC', 'Monaco'],
  ['AD', 'Andorre'],
  ['CH', 'Suisse'],
  ['LI', 'Liechtenstein'],
  ['GB', 'Royaume-Uni'],
  ['NO', 'Norvège'],
  ['IS', 'Islande'],
] as const

export const PAYS_EUROPE: Pays[] = [
  ...UE.map(([code, nom]) => ({ code, nom, ue: true })),
  ...HORS_UE.map(([code, nom]) => ({ code, nom, ue: false })),
]

const PAR_CODE = new Map(PAYS_EUROPE.map((pays) => [pays.code, pays]))

export function nomDuPays(code: string): string {
  return PAR_CODE.get(code)?.nom ?? code
}

export function estUnPaysConnu(code: string): boolean {
  return PAR_CODE.has(code)
}

/** La France d'abord, puis l'ordre alphabétique français. */
export function trierLesPays(codes: string[]): Pays[] {
  return [...new Set(codes)]
    .map((code) => PAR_CODE.get(code) ?? { code, nom: code, ue: false })
    .sort((a, b) =>
      a.code === 'FR' ? -1 : b.code === 'FR' ? 1 : a.nom.localeCompare(b.nom, 'fr'),
    )
}

/**
 * Un pays ne peut appartenir qu'à une zone.
 *
 * Sinon le tunnel proposerait les modes des deux zones à la fois — deux prix
 * pour la même adresse, et aucun moyen de savoir lequel est voulu. Rend les
 * pays déjà pris par une autre zone que celle qu'on enregistre.
 */
export function paysDejaPris(
  pays: string[],
  autresZones: Array<{ id: string; label: string; countries: string[] }>,
  zoneId: string | null,
): Array<{ code: string; zone: string }> {
  const conflits: Array<{ code: string; zone: string }> = []
  for (const zone of autresZones) {
    if (zone.id === zoneId) continue
    for (const code of pays) {
      if (zone.countries.includes(code)) conflits.push({ code, zone: zone.label })
    }
  }
  return conflits
}

/**
 * « 5,90 », « 5.90 », « 5 » ou « 5,9 € » → 590 centimes. Vide → null.
 * Rend `NaN` pour une saisie illisible ou négative, que l'appelant refuse.
 */
export function eurosEnCentimes(saisie: string | null | undefined): number | null {
  const texte = (saisie ?? '').replace(/\s|€/g, '').replace(',', '.')
  if (texte === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(texte)) return Number.NaN
  return Math.round(Number(texte) * 100)
}

/** 590 → « 5,90 ». Pour préremplir un champ en euros. */
export function centimesEnEuros(centimes: number | null): string {
  if (centimes === null) return ''
  return (centimes / 100).toFixed(2).replace('.', ',')
}

/** Code technique d'une zone ou d'un mode, tiré de son libellé : « EUROPE-1 ». */
export function codeDepuisLibelle(libelle: string): string {
  const code = libelle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return code || 'ZONE'
}
