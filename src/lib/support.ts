import { z } from 'zod'

/**
 * Prise de contact : tout ce qui se décide sans la base.
 *
 * Le sujet, la saisie attendue et la rédaction de la demande vivent ici plutôt
 * que dans l'action serveur, pour deux raisons.
 *
 * D'abord parce que c'est la seule partie vérifiable sans base ni requête HTTP :
 * l'action, elle, lit des cookies et compte des tentatives, donc elle ne
 * s'exécute pas hors d'une requête.
 *
 * Ensuite parce que le libellé proposé au client et celui écrit au SAV doivent
 * venir de la même source. Le navigateur n'envoie qu'une clé (« commande ») ;
 * le libellé est relu dans cette table. Un formulaire modifié ne peut donc pas
 * faire inscrire « Retour sous garantie » en tête d'une demande qui n'en est
 * pas une.
 */

export const CONTACT_SUBJECTS = [
  {
    key: 'produit',
    label: 'Question sur un produit',
    hint: "Choix d'une référence, compatibilité, montage.",
  },
  {
    key: 'commande',
    label: 'Question sur une commande',
    hint: 'Suivi, modification, colis reçu.',
  },
  {
    /*
      Ce sujet existe pour une raison précise : le site ne montre que les
      véhicules pour lesquels un éclairage est effectivement en ligne, et le
      référentiel en compte bien davantage. Un client dont la voiture n'est pas
      proposée n'a donc rien à conclure — ni qu'elle n'existe pas au
      référentiel, ni qu'aucun produit ne lui conviendrait. Il faut pouvoir le
      demander, et ces demandes disent aussi quelles photos produire ensuite.
    */
    key: 'vehicule',
    label: 'Véhicule non listé',
    hint: "Votre voiture n'apparaît pas dans le sélecteur.",
  },
  {
    key: 'autre',
    label: 'Autre demande',
    hint: 'Tout le reste.',
  },
] as const

export type ContactSubjectKey = (typeof CONTACT_SUBJECTS)[number]['key']

const SUBJECT_KEYS = CONTACT_SUBJECTS.map((subject) => subject.key) as [
  ContactSubjectKey,
  ...ContactSubjectKey[],
]

/** Libellé lisible d'un sujet. C'est lui qui devient le motif de la demande. */
export function contactSubjectLabel(key: ContactSubjectKey): string {
  return CONTACT_SUBJECTS.find((subject) => subject.key === key)!.label
}

/**
 * Saisie du formulaire de contact.
 *
 * Le message a un plancher : une demande de trois caractères n'apprend rien à
 * l'équipe et lui coûte quand même un aller-retour. La référence de commande
 * est facultative — on ne force personne à retrouver un numéro pour poser une
 * question — mais quand elle est donnée, l'action la confronte à la base avant
 * de rattacher quoi que ce soit.
 */
export const contactSchema = z.object({
  subject: z.enum(SUBJECT_KEYS, { message: 'Choisissez le sujet de votre demande.' }),
  email: z.string().trim().email('Adresse e-mail invalide').max(160),
  orderReference: z.string().trim().max(40).optional(),
  /*
    Le véhicule en texte libre, et facultatif.
    
    Facultatif parce qu'il ne concerne pas toutes les demandes, et en texte
    libre parce qu'un client dont le véhicule n'est pas au catalogue ne peut
    précisément pas le choisir dans une liste. Lui proposer un sélecteur ici
    serait lui redemander ce qu'il vient de ne pas trouver.
  */
  vehicle: z.string().trim().max(120).optional(),
  message: z
    .string()
    .trim()
    .min(10, 'Décrivez votre demande en quelques mots.')
    .max(2000, 'Message trop long : 2000 caractères au maximum.'),
})

export type ContactInput = z.infer<typeof contactSchema>

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

/**
 * Texte de la demande, tel que l'équipe le lira dans le back-office.
 *
 * Rien n'y est repris du formulaire sauf le message lui-même : le sujet est
 * relu dans `CONTACT_SUBJECTS`, et la commande n'apparaît que si l'action l'a
 * retrouvée en base — `order` est la ligne trouvée, jamais la référence tapée
 * par le client. Une demande ne peut donc pas affirmer porter sur une commande
 * qui n'existe pas.
 */
export function buildContactDescription(input: {
  subject: ContactSubjectKey
  message: string
  /** Véhicule tel que le client l'a écrit, quand il l'a renseigné. */
  vehicle?: string | null
  /** Commande retrouvée en base, ou null quand il n'y en a pas. */
  order: { reference: string; placedAt: Date } | null
  /** Compte connecté au moment de l'envoi, ou null. */
  account: { email: string } | null
}): string {
  return [
    `Sujet : ${contactSubjectLabel(input.subject)}`,
    input.order
      ? `Commande : ${input.order.reference} (passée le ${dateFormatter.format(input.order.placedAt)})`
      : null,
    /*
      L'adresse du compte est notée à part de celle du formulaire : un client
      connecté peut demander une réponse ailleurs, et l'équipe doit voir les
      deux plutôt que de croire à une usurpation.
    */
    input.account
      ? `Compte : ${input.account.email}`
      : 'Compte : aucun (demande envoyée sans être connecté)',
    /*
      Le véhicule est le seul champ repris mot pour mot du formulaire, et il
      est annoncé comme tel : il désigne justement ce que la base ne connaît
      pas, donc rien ne peut le relire. L'équipe doit lire une déclaration du
      client, pas la croire vérifiée.
    */
    input.vehicle ? `Véhicule indiqué par le client : ${input.vehicle}` : null,
    '',
    'Message du client :',
    input.message,
  ]
    .filter((line) => line !== null)
    .join('\n')
}
