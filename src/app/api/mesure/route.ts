import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Réception de la mesure d'audience (components/mesure/Mesure.tsx).
 *
 * Ne garde que ce qui est envoyé, tronqué, et rien de la requête elle-même :
 * ni adresse IP, ni navigateur. Les robots qui se déclarent sont écartés.
 * Répond toujours 204 : la mesure ne doit jamais gêner la navigation.
 */
export const dynamic = 'force-dynamic'

const ROBOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|pingdom|monitor/i
const KINDS = new Set(['page', 'click'])
const DEVICES = new Set(['mobile', 'tablette', 'ordinateur'])

const texte = (v: unknown, n: number) =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null

export async function POST(request: Request) {
  const rien = new NextResponse(null, { status: 204 })
  if (ROBOT.test(request.headers.get('user-agent') ?? '')) return rien
  const brut = await request.text().catch(() => '')
  if (!brut || brut.length > 40_000) return rien

  let corps: { events?: unknown }
  try {
    corps = JSON.parse(brut)
  } catch {
    return rien
  }
  if (!Array.isArray(corps.events)) return rien

  const lignes = corps.events.slice(0, 50).flatMap((e) => {
    if (typeof e !== 'object' || e === null) return []
    const x = e as Record<string, unknown>
    const kind = texte(x.kind, 10)
    const path = texte(x.path, 200)
    const visit = texte(x.visit, 64)
    if (!kind || !KINDS.has(kind) || !path || !path.startsWith('/') || !visit) return []
    if (path.startsWith('/admin') || path.startsWith('/api')) return []
    const device = texte(x.device, 12)
    return [
      {
        kind,
        path,
        visit,
        target: texte(x.target, 200),
        label: texte(x.label, 80),
        zone: texte(x.zone, 60),
        query: texte(x.query, 80),
        source: texte(x.source, 80),
        device: device && DEVICES.has(device) ? device : null,
      },
    ]
  })
  if (lignes.length === 0) return rien

  try {
    await prisma.visitEvent.createMany({ data: lignes })
  } catch (error) {
    console.error('[mesure] enregistrement impossible', error)
  }
  return rien
}
