import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

/**
 * Stockage des médias.
 *
 * Le disque d'une instance Render est **éphémère** : il repart à zéro à chaque
 * déploiement et n'est pas partagé entre instances. Une photo produit
 * téléversée dessus disparaît au déploiement suivant, sans erreur, sans trace —
 * la fiche affiche simplement un carré vide un matin.
 *
 * D'où deux pilotes :
 *   - `local` : écrit dans public/uploads. Développement UNIQUEMENT.
 *   - `s3`    : n'importe quel stockage objet compatible S3 (Cloudflare R2,
 *               Backblaze B2, Scaleway, AWS). C'est le seul acceptable en
 *               production, et le code refuse `local` quand NODE_ENV vaut
 *               production plutôt que de perdre des fichiers en silence.
 */

export type StoredFile = {
  /** Clé de stockage, stable et unique. */
  key: string
  /** URL publique servie au navigateur. */
  url: string
  sizeBytes: number
  mimeType: string
}

export type StorageDriverName = 'local' | 's3'

/** Types réellement servis aux clients. Rien d'autre n'est accepté. */
const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
  ['application/pdf', 'pdf'],
])

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function driverName(): StorageDriverName {
  return process.env.MEDIA_DRIVER === 's3' ? 's3' : 'local'
}

/**
 * Dit si la configuration tient debout, et pourquoi pas le cas échéant.
 * Affiché dans le back-office : une mauvaise configuration de stockage ne se
 * voit qu'au moment où un fichier manque, c'est-à-dire trop tard.
 */
export function storageStatus(): { ok: boolean; driver: StorageDriverName; problem?: string } {
  const driver = driverName()

  if (driver === 'local') {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        driver,
        problem:
          "Le pilote « local » écrit sur le disque de l'instance, qui est effacé à chaque " +
          'déploiement. Configurez un stockage objet avant toute mise en ligne de médias.',
      }
    }
    return { ok: true, driver }
  }

  const missing = (
    ['MEDIA_BUCKET', 'MEDIA_ACCESS_KEY_ID', 'MEDIA_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_HOST'] as const
  ).filter((key) => !process.env[key]?.trim())

  if (missing.length > 0) {
    return { ok: false, driver, problem: `Variables manquantes : ${missing.join(', ')}.` }
  }
  return { ok: true, driver }
}

/** Vérifie le type et la taille. Le type déclaré ne suffit pas : on relit l'entête. */
export async function inspectUpload(
  file: File,
): Promise<{ ok: true; mimeType: string; extension: string; bytes: Buffer } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: 'Le fichier est vide.' }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo). Maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo.`,
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const declared = file.type || 'application/octet-stream'

  // Le type annoncé par le navigateur vient du nom de fichier : il se falsifie.
  // On relit donc les premiers octets. Un .jpg renommé en .png passerait le
  // contrôle d'extension, pas celui-ci.
  const sniffed = sniffMime(bytes)
  if (!sniffed) {
    return {
      ok: false,
      error: "Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WebP, AVIF, SVG, PDF.",
    }
  }
  if (!ALLOWED_MIME.has(sniffed)) {
    return { ok: false, error: `Type ${sniffed} non autorisé.` }
  }
  if (declared !== 'application/octet-stream' && declared !== sniffed && !(declared === 'image/svg+xml' && sniffed === 'image/svg+xml')) {
    // Divergence entre le type annoncé et le contenu réel : on retient le
    // contenu, et on le dit dans les journaux.
    console.warn(`[stockage] type annoncé ${declared} ≠ contenu ${sniffed}`)
  }

  return { ok: true, mimeType: sniffed, extension: ALLOWED_MIME.get(sniffed)!, bytes }
}

/** Reconnaissance par les octets d'entête. */
function sniffMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii')
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif'
  }
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'

  // SVG est du texte : on cherche la balise dans les premiers octets.
  const head = bytes.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    if (head.includes('<svg')) return 'image/svg+xml'
  }
  return null
}

/**
 * Clé de stockage.
 *
 * Elle porte un identifiant aléatoire et une empreinte du contenu : deux
 * téléversements du même fichier ne se marchent pas dessus, et une clé ne peut
 * pas être devinée à partir du nom d'origine.
 */
function buildKey(prefix: string, extension: string, bytes: Buffer): string {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  return `${prefix}/${randomUUID()}-${digest}.${extension}`
}

export async function putFile(options: {
  bytes: Buffer
  mimeType: string
  extension: string
  /** Dossier logique : « produits », « guides », « sav »… */
  prefix?: string
}): Promise<StoredFile> {
  const key = buildKey(options.prefix ?? 'medias', options.extension, options.bytes)

  if (driverName() === 's3') return putToS3(key, options.bytes, options.mimeType)
  return putToLocal(key, options.bytes, options.mimeType)
}

async function putToLocal(key: string, bytes: Buffer, mimeType: string): Promise<StoredFile> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "Stockage local refusé en production : le disque de l'instance est éphémère. " +
        'Configurez MEDIA_DRIVER=s3 et les variables MEDIA_*.',
    )
  }

  const target = path.join(process.cwd(), 'public', 'uploads', key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)

  return { key, url: `/uploads/${key}`, sizeBytes: bytes.length, mimeType }
}

async function putToS3(key: string, bytes: Buffer, mimeType: string): Promise<StoredFile> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const status = storageStatus()
  if (!status.ok) throw new Error(status.problem ?? 'Stockage mal configuré.')

  const client = new S3Client({
    region: process.env.MEDIA_REGION || 'auto',
    endpoint: process.env.MEDIA_ENDPOINT || undefined,
    // Indispensable pour R2, B2 et Scaleway, qui n'acceptent pas les URL de
    // type « bucket.domaine ».
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MEDIA_ACCESS_KEY_ID!,
      secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY!,
    },
  })

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.MEDIA_BUCKET!,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      // Un an : la clé contient une empreinte du contenu, donc une URL ne
      // désigne jamais deux fichiers différents.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  const host = process.env.MEDIA_PUBLIC_HOST!.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return { key, url: `https://${host}/${key}`, sizeBytes: bytes.length, mimeType }
}

/** Supprime un fichier. Silencieux s'il n'existe plus : la suppression est idempotente. */
export async function deleteFile(key: string): Promise<void> {
  try {
    if (driverName() === 's3') {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const client = new S3Client({
        region: process.env.MEDIA_REGION || 'auto',
        endpoint: process.env.MEDIA_ENDPOINT || undefined,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MEDIA_ACCESS_KEY_ID!,
          secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY!,
        },
      })
      await client.send(
        new DeleteObjectCommand({ Bucket: process.env.MEDIA_BUCKET!, Key: key }),
      )
      return
    }
    await unlink(path.join(process.cwd(), 'public', 'uploads', key))
  } catch (error) {
    // Fichier déjà absent : c'est le cas idempotent attendu (suppression
    // rejouée, deux onglets), pas un incident à tracer.
    if ((error as { code?: string }).code === 'ENOENT') return
    console.error('[stockage] suppression impossible', error)
  }
}
