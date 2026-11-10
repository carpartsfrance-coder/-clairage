import type { PrismaClient } from '@prisma/client'
import { allegerImage } from './alleger'
import { driverName, putFile } from './driver'

/**
 * Pose le filigrane LEDVROOM sur les rendus déjà stockés, un par un.
 *
 * Concerne les médias rattachés à une fiche comme « rendu » ou « montage »
 * (avant / après, véhicule complet, gros plan) : ce sont les images que l'on
 * veut protéger. Les photos d'ampoules (« le produit », « le contenu du kit »)
 * n'en reçoivent pas.
 *
 * Même façon de faire que l'allègement : la nouvelle version (et ses versions
 * 480 / 960 px) est déposée à côté, puis la fiche du média pointe dessus, et
 * `filigraneAt` note que c'est fait. Rejouable, et lancé régulièrement
 * (instrumentation.ts) pour prendre aussi les rendus ajoutés depuis.
 */
function empreinteDeLaCle(cle: string): string | null {
  return /-([0-9a-f]{12})\.[^/]*$/.exec(cle)?.[1] ?? null
}

export async function filigranerRendus(
  prisma: PrismaClient,
  { pauseMs = 2000, journal = console.log }: { pauseMs?: number; journal?: (l: string) => void } = {},
): Promise<{ filigranes: number; echecs: number }> {
  const bilan = { filigranes: 0, echecs: 0 }
  if (driverName() !== 's3') return bilan

  const echoues = new Set<string>()
  for (;;) {
    const media = await prisma.media.findFirst({
      where: {
        id: { notIn: [...echoues] },
        filigraneAt: null,
        url: { startsWith: 'https://' },
        mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] },
        products: { some: { role: { in: ['RESULT', 'INSTALL'] } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, url: true, storageKey: true, mimeType: true },
    })
    if (!media) break

    try {
      const reponse = await fetch(media.url, { signal: AbortSignal.timeout(30_000) })
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
      const origine = Buffer.from(await reponse.arrayBuffer())
      const extension = media.mimeType === 'image/png' ? 'png' : media.mimeType === 'image/webp' ? 'webp' : 'jpg'
      const image = await allegerImage(origine, media.mimeType, extension, { filigrane: true })
      const dossier = media.storageKey.includes('/')
        ? media.storageKey.slice(0, media.storageKey.lastIndexOf('/'))
        : 'medias'
      const depose = await putFile({
        bytes: image.bytes,
        mimeType: image.mimeType,
        extension: image.extension,
        prefix: dossier,
        // L'empreinte de l'original reste dans la clé : c'est elle qui permet
        // aux scripts de pose de reconnaître un rendu déjà déposé.
        ...(empreinteDeLaCle(media.storageKey)
          ? { empreinte: empreinteDeLaCle(media.storageKey) as string }
          : { empreinteDe: origine }),
        variantes: image.variantes,
      })
      const maj = await prisma.media.updateMany({
        where: { id: media.id, storageKey: media.storageKey },
        data: {
          url: depose.url,
          storageKey: depose.key,
          mimeType: depose.mimeType,
          sizeBytes: depose.sizeBytes,
          filigraneAt: new Date(),
          ...(image.width ? { width: image.width, height: image.height } : {}),
        },
      })
      if (maj.count === 1) bilan.filigranes++
    } catch (error) {
      echoues.add(media.id)
      bilan.echecs++
      console.error(`[médias] filigrane impossible pour ${media.id}`, error)
    }

    if ((bilan.filigranes + bilan.echecs) % 50 === 0) {
      journal(`[médias] ${bilan.filigranes} rendu(s) filigrané(s)`)
    }
    await new Promise((fin) => setTimeout(fin, pauseMs))
  }
  return bilan
}

/*
  Un seul passage à la fois dans ce processus : la reprise périodique et un
  dépôt depuis le back-office peuvent le demander en même temps.
*/
let enCours: Promise<unknown> | null = null
let redemande = false

/** Lance un passage en arrière-plan (sans attendre), ou en redemande un après celui en cours. */
export function planifierFiligrane(): void {
  // Coupé par défaut : le passage a fait tomber le serveur (10 novembre 2026).
  if (process.env.FILIGRANE_MEDIAS !== 'on') return
  if (enCours) {
    redemande = true
    return
  }
  enCours = (async () => {
    try {
      do {
        redemande = false
        const { prisma } = await import('../db')
        const bilan = await filigranerRendus(prisma)
        if (bilan.filigranes + bilan.echecs > 0) console.log('[médias] filigrane', bilan)
      } while (redemande)
    } catch (error) {
      console.error('[médias] filigrane interrompu', error)
    } finally {
      enCours = null
    }
  })()
}
