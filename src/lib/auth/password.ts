import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Mots de passe.
 *
 * scrypt plutôt qu'une dépendance : il est conçu pour le hachage de mots de
 * passe (coûteux en mémoire, donc hostile aux attaques par GPU), il est dans la
 * bibliothèque standard de Node, et il n'ajoute rien à installer sur Render.
 *
 * Le format stocké porte ses paramètres : `scrypt$N$r$p$sel$condensé`. Le jour
 * où l'on durcira le coût, les anciens condensés resteront vérifiables et
 * pourront être rehachés à la volée à la connexion suivante.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * Coût du hachage.
 *
 * scrypt consomme environ `128 × N × r` octets par calcul. Avec N = 2^15 et
 * r = 8, cela fait ~32 Mo et ~150 ms par vérification.
 *
 * C'est en dessous du N = 2^17 que recommande l'OWASP, et c'est un arbitrage
 * assumé : à 2^17, chaque calcul réclamerait 128 Mo, et quatre connexions
 * simultanées suffiraient à saturer une instance Render de 512 Mo — une panne
 * certaine contre un gain hypothétique. La vraie défense contre la force brute
 * en ligne est la limitation de fréquence (voir throttle.ts) ; celle contre la
 * force brute hors ligne est la longueur minimale de 12 caractères.
 *
 * `AUTH_SCRYPT_LOG_N` permet de durcir sans toucher au code dès que
 * l'instance a la mémoire pour : les condensés existants restent vérifiables,
 * puisque chacun porte ses propres paramètres.
 */
const LOG_N = Number(process.env.AUTH_SCRYPT_LOG_N ?? 15)
const PARAMS = { N: 2 ** (Number.isInteger(LOG_N) && LOG_N >= 14 && LOG_N <= 20 ? LOG_N : 15), r: 8, p: 1 }
const KEY_LENGTH = 64
// scrypt exige maxmem >= 128 * N * r ; on prend une marge.
const MAX_MEM = 256 * PARAMS.N * PARAMS.r

export const PASSWORD_MIN_LENGTH = 12

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM })
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts
  const N = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  try {
    const expected = Buffer.from(hashHex, 'hex')
    const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N,
      r,
      p,
      maxmem: 256 * N * r,
    })
    // Comparaison à temps constant : une comparaison naïve fuite le préfixe
    // commun par sa durée d'exécution.
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Règles de robustesse.
 *
 * Longueur d'abord : c'est le seul critère qui résiste vraiment, et imposer
 * des classes de caractères pousse surtout à écrire « Motdepasse1! ». On refuse
 * en revanche les mots de passe manifestement devinables et ceux qui répètent
 * l'adresse e-mail.
 */
const OBVIOUS = [
  'motdepasse',
  'password',
  'azertyuiop',
  'qwertyuiop',
  '123456789',
  'lumera',
  'eclairage',
]

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`
  }
  if (password.length > 200) {
    // Au-delà, le coût de calcul devient un vecteur de déni de service.
    return 'Le mot de passe est trop long (200 caractères maximum).'
  }
  const lowered = password.toLowerCase()
  if (OBVIOUS.some((candidate) => lowered.includes(candidate))) {
    return 'Ce mot de passe est trop facile à deviner.'
  }
  if (email) {
    const local = email.split('@')[0]?.toLowerCase()
    if (local && local.length >= 3 && lowered.includes(local)) {
      return 'Le mot de passe ne doit pas reprendre votre adresse e-mail.'
    }
  }
  return null
}
