import { commercialTerms, formatPrice, identity, siteConfig } from '../identity'
import { renderHtml, renderText, type EmailBlock } from './layout'

/**
 * Modèles de messages transactionnels.
 *
 * Un modèle = un sujet, des blocs, et un jeu d'exemple. Les blocs servent à la
 * fois au HTML et au texte brut, ce qui évite que les deux versions divergent —
 * c'est toujours la version texte qu'on oublie de mettre à jour.
 *
 * Le jeu d'exemple n'est pas décoratif : il alimente la prévisualisation du
 * back-office, et c'est lui qui permet de relire un message avant de l'envoyer
 * à un client pour de bon.
 *
 * Rien n'est promis ici qui ne vienne d'une donnée ou d'un paramètre : aucun
 * délai, aucune garantie, aucun « sous 24 h ».
 */

export type TemplateKey =
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

export type RenderedEmail = { subject: string; html: string; text: string }

type Vars = Record<string, unknown>

const str = (vars: Vars, key: string, fallback = ''): string => {
  const value = vars[key]
  return value === null || value === undefined ? fallback : String(value)
}
const num = (vars: Vars, key: string, fallback = 0): number => {
  const value = Number(vars[key])
  return Number.isFinite(value) ? value : fallback
}

export type TemplateDefinition = {
  key: TemplateKey
  label: string
  /** Quand ce message part. */
  trigger: string
  subject: (vars: Vars) => string
  preheader: (vars: Vars) => string
  blocks: (vars: Vars) => EmailBlock[]
  footerNote?: (vars: Vars) => string | undefined
  /** Jeu d'exemple pour la prévisualisation. */
  sample: Vars
}

const orderUrl = (vars: Vars) =>
  str(vars, 'orderUrl') || `${siteConfig.url}/suivi`

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  'compte.bienvenue': {
    key: 'compte.bienvenue',
    label: 'Bienvenue',
    trigger: "À la création d'un compte, et à toute tentative de création sur une adresse déjà utilisée.",
    subject: () => `${identity.name} — bienvenue`,
    preheader: () => 'Votre compte est créé.',
    blocks: (vars) => {
      const resetUrl = str(vars, 'resetUrl')
      const firstName = str(vars, 'firstName')
      // Le même modèle sert aux deux cas, et c'est voulu : il ne doit pas
      // permettre de deviner si l'adresse avait déjà un compte.
      return [
        { type: 'paragraph', text: firstName ? `Bonjour ${firstName},` : 'Bonjour,' },
        {
          type: 'paragraph',
          text: resetUrl
            ? "Une demande de création de compte vient d'être faite avec cette adresse. Si c'est vous et que vous aviez déjà un compte, vous pouvez retrouver l'accès ci-dessous."
            : 'Votre compte est créé. Vous y retrouverez vos commandes, vos adresses et vos véhicules enregistrés.',
        },
        resetUrl
          ? { type: 'button', label: 'Retrouver mon accès', href: resetUrl }
          : { type: 'button', label: 'Voir mon compte', href: `${siteConfig.url}/compte` },
        {
          type: 'note',
          text: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.",
        },
      ]
    },
    sample: { firstName: 'Camille' },
  },

  'compte.reinitialisation': {
    key: 'compte.reinitialisation',
    label: 'Réinitialisation du mot de passe',
    trigger: "À chaque demande de récupération d'accès, si un compte existe pour l'adresse.",
    subject: () => `${identity.name} — réinitialiser votre mot de passe`,
    preheader: (vars) => `Lien valable ${num(vars, 'expiresInMinutes', 60)} minutes.`,
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      {
        type: 'paragraph',
        text: 'Vous avez demandé à changer le mot de passe de votre compte. Le lien ci-dessous est valable une seule fois.',
      },
      {
        type: 'button',
        label: 'Choisir un nouveau mot de passe',
        href: str(vars, 'resetUrl', `${siteConfig.url}/mot-de-passe-oublie`),
      },
      {
        type: 'note',
        text: `Ce lien expire dans ${num(vars, 'expiresInMinutes', 60)} minutes. Passé ce délai, il faudra en demander un nouveau.`,
      },
      {
        type: 'note',
        text: "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.",
      },
    ],
    footerNote: () =>
      'Changer votre mot de passe déconnecte tous les appareils actuellement connectés.',
    sample: {
      resetUrl: `${siteConfig.url}/mot-de-passe-oublie/EXEMPLE-DE-JETON`,
      expiresInMinutes: 60,
    },
  },

  'commande.confirmation': {
    key: 'commande.confirmation',
    label: 'Commande confirmée',
    trigger: 'Quand le paiement est confirmé par le prestataire.',
    subject: (vars) => `${identity.name} — commande ${str(vars, 'reference')} confirmée`,
    preheader: (vars) => `Votre commande ${str(vars, 'reference')} est confirmée.`,
    blocks: (vars) => {
      const blocks: EmailBlock[] = [
        { type: 'paragraph', text: 'Bonjour,' },
        { type: 'paragraph', text: 'Votre paiement est confirmé et votre commande est enregistrée.' },
        {
          type: 'facts',
          rows: [
            ['Référence', str(vars, 'reference')],
            ['Total payé', formatPrice(num(vars, 'totalCents'), { alwaysDecimals: true })],
          ],
        },
        { type: 'button', label: 'Suivre ma commande', href: orderUrl(vars) },
        {
          type: 'paragraph',
          text: 'Nous vous écrirons à nouveau dès que votre colis sera expédié.',
        },
      ]
      if (commercialTerms.returnWindowDays) {
        blocks.push({
          type: 'note',
          text: `Vous disposez de ${commercialTerms.returnWindowDays} jours pour changer d'avis après réception.`,
        })
      }
      return blocks
    },
    sample: {
      reference: 'CMD-2026-00042',
      totalCents: 9990,
      orderUrl: `${siteConfig.url}/suivi`,
    },
  },

  'commande.paiement': {
    key: 'commande.paiement',
    label: 'Paiement non abouti',
    trigger: "Quand un paiement échoue ou expire, et que la commande est annulée.",
    subject: (vars) => `${identity.name} — paiement de la commande ${str(vars, 'reference')}`,
    preheader: () => "Le paiement n'a pas abouti.",
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      {
        type: 'paragraph',
        text: `Le paiement de la commande ${str(vars, 'reference')} n'a pas abouti. Aucun montant n'a été débité.`,
      },
      {
        type: 'paragraph',
        text: 'Les articles qui vous étaient réservés ont été remis à disposition. Votre panier reste accessible si vous souhaitez recommencer.',
      },
      { type: 'button', label: 'Revenir au panier', href: `${siteConfig.url}/panier` },
    ],
    sample: { reference: 'CMD-2026-00042' },
  },

  'commande.expedition': {
    key: 'commande.expedition',
    label: 'Commande expédiée',
    trigger: "Quand l'expédition est enregistrée au back-office, si la case d'envoi est cochée.",
    subject: (vars) => `${identity.name} — commande ${str(vars, 'reference')} expédiée`,
    preheader: (vars) => `Votre commande part avec ${str(vars, 'carrier', 'le transporteur')}.`,
    blocks: (vars) => {
      const trackingNumber = str(vars, 'trackingNumber')
      const trackingUrl = str(vars, 'trackingUrl')
      const rows: Array<[string, string]> = [
        ['Référence', str(vars, 'reference')],
        ['Transporteur', str(vars, 'carrier')],
      ]
      if (trackingNumber) rows.push(['Numéro de suivi', trackingNumber])

      const blocks: EmailBlock[] = [
        { type: 'paragraph', text: 'Bonjour,' },
        { type: 'paragraph', text: 'Votre commande vient de partir.' },
        { type: 'facts', rows },
      ]
      // Pas de bouton de suivi sans URL : un bouton mort dans un e-mail ne se
      // corrige pas après coup.
      if (trackingUrl) {
        blocks.push({ type: 'button', label: 'Suivre mon colis', href: trackingUrl })
      } else if (trackingNumber) {
        blocks.push({
          type: 'note',
          text: "Le suivi se consulte sur le site du transporteur avec le numéro ci-dessus.",
        })
      }
      blocks.push({
        type: 'note',
        text: "Le suivi peut mettre quelques heures à devenir consultable, le temps que le transporteur enregistre le colis.",
      })
      return blocks
    },
    sample: {
      reference: 'CMD-2026-00042',
      carrier: 'Colissimo',
      trackingNumber: '6A12345678901',
      trackingUrl: 'https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901',
    },
  },

  'commande.annulation': {
    key: 'commande.annulation',
    label: 'Commande annulée',
    trigger: "Quand une commande est annulée au back-office, si la case d'envoi est cochée.",
    subject: (vars) => `${identity.name} — commande ${str(vars, 'reference')} annulée`,
    preheader: () => 'Votre commande a été annulée.',
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      { type: 'paragraph', text: `Votre commande ${str(vars, 'reference')} a été annulée.` },
      ...(str(vars, 'reason')
        ? ([{ type: 'facts', rows: [['Motif', str(vars, 'reason')]] }] as EmailBlock[])
        : []),
      {
        type: 'paragraph',
        text: "Si un paiement avait été encaissé, le remboursement fait l'objet d'un message séparé.",
      },
      { type: 'button', label: 'Nous écrire', href: `${siteConfig.url}/contact` },
    ],
    sample: { reference: 'CMD-2026-00042', reason: 'Article indisponible chez le fournisseur' },
  },

  'commande.remboursement': {
    key: 'commande.remboursement',
    label: 'Remboursement',
    trigger: "Quand un remboursement est enregistré au back-office, si la case d'envoi est cochée.",
    subject: (vars) => `${identity.name} — remboursement de la commande ${str(vars, 'reference')}`,
    preheader: (vars) => `Remboursement de ${formatPrice(num(vars, 'amountCents'))}.`,
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      {
        type: 'paragraph',
        text: `Un remboursement a été enregistré sur votre commande ${str(vars, 'reference')}.`,
      },
      {
        type: 'facts',
        rows: [
          ['Référence', str(vars, 'reference')],
          ['Montant remboursé', formatPrice(num(vars, 'amountCents'), { alwaysDecimals: true })],
          ...(str(vars, 'reason') ? ([['Motif', str(vars, 'reason')]] as Array<[string, string]>) : []),
        ],
      },
      {
        type: 'note',
        text: "Le délai de réapparition sur votre relevé dépend de votre banque ; il n'est pas de notre ressort.",
      },
    ],
    sample: { reference: 'CMD-2026-00042', amountCents: 4990, reason: 'Retour accepté' },
  },

  'sav.ouverture': {
    key: 'sav.ouverture',
    label: 'Demande SAV reçue',
    trigger: "À l'ouverture d'une demande de service après-vente.",
    subject: (vars) => `${identity.name} — demande ${str(vars, 'reference')} reçue`,
    preheader: () => 'Nous avons bien reçu votre demande.',
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      { type: 'paragraph', text: 'Nous avons bien reçu votre demande et nous la regardons.' },
      {
        type: 'facts',
        rows: [
          ['Référence de la demande', str(vars, 'reference')],
          ...(str(vars, 'orderReference')
            ? ([['Commande concernée', str(vars, 'orderReference')]] as Array<[string, string]>)
            : []),
        ],
      },
      // Aucun délai annoncé : rien dans l'application ne permet de le tenir.
      { type: 'paragraph', text: 'Nous revenons vers vous dès que nous avons examiné votre dossier.' },
    ],
    sample: { reference: 'SAV-2026-0007', orderReference: 'CMD-2026-00042' },
  },

  'sav.reponse': {
    key: 'sav.reponse',
    label: 'Réponse à une demande SAV',
    trigger: "Quand l'équipe répond à une demande.",
    subject: (vars) => `${identity.name} — demande ${str(vars, 'reference')}`,
    preheader: () => 'Nous avons répondu à votre demande.',
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      { type: 'paragraph', text: `Voici notre réponse concernant votre demande ${str(vars, 'reference')} :` },
      { type: 'paragraph', text: str(vars, 'message') },
      { type: 'button', label: 'Répondre', href: `${siteConfig.url}/contact` },
    ],
    sample: {
      reference: 'SAV-2026-0007',
      message:
        "Après vérification, le kit livré correspond bien à votre véhicule. Le voyant provient du décodeur, que nous vous remplaçons.",
    },
  },

  'sav.retour': {
    key: 'sav.retour',
    label: 'Instructions de retour',
    trigger: "Quand un retour est accepté et que les instructions sont envoyées.",
    subject: (vars) => `${identity.name} — retour de la commande ${str(vars, 'orderReference')}`,
    preheader: () => 'Voici comment nous renvoyer votre article.',
    blocks: (vars) => [
      { type: 'paragraph', text: 'Bonjour,' },
      { type: 'paragraph', text: 'Votre demande de retour est acceptée. Voici la marche à suivre :' },
      {
        type: 'list',
        items: [
          "Replacez l'article dans son emballage d'origine, avec ses accessoires.",
          `Indiquez la référence ${str(vars, 'reference')} à l'intérieur du colis.`,
          str(vars, 'returnAddress') || "L'adresse de retour vous est communiquée séparément.",
        ],
      },
      {
        type: 'note',
        text: "Nous vous écrirons à la réception du colis, après contrôle de l'article.",
      },
    ],
    sample: {
      reference: 'SAV-2026-0007',
      orderReference: 'CMD-2026-00042',
      returnAddress: "Adresse de retour à renseigner dans les paramètres de la boutique.",
    },
  },
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[]

/** Rend un message complet : sujet, HTML et texte brut. */
export function renderEmail(key: TemplateKey, vars: Vars = {}): RenderedEmail {
  const template = TEMPLATES[key]
  const blocks = template.blocks(vars)
  const footerNote = template.footerNote?.(vars)

  return {
    subject: template.subject(vars),
    html: renderHtml({
      preheader: template.preheader(vars),
      title: template.subject(vars),
      blocks,
      footerNote,
    }),
    text: renderText({ title: template.subject(vars), blocks, footerNote }),
  }
}

/** Rend un modèle avec son jeu d'exemple, pour la prévisualisation. */
export function renderSample(key: TemplateKey): RenderedEmail {
  return renderEmail(key, TEMPLATES[key].sample)
}
