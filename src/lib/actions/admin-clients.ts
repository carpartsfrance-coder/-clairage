'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'

export async function ajouterNoteClient(formData: FormData): Promise<void> {
  const staff = await requireStaff('customers.note')
  const userId = String(formData.get('userId') ?? '')
  const body = String(formData.get('body') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 4000)
  if (!userId || !body) return
  const client = await prisma.user.findFirst({ where: { id: userId, staffRole: null }, select: { id: true } })
  if (!client) return
  const note = await prisma.customerNote.create({ data: { userId, body, authorId: staff.id } })
  await audit(staff, 'customer.note', 'User', userId, null, { noteId: note.id })
  revalidatePath(`/admin/clients/${userId}`)
}
