import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { expediteur, sendEmail } from '../src/lib/email'

/**
 * Journal des e-mails.
 *
 * Ce que ce test protège : le lien de réinitialisation de mot de passe est
 * passé un temps dans `variables`, qui sont journalisées. Chaque demande
 * déposait donc dans `EmailLog` un lien de prise de contrôle de compte, en
 * clair, valable une heure, lisible par quiconque a accès à la base ou au
 * back-office. Rien ne le signalait à l'écran.
 */
const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.emailLog.deleteMany()
})

afterAll(async () => {
  await prisma.emailLog.deleteMany()
  await prisma.$disconnect()
})

describe('sendEmail', () => {
  it('journalise les variables publiques', async () => {
    await sendEmail({
      template: 'commande.confirmation',
      to: 'client@example.com',
      subject: 'Commande confirmée',
      variables: { reference: 'CMD-2026-00001', totalCents: 9990 },
    })

    const log = await prisma.emailLog.findFirstOrThrow()
    expect(log.payload).toMatchObject({ reference: 'CMD-2026-00001', totalCents: 9990 })
  })

  it('ne journalise JAMAIS les variables sensibles', async () => {
    const lien = 'https://lumera.example/mot-de-passe-oublie/JETON-SECRET-QUI-OUVRE-LE-COMPTE'

    await sendEmail({
      template: 'compte.reinitialisation',
      to: 'client@example.com',
      subject: 'Réinitialiser votre mot de passe',
      variables: { expiresInMinutes: 60 },
      secrets: { resetUrl: lien },
    })

    const log = await prisma.emailLog.findFirstOrThrow()
    const serialise = JSON.stringify(log)

    expect(serialise).not.toContain('JETON-SECRET-QUI-OUVRE-LE-COMPTE')
    expect(serialise).not.toContain('resetUrl')
    // La trace reste utile : on sait qu'un message est parti, et lequel.
    expect(log.template).toBe('compte.reinitialisation')
    expect(log.payload).toMatchObject({ expiresInMinutes: 60 })
  })

  it('marque l’envoi comme simulé tant qu’aucun prestataire n’est configuré', async () => {
    await sendEmail({
      template: 'compte.bienvenue',
      to: 'client@example.com',
      subject: 'Bienvenue',
    })

    const log = await prisma.emailLog.findFirstOrThrow()
    expect(log.simulated).toBe(true)
    expect(log.status).toBe('simulated')
  })
})

/**
 * Expéditeur.
 *
 * Ce que ces tests protègent : `EMAIL_FROM` s'écrit de deux façons, et un nom
 * ajouté par-dessus un nom déjà présent produit un en-tête `From` invalide —
 * une faute qui ne se constate qu'après l'envoi, chez le destinataire.
 */
describe('expediteur', () => {
  const initial = process.env.EMAIL_FROM

  afterAll(() => {
    if (initial === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = initial
  })

  it('ajoute le nom de la marque à une adresse nue', () => {
    process.env.EMAIL_FROM = 'contact@exemple.fr'
    expect(expediteur()).toEqual({ email: 'contact@exemple.fr', name: 'LUMERA' })
  })

  it('conserve le nom déjà écrit, sans le doubler', () => {
    process.env.EMAIL_FROM = 'Service client <sav@exemple.fr>'
    expect(expediteur()).toEqual({ email: 'sav@exemple.fr', name: 'Service client' })
  })

  it('retire les guillemets autour du nom', () => {
    process.env.EMAIL_FROM = '"Service client" <sav@exemple.fr>'
    expect(expediteur()).toEqual({ email: 'sav@exemple.fr', name: 'Service client' })
  })

  it('retombe sur la marque quand le nom est vide', () => {
    process.env.EMAIL_FROM = '<contact@exemple.fr>'
    expect(expediteur()).toEqual({ email: 'contact@exemple.fr', name: 'LUMERA' })
  })

  it('tolère les espaces superflus', () => {
    process.env.EMAIL_FROM = '  contact@exemple.fr  '
    expect(expediteur()).toEqual({ email: 'contact@exemple.fr', name: 'LUMERA' })
  })
})
