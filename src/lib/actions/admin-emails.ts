'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireStaff, audit } from '../admin/guard'
import { sendEmail } from '../email'
import { TEMPLATE_KEYS, renderSample, type TemplateKey } from '../email/templates'

/**
 * Envoi de test d'un modèle de message.
 *
 * Un seul objectif : pouvoir relire un message dans un vrai client de
 * messagerie avant qu'il ne parte à un client. Le corps envoyé est celui du
 * jeu d'exemple du modèle — aucune donnée réelle n'est lue ici.
 *
 * L'action revérifie le droit, parce qu'une action de serveur est un point
 * d'entrée public : elle est atteignable sans jamais voir la page.
 *
 * Le droit exigé est `settings.edit`, pas `settings.view` : relire un modèle
 * est une lecture, mais envoyer un message est une sortie vers l'extérieur, à
 * une adresse choisie dans le formulaire. Avec `settings.view`, un compte en
 * consultation seule — à qui l'on promet « aucune écriture, nulle part » —
 * pouvait faire partir un vrai e-mail à n'importe qui.
 *
 * Le retour dit si l'envoi a réellement eu lieu. C'est le point sensible de
 * cet écran : avec le pilote `log`, `sendEmail` écrit dans `EmailLog` et ne
 * contacte personne. Annoncer « envoyé » dans ce cas ferait croire à un envoi
 * qui n'existe pas, et c'est exactement l'erreur que l'on corrige en
 * répercutant le `simulated` renvoyé par `sendEmail`.
 */

export type EmailState = {
  error?: string
  notice?: string
  /**
   * Vrai quand le message a seulement été journalisé. L'interface s'en sert
   * pour ne pas afficher une confirmation verte sur un envoi qui n'a pas eu
   * lieu : le texte seul ne suffit pas, l'icône et la couleur parlent avant lui.
   */
  simulated?: boolean
}

const testSchema = z.object({
  // Le modèle vient d'un champ de formulaire : il est validé contre le
  // catalogue, jamais utilisé tel quel comme clé.
  template: z.enum(TEMPLATE_KEYS as [TemplateKey, ...TemplateKey[]]),
  to: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email('Adresse e-mail invalide.'),
})

export async function sendTestEmail(
  _previous: EmailState,
  formData: FormData,
): Promise<EmailState> {
  const staff = await requireStaff('settings.edit')

  const parsed = testSchema.safeParse({
    template: formData.get('template'),
    to: formData.get('to'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' }
  }

  const { template, to } = parsed.data
  const sample = renderSample(template)

  try {
    // Le corps est déjà rendu : on l'envoie tel qu'il a été relu à l'écran,
    // sinon le test ne prouverait rien sur ce que verra le destinataire.
    const { simulated } = await sendEmail({
      template,
      to,
      subject: sample.subject,
      html: sample.html,
      text: sample.text,
    })

    await audit(staff, 'email.test', 'EmailLog', null, null, { template, to })
    // Le journal des actions est lu depuis les paramètres.
    revalidatePath('/admin/parametres')

    return {
      simulated,
      notice: simulated
        ? "Aucun envoi réel : le message a été enregistré dans le journal avec la mention « simulé ». Les trois variables EMAIL_DRIVER, EMAIL_API_KEY et EMAIL_FROM sont nécessaires pour envoyer vraiment."
        : `Message envoyé à ${to}.`,
    }
  } catch (error) {
    console.error('[admin] envoi de test impossible', error)
    return {
      error:
        "Le fournisseur d'envoi a refusé le message. L'échec est enregistré dans le journal des e-mails.",
    }
  }
}
