import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStaffUser } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { getCurrentUser } from '@/lib/auth/session'
import { donneesDuDocument } from '@/lib/factures'
import { canViewOrder } from '@/lib/order-access'

export const dynamic = 'force-dynamic'

/**
 * Téléchargement d'une facture ou d'un avoir (PDF).
 *
 * Accès : l'équipe (droit « commandes »), le client propriétaire de la
 * commande connecté, ou le lien de suivi d'une commande sans compte
 * (`?t=<jeton de suivi>`). Personne d'autre : une facture porte une adresse.
 */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const jeton = new URL(request.url).searchParams.get('t')

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { order: { select: { userId: true, guestToken: true } } },
  })
  if (!doc) return new NextResponse('Document introuvable.', { status: 404 })

  const staff = await getStaffUser()
  const autorise =
    (staff && can(staff.role, 'orders.view')) ||
    canViewOrder(doc.order, jeton, (await getCurrentUser())?.id ?? null)
  if (!autorise) return new NextResponse('Accès refusé.', { status: 403 })

  const donnees = await donneesDuDocument(documentId)
  if (!donnees) return new NextResponse('Document introuvable.', { status: 404 })

  return new NextResponse(Buffer.from(donnees.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${donnees.nom}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
