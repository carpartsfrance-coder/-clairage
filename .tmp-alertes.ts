import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const alertes = await p.stockAlert.findMany({
    select: { email: true, createdAt: true, notifiedAt: true, variant: { select: { sku: true } } },
  })
  console.log(`${alertes.length} alerte(s) :`, alertes)
}
main().finally(() => p.$disconnect())
