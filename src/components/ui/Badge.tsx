import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconAlert, IconCheckCircle, IconInfo } from './icons'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand' | 'dark'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-muted-strong border-line',
  ok: 'bg-ok-soft text-ok border-ok-border',
  warn: 'bg-warn-soft text-warn border-warn-border',
  danger: 'bg-danger-soft text-danger border-brand-border',
  info: 'bg-info-soft text-info border-info/20',
  brand: 'bg-brand text-white border-brand',
  dark: 'bg-ink text-white border-ink',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs border px-2 py-1 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* --------------------------------------------------------------------------
   Statut de compatibilité
   Trois états, jamais deux. L'absence d'information se dit, elle ne se tait
   pas et elle ne se présente jamais comme une confirmation.
   -------------------------------------------------------------------------- */

export type FitmentStatusValue = 'CONFIRMED' | 'UNKNOWN' | 'INCOMPATIBLE'

const fitmentCopy: Record<FitmentStatusValue, { label: string; tone: BadgeTone }> = {
  CONFIRMED: { label: 'Compatibilité confirmée', tone: 'ok' },
  UNKNOWN: { label: 'Informations insuffisantes', tone: 'warn' },
  INCOMPATIBLE: { label: 'Incompatible', tone: 'danger' },
}

export function FitmentBadge({
  status,
  short = false,
  className,
}: {
  status: FitmentStatusValue
  short?: boolean
  className?: string
}) {
  const { label, tone } = fitmentCopy[status]
  const Icon = status === 'CONFIRMED' ? IconCheckCircle : status === 'UNKNOWN' ? IconInfo : IconAlert
  const shortLabel =
    status === 'CONFIRMED' ? 'Confirmé' : status === 'UNKNOWN' ? 'À vérifier' : 'Incompatible'
  return (
    <Badge tone={tone} className={className} icon={<Icon className="size-3.5 shrink-0" />}>
      {short ? shortLabel : label}
    </Badge>
  )
}

/**
 * Homologation routière : volontairement distincte de la compatibilité de
 * montage. Un kit peut se monter sans être homologué sur le marché visé.
 */
export function RoadApprovalNote({
  status,
  market = 'FR',
  note,
}: {
  status: 'APPROVED' | 'NOT_APPROVED' | 'UNKNOWN'
  market?: string
  note?: string | null
}) {
  const copy = {
    APPROVED: `Homologué pour un usage routier (${market}).`,
    NOT_APPROVED: `Non homologué pour un usage routier (${market}).`,
    UNKNOWN: `Usage routier : homologation à confirmer (${market}).`,
  }[status]
  /*
    `.road-note` de la référence : une ligne de 8 px, pastille d'information à
    gauche. La taille est héritée du conteneur pour que la fiche produit la
    compose à 8 px sans forcer les autres pages qui s'en servent.
  */
  return (
    <p className="flex items-start gap-1.5 text-[inherit] text-[#828282]">
      <IconInfo className="mt-px size-3 shrink-0" />
      <span>
        {copy}
        {note ? <span className="ml-1 text-muted">{note}</span> : null}
      </span>
    </p>
  )
}
