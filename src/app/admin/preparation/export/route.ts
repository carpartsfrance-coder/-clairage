import { requireStaff } from '@/lib/admin/guard'
import { listePrelevement } from '@/lib/admin/prelevement'
import { listToPrepare } from '@/lib/queries/admin'

/** La liste de prélèvement en CSV (point-virgule, pour Excel en français). */
export async function GET() {
  await requireStaff('orders.fulfil')
  const orders = await listToPrepare()
  const lignes = listePrelevement(orders)
  const cellule = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [
    ['Référence', 'Article', 'Quantité', 'Commandes'].map(cellule).join(';'),
    ...lignes.map((l) =>
      [l.sku, l.designation, l.quantite, orders.filter((o) => l.commandes.has(o.id)).map((o) => o.reference).join(', ')]
        .map(cellule)
        .join(';'),
    ),
  ].join('\r\n')
  const jour = new Date().toISOString().slice(0, 10)
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="preparation-${jour}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
