import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant =
  /** Action principale : rouge plein. Une seule par zone de décision. */
  | 'primary'
  /** Action secondaire sur fond clair : contour fin. */
  | 'secondary'
  /** Action secondaire posée sur un bandeau sombre. */
  | 'onDark'
  /** Action tertiaire, sans contour. */
  | 'ghost'
  /** Lien d'apparence texte, souligné au survol. */
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-sm transition-colors ' +
  'disabled:opacity-55 disabled:pointer-events-none select-none'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-darker',
  secondary:
    'bg-white text-slate-ink border border-line-strong hover:border-slate-ink hover:bg-surface-soft',
  onDark: 'bg-transparent text-white border border-white/35 hover:bg-white/10 hover:border-white/60',
  ghost: 'bg-transparent text-slate-ink hover:bg-surface-muted',
  link: 'bg-transparent text-slate-ink underline underline-offset-4 decoration-line-strong hover:decoration-brand hover:text-brand px-0',
}

const sizes: Record<ButtonSize, string> = {
  /** 36 px : filtres, actions de tableau. */
  sm: 'h-9 px-3.5 text-sm',
  /** 44 px : taille par défaut, confortable au doigt. */
  md: 'h-11 px-5 text-[0.95rem]',
  /** 56 px : appel à l'action principal des maquettes. */
  lg: 'h-14 px-7 text-lg',
}

type CommonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Occupe toute la largeur — barre d'achat mobile, formulaires. */
  block?: boolean
  iconRight?: ReactNode
  iconLeft?: ReactNode
  children?: ReactNode
  className?: string
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: CommonProps = {}) {
  return cn(base, variants[variant], variant === 'link' ? '' : sizes[size], block && 'w-full', className)
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  iconLeft,
  iconRight,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  )
}

type ButtonLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string }

/** Même apparence que Button, mais c'est un lien : navigation réelle. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  block,
  iconLeft,
  iconRight,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass({ variant, size, block, className })} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  )
}
