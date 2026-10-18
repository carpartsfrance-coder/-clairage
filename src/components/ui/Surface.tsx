import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconAlert, IconCheckCircle, IconInfo } from './icons'

/** Carte : bordure fine, arrondi modéré, pas d'ombre au repos. */
export function Card({
  as: Tag = 'div',
  children,
  className,
  interactive,
}: {
  as?: 'div' | 'article' | 'li' | 'section'
  children: ReactNode
  className?: string
  /** Ajoute un état de survol pour les cartes cliquables. */
  interactive?: boolean
}) {
  return (
    <Tag
      className={cn(
        'rounded-md border border-line bg-white',
        interactive && 'transition-colors hover:border-line-strong',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** Puce de filtre. `active` rend l'état sélectionné lisible sans la couleur seule. */
export function Chip({
  children,
  active,
  className,
  ...rest
}: {
  children: ReactNode
  active?: boolean
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-sm border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line-strong bg-white text-slate-ink hover:border-slate-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export type AlertTone = 'info' | 'ok' | 'warn' | 'danger'

const alertStyles: Record<AlertTone, { box: string; icon: typeof IconInfo }> = {
  info: { box: 'bg-info-soft border-info/25 text-slate-ink', icon: IconInfo },
  ok: { box: 'bg-ok-soft border-ok-border text-slate-ink', icon: IconCheckCircle },
  warn: { box: 'bg-warn-soft border-warn-border text-slate-ink', icon: IconAlert },
  danger: { box: 'bg-danger-soft border-brand-border text-slate-ink', icon: IconAlert },
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  /** `assertive` pour une erreur qui interrompt l'action en cours. */
  live,
}: {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  className?: string
  live?: 'polite' | 'assertive'
}) {
  const { box, icon: Icon } = alertStyles[tone]
  return (
    <div
      role={live === 'assertive' ? 'alert' : undefined}
      aria-live={live}
      className={cn('flex items-start gap-3 rounded-md border px-4 py-3', box, className)}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'danger' && 'text-danger',
          tone === 'info' && 'text-info',
        )}
      />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'text-muted-strong')}>{children}</div> : null}
      </div>
    </div>
  )
}

/** État vide : on explique, et on propose toujours une sortie. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: string
  action?: { label: string; href: string }
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface-soft px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-lg font-bold">{title}</p>
      {description ? <p className="max-w-prose text-sm text-muted-strong">{description}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-1 text-sm font-semibold text-brand underline underline-offset-4"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

/** En-tête de section : sur-titre + titre, repris de la grille des maquettes. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  tone = 'light',
  className,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  tone?: 'light' | 'dark'
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p className={cn('eyebrow', tone === 'dark' ? 'text-brand' : 'text-brand')}>{eyebrow}</p>
      ) : null}
      <h2
        className={cn(
          'text-[1.75rem] leading-[1.15] font-extrabold sm:text-[2.125rem]',
          tone === 'dark' ? 'text-white' : 'text-slate-ink',
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className={cn('max-w-2xl text-base', tone === 'dark' ? 'text-white/80' : 'text-muted-strong')}>
          {description}
        </p>
      ) : null}
      {children}
    </div>
  )
}
