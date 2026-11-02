'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPencil, IconPlus } from '@/components/ui/icons'
import { texteSaisi } from '@/lib/admin/catalogue'
import { FAQ_MAX, QUESTION_MAX, REPONSE_MAX } from '@/lib/admin/produit-contenu'
import {
  createProductFaq,
  moveProductFaq,
  removeProductFaq,
  updateProductFaq,
} from '@/lib/actions/admin-product-content'
import { ETAT_VIDE, FlechesOrdre, Retour, ZoneTexte } from './ContentFields'

/**
 * Les questions fréquentes d'une fiche produit.
 *
 * Elles existaient en base, la fiche publique les affichait, et **aucun écran
 * ne permettait d'en écrire une**. Celles du site venaient entièrement du jeu
 * de données : un produit créé ici n'avait pas de section « Questions », donc
 * aucune réponse à ce que le client demande avant d'acheter — homologation,
 * démontage, garantie.
 *
 * Deux choses justifient le soin apporté aux refus :
 *
 * - **Les questions partent dans les données structurées** de la page
 *   (`FaqStructuredData`), que les moteurs peuvent afficher directement dans
 *   leurs résultats. Une question posée deux fois avec deux réponses y serait
 *   reprise telle quelle : le doublon est refusé, pas signalé.
 * - **L'ordre est celui que le client lit**, et la première question est la
 *   seule que la plupart liront.
 */

export type FaqFiche = { id: string; question: string; answer: string }

function LigneFaq({
  item,
  premier,
  dernier,
}: {
  item: FaqFiche
  premier: boolean
  dernier: boolean
}) {
  const [edition, actionEdition, editionPending] = useActionState(updateProductFaq, ETAT_VIDE)
  const [retrait, actionRetrait, retraitPending] = useActionState(removeProductFaq, ETAT_VIDE)

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">{item.question}</p>
          <p className="mt-0.5 text-xs whitespace-pre-wrap text-muted-strong">{item.answer}</p>
        </div>
        <FlechesOrdre
          action={moveProductFaq}
          nomChamp="faqId"
          id={item.id}
          premier={premier}
          dernier={dernier}
          designation="cette question"
          occupe={editionPending || retraitPending}
        />
      </div>

      <details className="mt-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
          <IconPencil className="size-3.5 shrink-0" />
          Modifier
        </summary>

        <form action={actionEdition} className="mt-2 border-t border-line pt-3">
          <input type="hidden" name="faqId" value={item.id} />
          <TextField
            id={`question-${item.id}`}
            name="question"
            label="Question"
            fieldSize="sm"
            defaultValue={texteSaisi(edition.saisie, 'question', item.question)}
            maxLength={QUESTION_MAX}
            required
          />
          <ZoneTexte
            id={`answer-${item.id}`}
            name="answer"
            label="Réponse"
            rows={4}
            maxLength={REPONSE_MAX}
            defaultValue={texteSaisi(edition.saisie, 'answer', item.answer)}
            wrapperClassName="mt-3"
            required
          />
          <Button type="submit" size="sm" className="mt-3" disabled={editionPending}>
            {editionPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Retour state={edition} />
        </form>

        <form action={actionRetrait} className="mt-3">
          <input type="hidden" name="faqId" value={item.id} />
          <Button type="submit" size="sm" variant="ghost" disabled={retraitPending}>
            {/* La couleur est portée par le contenu : `cn` ne déduplique pas les
                utilitaires Tailwind. */}
            <span className="flex items-center gap-1.5 text-danger">
              <IconClose className="size-4 shrink-0" />
              {retraitPending ? 'Retrait…' : 'Retirer cette question'}
            </span>
          </Button>
          {retrait.error ? (
            <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
              {retrait.error}
            </p>
          ) : null}
        </form>
      </details>
    </li>
  )
}

function AjoutFaq({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(createProductFaq, ETAT_VIDE)

  return (
    <details className="rounded-md border border-line">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Ajouter une question
      </summary>
      <form action={action} className="border-t border-line p-3">
        <input type="hidden" name="productId" value={productId} />
        <p className="mb-3 max-w-[70ch] text-xs text-muted-strong">
          Ce qu’on vous demande au téléphone : « est-ce homologué ? », « faut-il démonter le
          pare-chocs ? », « que vaut la garantie ? ». Une réponse écrite ici est une question de
          moins au service client.
        </p>
        <TextField
          id="faq-question"
          name="question"
          label="Question"
          placeholder="Ces ampoules sont-elles homologuées route ?"
          defaultValue={texteSaisi(state.saisie, 'question', '')}
          maxLength={QUESTION_MAX}
          required
        />
        <ZoneTexte
          id="faq-answer"
          name="answer"
          label="Réponse"
          rows={4}
          maxLength={REPONSE_MAX}
          defaultValue={texteSaisi(state.saisie, 'answer', '')}
          wrapperClassName="mt-3"
          required
        />
        <Button type="submit" className="mt-4" disabled={pending}>
          {pending ? 'Ajout…' : 'Ajouter la question'}
        </Button>
        <Retour state={state} />
      </form>
    </details>
  )
}

export function ProductFaqManager({
  productId,
  questions,
  mayEdit,
}: {
  productId: string
  questions: FaqFiche[]
  mayEdit: boolean
}) {
  if (!mayEdit) {
    return questions.length === 0 ? (
      <p className="mt-2 text-sm text-muted-strong">Aucune question renseignée.</p>
    ) : (
      <ul className="mt-2 flex flex-col gap-2">
        {questions.map((item) => (
          <li key={item.id} className="rounded-md border border-line bg-white p-3">
            <p className="text-sm font-semibold break-words">{item.question}</p>
            <p className="mt-0.5 text-xs whitespace-pre-wrap text-muted-strong">{item.answer}</p>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {questions.length === 0 ? (
        <Alert tone="info" title="Aucune question">
          La section « Questions » de la fiche reste vide, et rien ne part dans les données
          structurées que les moteurs peuvent afficher.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((item, index) => (
            <LigneFaq
              key={item.id}
              item={item}
              premier={index === 0}
              dernier={index === questions.length - 1}
            />
          ))}
        </ul>
      )}

      {questions.length >= FAQ_MAX ? (
        <p className="text-xs text-muted-strong">Cette fiche compte {FAQ_MAX} questions.</p>
      ) : (
        <AjoutFaq productId={productId} />
      )}
    </div>
  )
}
