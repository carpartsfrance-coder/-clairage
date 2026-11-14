import { NextResponse, connection } from 'next/server'
import { getStaffUser } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { exportComptable } from '@/lib/factures'

/**
 * Export comptable (CSV) des factures et avoirs d'une période.
 * `?du=AAAA-MM-JJ&au=AAAA-MM-JJ` (au inclus). Par défaut : le mois en cours.
 */
export async function GET(request: Request) {
  // Jamais pré-rendu : la réponse dépend de la requête. `connection()` le dit
  // explicitement, là où l'ancien `dynamic = 'force-dynamic'` le réglait par
  // configuration de segment.
  await connection()

  const staff = await getStaffUser()
  if (!staff || !can(staff.role, 'orders.view')) return new NextResponse('Accès refusé.', { status: 403 })
  const sp = new URL(request.url).searchParams
  const maintenant = new Date()
  const lire = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null)
  const du = lire(sp.get('du')) ?? new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
  const auInclus = lire(sp.get('au')) ?? new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0)
  const au = new Date(auInclus.getTime() + 24 * 60 * 60 * 1000)
  const csv = await exportComptable(du, au)
  const nom = `export-comptable-${du.toISOString().slice(0, 10)}-au-${auInclus.toISOString().slice(0, 10)}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
