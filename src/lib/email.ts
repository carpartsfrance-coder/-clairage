import { prisma } from './db'

/**
 * Envoi des e-mails transactionnels.
 *
 * Le pilote par défaut est `log` : aucun message ne part réellement, chacun est
 * écrit dans la table EmailLog avec `simulated: true`. C'est voulu — tant que
 * le domaine n'est pas authentifié (SPF, DKIM, DMARC), un envoi réel partirait
 * en indésirable et abîmerait la réputation du domaine.
 *
 * Toute trace d'envoi porte donc explicitement son caractère simulé ou réel :
 * le back-office affiche les deux différemment, et une simulation ne doit
 * jamais pouvoir passer pour un envoi.
 */

export type EmailTemplate =
  | 'compte.bienvenue'
  | 'compte.reinitialisation'
  | 'commande.confirmation'
  | 'commande.paiement'
  | 'commande.expedition'
  | 'commande.annulation'
  | 'commande.remboursement'
  | 'sav.ouverture'
  | 'sav.reponse'
  | 'sav.retour'

export type EmailMessage = {
  template: EmailTemplate
  to: string
  subject: string
  /** Variables du modèle. Aucune donnée sensible ne doit y figurer. */
  variables?: Record<string, unknown>
  html?: string
  text?: string
}

type Driver = 'log' | 'mailersend' | 'brevo' | 'resend'

function currentDriver(): Driver {
  const raw = (process.env.EMAIL_DRIVER ?? 'log').toLowerCase()
  return (['log', 'mailersend', 'brevo', 'resend'] as const).includes(raw as Driver)
    ? (raw as Driver)
    : 'log'
}

/** Vrai si aucun envoi réel ne peut avoir lieu dans la configuration actuelle. */
export function emailIsSimulated(): boolean {
  const driver = currentDriver()
  if (driver === 'log') return true
  // Un pilote réel sans clé ni expéditeur ne peut pas envoyer : on le dit
  // plutôt que de laisser l'appel échouer silencieusement en production.
  return !process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM
}

export async function sendEmail(message: EmailMessage): Promise<{ simulated: boolean }> {
  const driver = currentDriver()
  const simulated = emailIsSimulated()

  if (simulated) {
    await trace(message, { simulated: true, provider: driver, status: 'simulated' })
    console.info(
      `[email] SIMULÉ · ${message.template} → ${message.to} · « ${message.subject} »` +
        (driver === 'log' ? '' : ` (pilote ${driver} sans clé ou sans expéditeur)`),
    )
    return { simulated: true }
  }

  try {
    const providerRef = await dispatch(driver, message)
    await trace(message, { simulated: false, provider: driver, status: 'sent', providerRef })
    return { simulated: false }
  } catch (error) {
    await trace(message, {
      simulated: false,
      provider: driver,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function dispatch(driver: Driver, message: EmailMessage): Promise<string | null> {
  const from = process.env.EMAIL_FROM!
  const apiKey = process.env.EMAIL_API_KEY!

  if (driver === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html ?? '',
        text: message.text,
      }),
    })
    if (!response.ok) throw new Error(`Resend ${response.status} : ${await response.text()}`)
    const data = (await response.json()) as { id?: string }
    return data.id ?? null
  }

  if (driver === 'brevo') {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: from },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html ?? message.text ?? '',
      }),
    })
    if (!response.ok) throw new Error(`Brevo ${response.status} : ${await response.text()}`)
    const data = (await response.json()) as { messageId?: string }
    return data.messageId ?? null
  }

  if (driver === 'mailersend') {
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: { email: from },
        to: [{ email: message.to }],
        subject: message.subject,
        html: message.html ?? '',
        text: message.text,
      }),
    })
    if (!response.ok) throw new Error(`MailerSend ${response.status} : ${await response.text()}`)
    return response.headers.get('x-message-id')
  }

  throw new Error(`Pilote e-mail non géré : ${driver}`)
}

async function trace(
  message: EmailMessage,
  meta: {
    simulated: boolean
    provider: string
    status: string
    providerRef?: string | null
    error?: string
  },
) {
  try {
    await prisma.emailLog.create({
      data: {
        template: message.template,
        toEmail: message.to,
        subject: message.subject,
        simulated: meta.simulated,
        provider: meta.provider,
        providerRef: meta.providerRef ?? null,
        status: meta.status,
        error: meta.error ?? null,
        payload: (message.variables ?? {}) as object,
      },
    })
  } catch (error) {
    // Un échec de journalisation ne doit pas empêcher un envoi d'aboutir.
    console.error('[email] journalisation impossible', error)
  }
}
