import { NextResponse } from 'next/server'
import { getStaffUser } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { emettreFacture } from '@/lib/factures'

export const dynamic = 'force-dynamic'

/** Émet (si besoin) la facture d'une commande payée, puis ouvre son PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const staff = await getStaffUser()
  if (!staff || !can(staff.role, 'orders.view')) return new NextResponse('Accès refusé.', { status: 403 })
  const { orderId } = await params
  const facture = await emettreFacture(orderId)
  if (!facture) return new NextResponse("Cette commande n'est pas payée : pas de facture.", { status: 409 })
  return NextResponse.redirect(new URL(`/documents/${facture.id}`, request.url))
}
