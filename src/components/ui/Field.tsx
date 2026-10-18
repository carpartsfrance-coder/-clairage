import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconChevronDown } from './icons'

/* --------------------------------------------------------------------------
   Champs de formulaire
   Un libellé explicite est toujours rendu : si `hideLabel` est vrai il reste
   lisible par les lecteurs d'écran. Un message d'erreur est relié au champ par
   aria-describedby et aria-invalid, de sorte qu'il soit annoncé.
   -------------------------------------------------------------------------- */

const controlBase =
  'w-full rounded-sm border bg-white text-slate-ink placeholder:text-muted ' +
  'transition-colors disabled:bg-surface-muted disabled:text-muted'

const controlSizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-3.5 text-[0.95rem]',
  lg: 'h-14 px-4 text-base',
} as const

type Size = keyof typeof controlSizes

function FieldShell({
  id,
  label,
  hideLabel,
  hint,
  error,
  children,
  className,
  labelClassName,
}: {
  id: string
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  children: ReactNode
  className?: string
  /** Remplace la mise en forme de l'intitulé (bandeau sombre, petites capitales…). */
  labelClassName?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn(labelClassName ?? 'text-sm font-semibold', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  id: string
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  fieldSize?: Size
  wrapperClassName?: string
  labelClassName?: string
}

export function TextField({
  id,
  label,
  hideLabel,
  hint,
  error,
  fieldSize = 'md',
  className,
  wrapperClassName,
  labelClassName,
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      className={wrapperClassName}
      labelClassName={labelClassName}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          controlBase,
          controlSizes[fieldSize],
          error ? 'border-danger' : 'border-line-strong hover:border-muted',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  )
}

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  id: string
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  fieldSize?: Size
  /** Visuel optionnel affiché à gauche (logo de marque par exemple). */
  adornment?: ReactNode
  wrapperClassName?: string
  labelClassName?: string
}

export function SelectField({
  id,
  label,
  hideLabel,
  hint,
  error,
  fieldSize = 'md',
  adornment,
  className,
  wrapperClassName,
  labelClassName,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      className={wrapperClassName}
      labelClassName={labelClassName}
    >
      <div className="relative">
        {adornment ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            {adornment}
          </span>
        ) : null}
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            controlBase,
            controlSizes[fieldSize],
            'appearance-none pr-10',
            Boolean(adornment) && 'pl-11',
            error ? 'border-danger' : 'border-line-strong hover:border-muted',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-strong" />
      </div>
    </FieldShell>
  )
}
