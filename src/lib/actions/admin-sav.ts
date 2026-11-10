'use server'

import { revalidatePath } from 'next/cache'
import type { TicketResolution, TicketStatus } from '@prisma/client'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { sendEmail } from '../email'
import { identity } from '../identity'

/** Traitement d'une demande SAV : répondre au client, noter, changer l'état. */

export type SavState = { error?: string; notice?: string }

const STATUTS: TicketStatus[] = ['OPEN', 'WAITING_CUSTOMER', 'WAITING_RETURN', 'RECEIVED', 'APPROVED', 'REJECTED', 'CLOSED']
const ISSUES: TicketResolution[] = ['EXCHANGE', 'REPLACEMENT', 'REFUND', 'REJECTED', 'NO_ACTION']

export async function repondreDemande(_prev: SavState, formData: FormData): Promise<SavState> {
  const staff = await requireStaff('sav.handle')
  const ticketId = String(formData.get('ticketId') ?? '')
  const body = String(formData.get('body') ?? '').replace(/\r\n?/g, '\n').trim()
  const interne = formData.get('internal') === 'on'
  if (!body) return { error: 'Le message est vide.' }
  if (body.length > 5000) return { error: 'Le message est trop long (5 000 caractères au plus).' }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) return { error: 'Demande introuvable.' }

  await prisma.ticketMessage.create({
    data: { ticketId, internal: interne, authorKind: 'staff', authorId: staff.id, body },
  })
  // Une réponse au client le met « en attente » de lui, sauf si la demande
  // est déjà plus avancée.
  if (!interne && ticket.status === 'OPEN') {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'WAITING_CUSTOMER' } })
  }
  await audit(staff, interne ? 'sav.note' : 'sav.reply', 'SupportTicket', ticketId, null, { internal: interne })

  let notice = 'Note interne ajoutée (le client ne la voit pas).'
  if (!interne) {
    try {
      const { simulated } = await sendEmail({
        template: 'sav.reponse',
        to: ticket.email,
        subject: `${identity.name} — demande ${ticket.reference}`,
        variables: { reference: ticket.reference, message: body },
      })
      notice = simulated
        ? 'Réponse enregistrée. Envoi d’e-mail simulé : aucun prestataire n’est configuré ici.'
        : `Réponse envoyée à ${ticket.email}.`
    } catch (error) {
      console.error('[sav] e-mail de réponse', error)
      notice = 'Réponse enregistrée, mais l’e-mail n’a pas pu partir. Réessayez ou écrivez au client.'
    }
  }
  revalidatePath(`/admin/sav/${ticketId}`)
  revalidatePath('/admin/sav')
  return { notice }
}

export async function changerEtatDemande(_prev: SavState, formData: FormData): Promise<SavState> {
  const staff = await requireStaff('sav.handle')
  const ticketId = String(formData.get('ticketId') ?? '')
  const status = String(formData.get('status') ?? '') as TicketStatus
  const issue = String(formData.get('resolution') ?? '')
  if (!STATUTS.includes(status)) return { error: 'État inconnu.' }
  const resolution = issue ? (issue as TicketResolution) : null
  if (resolution && !ISSUES.includes(resolution)) return { error: 'Issue inconnue.' }

  const avant = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!avant) return { error: 'Demande introuvable.' }
  const finie = status === 'CLOSED' || status === 'REJECTED'
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      resolution,
      closedAt: finie ? (avant.closedAt ?? new Date()) : null,
      assignedTo: avant.assignedTo ?? staff.id,
    },
  })
  await audit(staff, 'sav.status', 'SupportTicket', ticketId, { status: avant.status, resolution: avant.resolution }, { status, resolution })
  revalidatePath(`/admin/sav/${ticketId}`)
  revalidatePath('/admin/sav')
  return { notice: 'État enregistré.' }
}
