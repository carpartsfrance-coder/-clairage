'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { requestContact, type ContactState } from '@/lib/actions/support'
import { CONTACT_SUBJECTS, type ContactSubjectKey } from '@/lib/support'
import { Alert } from '@/components/ui/Surface'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'

/**
 * Formulaire de prise de contact.
 *
 * Quatre champs, et pas un de plus : le sujet, une adresse pour répondre, la
 * référence de commande quand il y en a une, et le message. Pas de nom, pas de
 * téléphone, pas de case à cocher — rien de tout cela n'est utilisé pour
 * répondre, et chaque champ demandé est un champ qu'il faut remplir avant
 * d'obtenir de l'aide.
 *
 * Les intitulés des sujets viennent de `CONTACT_SUBJECTS`, la même table que
 * celle relue par l'action : ce que le client lit ici est exactement ce qui
 * sera écrit sur sa demande.
 */
export function ContactForm({
  defaultEmail,
  defaultSubject = 'produit',
  defaultOrderReference = null,
}: {
  /** Adresse du compte connecté, quand il y en a un. */
  defaultEmail: string | null
  /** Sujet présélectionné, repris de la page d'où vient le client. */
  defaultSubject?: ContactSubjectKey
  /** Référence de commande reprise de l'URL, quand elle en porte une. */
  defaultOrderReference?: string | null
}) {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(requestContact, {})

  /*
    Le sujet est suivi ici pour une seule raison : afficher sous le champ ce
    que couvre le choix en cours. Mettre cette précision dans l'intitulé de
    l'option la rendrait illisible sur un téléphone, où un <select> fermé
    tronque son texte au milieu d'un mot.
  */
  const [subject, setSubject] = useState<ContactSubjectKey>(defaultSubject)

  if (state.reference) {
    return (
      <Alert tone="ok" live="polite" title="Votre demande est enregistrée.">
        <p>
          Elle porte la référence <strong className="text-slate-ink">{state.reference}</strong> et
          apparaît dans les demandes de l&apos;équipe.
        </p>
        {state.withoutEmail ? (
          /* L'envoi n'est pas activé : on le dit, plutôt que d'annoncer un
             e-mail parti. */
          <p className="mt-2">
            L&apos;envoi automatique d&apos;e-mails n&apos;est pas encore activé sur cet
            environnement : aucun accusé de réception ne vous a été expédié, et aucun délai de
            réponse ne vous est promis ici. Notez cette référence pour la suite.
          </p>
        ) : null}
        <p className="mt-2">
          <Link href="/" className="font-semibold underline underline-offset-4">
            Revenir à l&apos;accueil
          </Link>
        </p>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        id="contact-sujet"
        name="subject"
        label="Sujet de votre demande"
        required
        value={subject}
        onChange={(event) => setSubject(event.target.value as ContactSubjectKey)}
        hint={CONTACT_SUBJECTS.find((item) => item.key === subject)?.hint}
      >
        {CONTACT_SUBJECTS.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </SelectField>

      <TextField
        id="contact-email"
        name="email"
        type="email"
        label="Votre adresse e-mail"
        required
        autoComplete="email"
        defaultValue={defaultEmail ?? ''}
        hint="Elle sert uniquement à vous répondre."
      />

      <TextField
        id="contact-commande"
        name="orderReference"
        label="Référence de commande"
        autoComplete="off"
        inputMode="text"
        maxLength={40}
        placeholder="CMD-2026-00001"
        defaultValue={defaultOrderReference ?? ''}
        hint="Facultatif. Indiquée dans votre confirmation de commande : elle rattache la demande au bon dossier."
      />

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="contact-message" className="text-[11px] font-bold">
          Votre message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Véhicule, référence du produit, ce que vous cherchez à obtenir…"
          className="w-full rounded-[7px] border border-[#d4d4d4] bg-white p-3 text-[13px] text-[#323232] placeholder:text-muted"
        />
        <p className="text-[10px] font-normal text-muted">
          Le modèle exact du véhicule et la référence inscrite sur la pièce d&apos;origine sont ce
          qui évite le plus souvent un aller-retour.
        </p>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="min-h-[51px] gap-3 rounded-[7px] text-[13px]"
      >
        {pending ? 'Envoi en cours…' : 'Envoyer ma demande'}
      </Button>
    </form>
  )
}
