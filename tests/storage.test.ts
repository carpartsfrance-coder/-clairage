import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_UPLOAD_BYTES,
  deleteFile,
  driverName,
  inspectUpload,
  putFile,
  storageStatus,
} from '../src/lib/storage'

/**
 * Stockage des médias.
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 *  1. **Un fichier n'est pas ce que son nom prétend.** Le type annoncé par le
 *     navigateur vient de l'extension ; un script renommé en `.png` passerait
 *     tout contrôle fondé sur elle. On vérifie donc que c'est bien l'entête
 *     binaire qui décide, et que le contenu gagne contre la déclaration.
 *
 *  2. **Une mauvaise configuration doit être bruyante.** Un stockage local en
 *     production perd les fichiers au déploiement suivant, sans erreur. Le
 *     refus doit donc arriver à l'écriture, pas à la lecture six jours plus
 *     tard.
 */

/** Entêtes réels, construits à la main : c'est le sujet du test. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(16),
])
const PDF = Buffer.concat([Buffer.from('%PDF-1.7', 'ascii'), Buffer.alloc(16)])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 'utf8')

/**
 * NODE_ENV est déclaré en lecture seule par les types de Node : on écrit donc
 * à travers une vue mutable. Les tests ont besoin de le changer, puisque c'est
 * précisément lui qui fait refuser le stockage local en production.
 */
function setNodeEnv(value: string): void {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

function asFile(bytes: Buffer, name: string, declaredType: string): File {
  return new File([new Uint8Array(bytes)], name, { type: declaredType })
}

const written: string[] = []
const originalEnv = { ...process.env }

beforeEach(() => {
  process.env = { ...originalEnv }
})

afterEach(async () => {
  process.env = { ...originalEnv }
  // Les fichiers écrits par les tests vivent dans public/uploads : on les
  // retire, sinon ils s'accumulent dans le dépôt de travail.
  for (const key of written.splice(0)) {
    await rm(path.join(process.cwd(), 'public', 'uploads', key), { force: true })
  }
})

describe('inspectUpload — reconnaissance du type', () => {
  it('accepte les formats servis, reconnus par leur entête', async () => {
    const cases: Array<[Buffer, string, string]> = [
      [PNG, 'image/png', 'png'],
      [JPEG, 'image/jpeg', 'jpg'],
      [WEBP, 'image/webp', 'webp'],
      [PDF, 'application/pdf', 'pdf'],
      [SVG, 'image/svg+xml', 'svg'],
    ]

    for (const [bytes, mimeType, extension] of cases) {
      const result = await inspectUpload(asFile(bytes, 'fichier', mimeType))
      expect(result.ok, `${mimeType} refusé`).toBe(true)
      if (result.ok) {
        expect(result.mimeType).toBe(mimeType)
        expect(result.extension).toBe(extension)
      }
    }
  })

  it('retient le CONTENU, pas le type annoncé par le navigateur', async () => {
    // Un PNG présenté comme un JPEG : c'est l'entête qui tranche.
    const result = await inspectUpload(asFile(PNG, 'photo.jpg', 'image/jpeg'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/png')
  })

  it('refuse un fichier dont le contenu n’est pas un format accepté', async () => {
    // Le cas qui compte : un exécutable ou un script renommé en .png.
    const script = Buffer.from('#!/bin/sh\nrm -rf /\n', 'utf8')
    const result = await inspectUpload(asFile(script, 'innocent.png', 'image/png'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('non reconnu')
  })

  it('refuse un fichier vide', async () => {
    const result = await inspectUpload(asFile(Buffer.alloc(0), 'vide.png', 'image/png'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('vide')
  })

  it('refuse au-delà de la taille maximale, et dit laquelle', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES + 1)])
    const result = await inspectUpload(asFile(big, 'lourd.png', 'image/png'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('volumineux')
      expect(result.error).toContain('8 Mo')
    }
  })

  it('refuse un fichier trop court pour porter un entête', async () => {
    const result = await inspectUpload(asFile(Buffer.from([0x89, 0x50]), 'tronque.png', 'image/png'))
    expect(result.ok).toBe(false)
  })
})

describe('storageStatus — configuration', () => {
  it('accepte le pilote local hors production', () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('development')
    const status = storageStatus()
    expect(status.ok).toBe(true)
    expect(status.driver).toBe('local')
  })

  it('REFUSE le pilote local en production, parce que le disque est éphémère', () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('production')
    const status = storageStatus()
    expect(status.ok).toBe(false)
    expect(status.problem).toContain('effacé à chaque déploiement')
  })

  it('nomme les variables manquantes du pilote S3', () => {
    process.env.MEDIA_DRIVER = 's3'
    delete process.env.MEDIA_BUCKET
    delete process.env.MEDIA_ACCESS_KEY_ID
    process.env.MEDIA_SECRET_ACCESS_KEY = 'secret'
    process.env.MEDIA_PUBLIC_HOST = 'medias.exemple.test'

    const status = storageStatus()
    expect(status.ok).toBe(false)
    expect(status.problem).toContain('MEDIA_BUCKET')
    expect(status.problem).toContain('MEDIA_ACCESS_KEY_ID')
    // Celles qui sont renseignées ne doivent pas être signalées.
    expect(status.problem).not.toContain('MEDIA_SECRET_ACCESS_KEY')
  })

  it('tient une valeur vide ou blanche pour absente', () => {
    process.env.MEDIA_DRIVER = 's3'
    process.env.MEDIA_BUCKET = '   '
    process.env.MEDIA_ACCESS_KEY_ID = 'cle'
    process.env.MEDIA_SECRET_ACCESS_KEY = 'secret'
    process.env.MEDIA_PUBLIC_HOST = 'medias.exemple.test'

    const status = storageStatus()
    expect(status.ok).toBe(false)
    expect(status.problem).toContain('MEDIA_BUCKET')
  })

  it('ne choisit le pilote S3 que sur demande explicite', () => {
    delete process.env.MEDIA_DRIVER
    expect(driverName()).toBe('local')
    process.env.MEDIA_DRIVER = 'S3' // casse différente : non reconnue
    expect(driverName()).toBe('local')
    process.env.MEDIA_DRIVER = 's3'
    expect(driverName()).toBe('s3')
  })
})

describe('putFile — écriture locale', () => {
  it('écrit le fichier et renvoie une URL servable', async () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('development')

    const stored = await putFile({
      bytes: PNG,
      mimeType: 'image/png',
      extension: 'png',
      prefix: 'essais',
    })
    written.push(stored.key)

    expect(stored.key).toMatch(/^essais\/[0-9a-f-]{36}-[0-9a-f]{12}\.png$/)
    expect(stored.url).toBe(`/uploads/${stored.key}`)
    expect(stored.sizeBytes).toBe(PNG.length)

    const onDisk = await readFile(path.join(process.cwd(), 'public', 'uploads', stored.key))
    expect(onDisk.equals(PNG)).toBe(true)
  })

  it('ne réutilise jamais une clé, même pour deux fois le même fichier', async () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('development')

    const first = await putFile({ bytes: PNG, mimeType: 'image/png', extension: 'png' })
    const second = await putFile({ bytes: PNG, mimeType: 'image/png', extension: 'png' })
    written.push(first.key, second.key)

    // Deux téléversements du même visuel ne doivent pas s'écraser l'un l'autre.
    expect(first.key).not.toBe(second.key)
  })

  it('REFUSE d’écrire en local en production plutôt que de perdre le fichier', async () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('production')

    await expect(
      putFile({ bytes: PNG, mimeType: 'image/png', extension: 'png' }),
    ).rejects.toThrow(/éphémère/)
  })
})

describe('deleteFile', () => {
  it('supprime le fichier', async () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('development')

    const stored = await putFile({ bytes: JPEG, mimeType: 'image/jpeg', extension: 'jpg' })
    await deleteFile(stored.key)

    await expect(
      readFile(path.join(process.cwd(), 'public', 'uploads', stored.key)),
    ).rejects.toThrow()
  })

  it('reste silencieux sur un fichier déjà absent : la suppression est idempotente', async () => {
    process.env.MEDIA_DRIVER = 'local'
    setNodeEnv('development')
    // Rejouer une suppression (deux onglets, un nouvel essai) ne doit pas
    // casser l'écran appelant.
    await expect(deleteFile('essais/inexistant.png')).resolves.toBeUndefined()
  })
})
