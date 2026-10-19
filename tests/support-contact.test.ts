import { describe, expect, it } from 'vitest'
import {
  CONTACT_SUBJECTS,
  buildContactDescription,
  contactSchema,
  contactSubjectLabel,
} from '../src/lib/support'

/**
 * Prise de contact.
 *
 * Ce que ces tests protègent : une demande qui part sans qu'on sache de quoi
 * elle parle, un libellé dicté par le navigateur, et une demande qui affirme
 * porter sur une commande que personne n'a retrouvée. Les trois passent
 * inaperçus depuis l'écran — le formulaire a l'air de marcher, et c'est le SAV
 * qui découvre le problème, demande par demande.
 *
 * L'action elle-même n'est pas testée ici : elle lit des cookies et compte des
 * tentatives, donc elle ne s'exécute pas hors d'une requête. Tout ce qui se
 * décide sans la base vit dans `src/lib/support.ts`, et c'est ce qui est
 * vérifié.
 */

const saisieValide = {
  subject: 'produit',
  email: 'client@example.com',
  orderReference: '',
  message: 'Je ne sais pas quel culot monter sur ma Clio IV de 2015.',
}

describe('contactSchema', () => {
  it('accepte une demande complète', () => {
    const parsed = contactSchema.safeParse(saisieValide)
    expect(parsed.success).toBe(true)
  })

  it('refuse un sujet qui ne figure pas dans la liste', () => {
    // Le navigateur n'envoie qu'une clé : si elle est inventée, rien ne doit
    // être écrit — surtout pas le texte reçu, qui deviendrait le motif.
    const parsed = contactSchema.safeParse({
      ...saisieValide,
      subject: 'Retour sous garantie',
    })
    expect(parsed.success).toBe(false)
  })

  it('refuse une adresse e-mail invalide', () => {
    const parsed = contactSchema.safeParse({ ...saisieValide, email: 'client@' })
    expect(parsed.success).toBe(false)
  })

  it('refuse un message trop court pour être traité', () => {
    const parsed = contactSchema.safeParse({ ...saisieValide, message: 'bonjour' })
    expect(parsed.success).toBe(false)
  })

  it('refuse un message au-delà de la limite de saisie', () => {
    const parsed = contactSchema.safeParse({ ...saisieValide, message: 'a'.repeat(2001) })
    expect(parsed.success).toBe(false)
  })

  it('nettoie les espaces autour de la saisie', () => {
    const parsed = contactSchema.safeParse({
      ...saisieValide,
      email: '  Client@example.com  ',
      orderReference: '  CMD-2026-00001  ',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBe('Client@example.com')
    expect(parsed.data.orderReference).toBe('CMD-2026-00001')
  })

  it('accepte une demande sans référence de commande', () => {
    // La référence est facultative : on ne force personne à retrouver un
    // numéro pour poser une question.
    const parsed = contactSchema.safeParse({ ...saisieValide, orderReference: '' })
    expect(parsed.success).toBe(true)
  })
})

describe('contactSubjectLabel', () => {
  it('donne un libellé à chaque sujet proposé', () => {
    for (const subject of CONTACT_SUBJECTS) {
      expect(contactSubjectLabel(subject.key)).toBe(subject.label)
      expect(contactSubjectLabel(subject.key).length).toBeGreaterThan(0)
    }
  })
})

describe('buildContactDescription', () => {
  it('écrit le sujet relu en base, pas celui du formulaire', () => {
    const texte = buildContactDescription({
      subject: 'commande',
      message: 'Où en est mon colis ?',
      order: null,
      account: null,
    })
    expect(texte).toContain('Sujet : Question sur une commande')
    expect(texte).toContain('Où en est mon colis ?')
  })

  it("ne nomme aucune commande tant qu'aucune n'a été retrouvée", () => {
    const texte = buildContactDescription({
      subject: 'commande',
      message: 'Ma commande CMD-2026-09999 est-elle partie ?',
      order: null,
      account: null,
    })
    // Le message du client est reproduit tel quel, mais l'en-tête de la
    // demande n'affirme rien : aucune ligne « Commande : » n'est écrite.
    expect(texte).not.toContain('Commande : ')
  })

  it('nomme la commande retrouvée, avec sa date', () => {
    const texte = buildContactDescription({
      subject: 'commande',
      message: 'Je voudrais ajouter un article.',
      order: { reference: 'CMD-2026-00001', placedAt: new Date('2026-01-12T10:00:00Z') },
      account: null,
    })
    expect(texte).toContain('Commande : CMD-2026-00001')
    expect(texte).toContain('12/01/2026')
  })

  it("distingue une demande envoyée sans compte d'une demande d'un client connecté", () => {
    const anonyme = buildContactDescription({
      subject: 'autre',
      message: 'Vendez-vous des ampoules pour remorque ?',
      order: null,
      account: null,
    })
    expect(anonyme).toContain('Compte : aucun')

    /*
      Un client connecté peut demander une réponse à une autre adresse :
      l'équipe doit voir les deux, sinon elle croira à une usurpation.
    */
    const connecte = buildContactDescription({
      subject: 'autre',
      message: 'Vendez-vous des ampoules pour remorque ?',
      order: null,
      account: { email: 'compte@example.com' },
    })
    expect(connecte).toContain('Compte : compte@example.com')
  })
})
