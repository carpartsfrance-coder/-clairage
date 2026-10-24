import { prisma } from './db'
import { identity } from './identity'
import { TEMPLATES, renderEmail, type TemplateKey } from './email/templates'

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

/** Les clés viennent du catalogue de modèles : une seule liste, pas deux. */
export type EmailTemplate = TemplateKey

export type EmailMessage = {
  template: EmailTemplate
  to: string
  subject: string
  /**
   * Variables du modèle. Elles sont JOURNALISÉES dans `EmailLog` : tout ce qui
   * passe ici est lisible par quiconque a accès à la base ou au back-office.
   */
  variables?: Record<string, unknown>
  /**
   * Variables sensibles : jeton de réinitialisation, lien de suivi, code à
   * usage unique. Elles servent au rendu du message et ne sont JAMAIS écrites
   * dans le journal.
   *
   * Ce champ existe parce que l'erreur inverse a été commise : le lien de
   * réinitialisation est passé un temps par `variables`, ce qui déposait dans
   * `EmailLog` un lien de prise de contrôle de compte, valable une heure, en
   * clair. Deux champs distincts rendent la faute visible à l'écriture plutôt
   * qu'après coup.
   */
  secrets?: Record<string, unknown>
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

/** Variables disponibles au rendu : les publiques et les sensibles réunies. */
export function renderVariables(message: EmailMessage): Record<string, unknown> {
  return { ...(message.variables ?? {}), ...(message.secrets ?? {}) }
}

export async function sendEmail(message: EmailMessage): Promise<{ simulated: boolean }> {
  const driver = currentDriver()
  const simulated = emailIsSimulated()

  // Le corps est composé à partir du modèle, sauf si l'appelant a fourni le
  // sien (envoi de test depuis le back-office). Les variables sensibles sont
  // incluses au rendu et restent hors du journal.
  if (!message.html && TEMPLATES[message.template]) {
    const rendered = renderEmail(message.template, renderVariables(message))
    message = {
      ...message,
      subject: message.subject || rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }
  }

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

/**
 * Expéditeur : l'adresse, et le nom affiché dans la boîte du destinataire.
 *
 * Sans nom, le client voit l'adresse brute — « contact@… » là où il devrait
 * lire la marque. Un message transactionnel qu'on n'identifie pas au premier
 * coup d'œil se signale comme indésirable plus vite qu'il ne se lit.
 *
 * `EMAIL_FROM` accepte les deux écritures. Si elle porte déjà un nom, sous la
 * forme `LEDVROOM <contact@exemple.fr>`, il est repris tel quel : en rajouter un
 * second produirait un en-tête invalide, et c'est le genre de faute qui ne se
 * voit qu'une fois le message parti.
 */
export function expediteur(): { email: string; name: string } {
  const brut = (process.env.EMAIL_FROM ?? '').trim()
  const avecNom = brut.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)

  if (avecNom) {
    const nom = avecNom[1].replace(/^"(.*)"$/, '$1').trim()
    return { email: avecNom[2].trim(), name: nom || identity.name }
  }
  return { email: brut, name: identity.name }
}

async function dispatch(driver: Driver, message: EmailMessage): Promise<string | null> {
  const { email: fromEmail, name: fromName } = expediteur()
  const from = `${fromName} <${fromEmail}>`
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
        sender: { email: fromEmail, name: fromName },
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
        from: { email: fromEmail, name: fromName },
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

/**
 * Trace d'envoi.
 *
 * N'écrit que `message.variables`. `message.secrets` n'est jamais journalisé —
 * c'est toute la raison d'être de la distinction entre les deux champs.
 */
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
