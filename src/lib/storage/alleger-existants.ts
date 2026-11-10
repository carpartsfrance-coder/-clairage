import type { PrismaClient } from '@prisma/client'
import { allegerImage, SEUIL_ALLEGEMENT } from './alleger'
import { driverName, putFile } from './driver'

/**
 * Allège, une par une, les photos déjà stockées trop lourdes.
 *
 * Même raison que `alleger.ts`, pour les médias déposés avant lui (rendus de
 * 2,8 Mo). Pour chacune : lecture depuis le stockage objet, version allégée
 * déposée à côté, puis la fiche du média pointe dessus. L'ancien fichier
 * n'est pas supprimé : une page ou un e-mail qui citerait son adresse
 * continue de fonctionner, et un retour arrière reste possible.
 *
 * Lancée au démarrage du serveur (instrumentation.ts), lentement — une photo
 * à la fois, avec une pause — pour ne pas prendre le processeur au site.
 * Rejouable : une photo déjà allégée n'est plus au-dessus du seuil.
 */
export async function allegerMediasLourds(
  prisma: PrismaClient,
  { pauseMs = 3000, journal = console.log }: { pauseMs?: number; journal?: (l: string) => void } = {},
): Promise<{ allegees: number; ignorees: number; gagneOctets: number }> {
  const bilan = { allegees: 0, ignorees: 0, gagneOctets: 0 }
  if (driverName() !== 's3') return bilan

  const ignorees = new Set<string>()
  for (;;) {
    const media = await prisma.media.findFirst({
      where: {
        id: { notIn: [...ignorees] },
        url: { startsWith: 'https://' },
        mimeType: { in: ['image/jpeg', 'image/png'] },
        OR: [{ sizeBytes: null }, { sizeBytes: { gt: SEUIL_ALLEGEMENT } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, url: true, storageKey: true, mimeType: true },
    })
    if (!media) break

    try {
      const reponse = await fetch(media.url, { signal: AbortSignal.timeout(30_000) })
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
      const origine = Buffer.from(await reponse.arrayBuffer())
      const extension = media.mimeType === 'image/png' ? 'png' : 'jpg'
      const allegee = await allegerImage(origine, media.mimeType, extension)

      if (allegee.bytes === origine) {
        // Rien à gagner : on note sa vraie taille pour ne plus la reprendre.
        ignorees.add(media.id)
        bilan.ignorees++
        await prisma.media.update({ where: { id: media.id }, data: { sizeBytes: origine.length } })
      } else {
        const dossier = media.storageKey.includes('/')
          ? media.storageKey.slice(0, media.storageKey.lastIndexOf('/'))
          : 'medias'
        const depose = await putFile({
          bytes: allegee.bytes,
          mimeType: allegee.mimeType,
          extension: allegee.extension,
          prefix: dossier,
          empreinteDe: origine,
        })
        const maj = await prisma.media.updateMany({
          where: { id: media.id, storageKey: media.storageKey },
          data: {
            url: depose.url,
            storageKey: depose.key,
            mimeType: depose.mimeType,
            sizeBytes: depose.sizeBytes,
            ...(allegee.width ? { width: allegee.width, height: allegee.height } : {}),
          },
        })
        if (maj.count === 1) {
          bilan.allegees++
          bilan.gagneOctets += origine.length - allegee.bytes.length
        }
      }
    } catch (error) {
      ignorees.add(media.id)
      bilan.ignorees++
      console.error(`[médias] allègement impossible pour ${media.id}`, error)
    }

    if ((bilan.allegees + bilan.ignorees) % 50 === 0) {
      journal(`[médias] ${bilan.allegees} photo(s) allégée(s), ${Math.round(bilan.gagneOctets / 1e6)} Mo gagnés`)
    }
    await new Promise((fin) => setTimeout(fin, pauseMs))
  }
  return bilan
}
