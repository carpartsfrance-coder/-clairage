import { describe, expect, it } from 'vitest'
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  renderEmail,
  renderSample,
} from '../src/lib/email/templates'

/**
 * Modèles de messages.
 *
 * Ce que ces tests protègent : un e-mail transactionnel part une fois et ne se
 * corrige pas. Un bouton de suivi sans URL, un « sous 24 h » que personne ne
 * tient, une variable non remplacée affichée telle quelle au client — tout cela
 * se voit chez le destinataire, jamais chez nous.
 */

describe('catalogue des modèles', () => {
  it('couvre tous les messages prévus par le cahier des charges', () => {
    // Création et récupération de compte, confirmation, paiement, expédition,
    // annulation, remboursement, SAV et retour.
    expect(TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        'compte.bienvenue',
        'compte.reinitialisation',
        'commande.confirmation',
        'commande.paiement',
        'commande.expedition',
        'commande.annulation',
        'commande.remboursement',
        'sav.ouverture',
        'sav.reponse',
        'sav.retour',
      ]),
    )
  })

  it('donne à chaque modèle un libellé, un déclencheur et un exemple', () => {
    for (const key of TEMPLATE_KEYS) {
      const template = TEMPLATES[key]
      expect(template.label).toBeTruthy()
      expect(template.trigger).toBeTruthy()
      expect(template.sample).toBeTruthy()
    }
  })
})

describe('rendu', () => {
  it('produit un sujet, du HTML et du texte brut pour chaque modèle', () => {
    for (const key of TEMPLATE_KEYS) {
      const rendered = renderSample(key)
      expect(rendered.subject.length).toBeGreaterThan(5)
      expect(rendered.html).toContain('<!doctype html>')
      // Le texte brut n'est pas une formalité : les filtres anti-spam
      // pénalisent un HTML sans équivalent, et certains clients n'affichent
      // que celui-là.
      expect(rendered.text.length).toBeGreaterThan(20)
      expect(rendered.text).not.toContain('<')
    }
  })

  it('ne laisse aucune variable non remplacée', () => {
    for (const key of TEMPLATE_KEYS) {
      const rendered = renderSample(key)
      expect(rendered.html).not.toMatch(/\{\{|\$\{|undefined|\[object Object\]/)
      expect(rendered.text).not.toMatch(/\{\{|\$\{|undefined|\[object Object\]/)
      expect(rendered.subject).not.toMatch(/undefined|\[object Object\]/)
    }
  })

  it('échappe le HTML des valeurs fournies', () => {
    // Un nom de client, un motif de SAV : tout peut contenir du balisage.
    const rendered = renderEmail('commande.annulation', {
      reference: 'CMD-1',
      reason: '<script>alert(1)</script>',
    })
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
  })

  it('formate les montants en euros, pas en centimes', () => {
    const rendered = renderEmail('commande.confirmation', {
      reference: 'CMD-1',
      totalCents: 9990,
    })
    expect(rendered.text).toContain('99,90')
    expect(rendered.text).not.toContain('9990')
  })
})

describe('promesses', () => {
  it("n'annonce aucun délai garanti", () => {
    // Le cahier des charges l'interdit explicitement, et rien dans
    // l'application ne permettrait de le tenir.
    const interdits = [/sous 24\s?h/i, /sous 48\s?h/i, /garanti/i, /livré demain/i]
    for (const key of TEMPLATE_KEYS) {
      const { text, subject } = renderSample(key)
      for (const motif of interdits) {
        expect(subject).not.toMatch(motif)
        expect(text).not.toMatch(motif)
      }
    }
  })

  it("n'affiche pas de bouton de suivi quand aucune URL n'est connue", () => {
    const sansUrl = renderEmail('commande.expedition', {
      reference: 'CMD-1',
      carrier: 'Colissimo',
      trackingNumber: '6A1',
    })
    expect(sansUrl.text).not.toContain('Suivre mon colis')
    expect(sansUrl.text).toContain('site du transporteur')

    const avecUrl = renderEmail('commande.expedition', {
      reference: 'CMD-1',
      carrier: 'Colissimo',
      trackingNumber: '6A1',
      trackingUrl: 'https://exemple.test/suivi',
    })
    expect(avecUrl.text).toContain('Suivre mon colis')
  })

  it('ne distingue pas les deux cas du message de bienvenue par sa structure', () => {
    // Le même modèle sert à une inscription réussie et à une adresse déjà
    // utilisée : il ne doit pas permettre de deviner lequel des deux.
    const nouveau = renderEmail('compte.bienvenue', { firstName: 'Camille' })
    const existant = renderEmail('compte.bienvenue', {
      resetUrl: 'https://exemple.test/mot-de-passe-oublie',
    })
    expect(nouveau.subject).toBe(existant.subject)
  })
})
