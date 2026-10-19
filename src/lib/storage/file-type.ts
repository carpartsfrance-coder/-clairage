/**
 * Reconnaissance du type d'un fichier, par son contenu.
 *
 * Ce module est volontairement neutre : ni `'use client'`, ni `server-only`.
 * Il est lu par le stockage (`./index.ts`, réservé au serveur) et par les
 * scripts d'import, qui tournent sous `tsx` en dehors de tout rendu React et
 * ne peuvent donc pas importer un module marqué `server-only`.
 *
 * La séparation a un intérêt concret : un script qui récupère des fichiers sur
 * le réseau doit les contrôler exactement comme un téléversement d'admin. Une
 * URL qui finit par `.webp` ne prouve rien du contenu servi.
 */

/** Types réellement servis aux clients. Rien d'autre n'est accepté. */
export const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
  ['application/pdf', 'pdf'],
])

/** Reconnaissance par les octets d'entête. */
export function sniffMime(bytes: Buffer): string | null {
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
