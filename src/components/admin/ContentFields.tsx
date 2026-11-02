'use client'

import { useActionState } from 'react'
import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { IconChevronDown } from '@/components/ui/icons'
import type { ContentState } from '@/lib/actions/admin-product-content'

/**
 * Les pièces communes aux formulaires de contenu d'une fiche produit.
 *
 * Trois choses s'y répétaient d'un bloc à l'autre — le retour d'une action, la
 * zone de texte long, les flèches d'ordre — et les recopier dans chaque
 * gestionnaire les aurait fait diverger : un message d'erreur affiché en
 * rouge ici et en gris là, une zone de texte à la bonne taille pour les
 * caractéristiques et à l'étroit pour les questions.
 */

export const ETAT_VIDE: ContentState = {}

export function Retour({ state, className }: { state: ContentState; className?: string }) {
  if (state.error) {
    return (
      <Alert tone="danger" className={cn('mt-3', className)}>
        {state.error}
      </Alert>
    )
  }
  if (state.notice) {
    return (
      <Alert tone="ok" className={cn('mt-3', className)}>
        {state.notice}
      </Alert>
    )
  }
  return null
}

export type ZoneTexteProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string
  label: string
  hint?: ReactNode
  wrapperClassName?: string
}

/**
 * Une zone de texte long, dans la langue visuelle de `components/ui/Field.tsx`.
 *
 * Il n'y en avait pas : les deux écrans qui en avaient besoin s'en étaient
 * fabriqué une chacun, l'une avec un filet gris clair, l'autre avec un filet
 * foncé. Celle-ci reprend exactement les valeurs de `TextField` — filet
 * #d4d4d4, rayon 7 px, texte à 13 px — pour qu'un formulaire qui mélange les
 * deux ne se voie pas.
 */
export function ZoneTexte({
  id,
  label,
  hint,
  className,
  wrapperClassName,
  ...rest
}: ZoneTexteProps) {
  return (
    <div className={cn('flex flex-col gap-[7px]', wrapperClassName)}>
      <label htmlFor={id} className="text-[11px] font-bold">
        {label}
      </label>
      <textarea
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          'w-full rounded-[7px] border border-[#d4d4d4] bg-white px-3 py-2 text-[13px] text-[#323232]',
          'transition-colors placeholder:text-muted hover:border-muted',
          className,
        )}
        {...rest}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-[10px] font-normal text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Les deux flèches qui déplacent une ligne dans sa liste.
 *
 * L'ordre n'est pas décoratif : les caractéristiques et les questions
 * s'affichent sur la fiche dans celui-ci, et la première question est celle
 * que le client lit. Une ligne seule n'affiche rien — deux flèches grisées
 * n'apprennent rien et prennent la place du reste.
 *
 * Les classes de taille du bouton portent déjà un retrait horizontal, et `cn`
 * ne déduplique pas les utilitaires Tailwind : une icône dans un bouton de
 * taille normale, donc, plutôt qu'un `px-0` qui n'écraserait que l'icône.
 */
export function FlechesOrdre({
  action,
  nomChamp,
  id,
  premier,
  dernier,
  designation,
  occupe,
}: {
  /** L'action de déplacement du bloc concerné. */
  action: (precedent: ContentState, formData: FormData) => Promise<ContentState>
  /** Nom du champ qui porte l'identifiant : `specId`, `faqId`… */
  nomChamp: string
  id: string
  premier: boolean
  dernier: boolean
  /** « cette caractéristique », « cette question » : pour les lecteurs d'écran. */
  designation: string
  occupe?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, ETAT_VIDE)
  const bloque = pending || occupe

  if (premier && dernier) return null

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name={nomChamp} value={id} />
      <Button
        type="submit"
        name="sens"
        value="avant"
        size="sm"
        variant="secondary"
        disabled={bloque || premier}
        aria-label={`Monter ${designation}`}
        title="Monter"
      >
        <IconChevronDown className="size-4 shrink-0 rotate-180" />
      </Button>
      <Button
        type="submit"
        name="sens"
        value="apres"
        size="sm"
        variant="secondary"
        disabled={bloque || dernier}
        aria-label={`Descendre ${designation}`}
        title="Descendre"
      >
        <IconChevronDown className="size-4 shrink-0" />
      </Button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  )
}
