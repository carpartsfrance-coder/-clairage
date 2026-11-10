'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'

export type ReglageState = { error?: string; notice?: string }

/**
 * Préfixe des références de commande (« CMD » → CMD-2026-00012).
 * C'est le seul réglage de la table que la boutique lit vraiment
 * (lib/orders.ts) ; les autres se changent à leur écran (Livraison, Messages).
 */
export async function enregistrerPrefixeCommande(
  _prev: ReglageState,
  formData: FormData,
): Promise<ReglageState> {
  const staff = await requireStaff('settings.edit')
  const prefixe = String(formData.get('prefix') ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2,6}$/.test(prefixe)) return { error: 'De 2 à 6 lettres, sans chiffre ni espace (ex. CMD).' }
  const avant = await prisma.setting.findUnique({ where: { key: 'order.prefix' } })
  await prisma.setting.upsert({
    where: { key: 'order.prefix' },
    update: { value: prefixe, updatedBy: staff.email },
    create: {
      key: 'order.prefix',
      group: 'general',
      label: 'Préfixe de numérotation des commandes',
      value: prefixe,
      updatedBy: staff.email,
    },
  })
  await audit(staff, 'setting.update', 'Setting', 'order.prefix', { value: avant?.value ?? null }, { value: prefixe })
  revalidatePath('/admin/parametres')
  return { notice: `Les prochaines commandes s’appelleront ${prefixe}-${new Date().getFullYear()}-…` }
}
