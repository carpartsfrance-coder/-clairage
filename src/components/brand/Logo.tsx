import Link from 'next/link'
import { identity } from '@/lib/identity'
import { cn } from '@/lib/cn'

/**
 * Logotype : trois barres obliques rouges, le mot-symbole, le point rouge,
 * et la baseline en petites capitales espacées.
 *
 * Le dessin est vectoriel et hérite des couleurs du thème : la même pièce sert
 * sur fond blanc (header) et sur fond anthracite (footer) via `tone`.
 * `showBaseline` suit les maquettes : baseline visible dans le header final,
 * masquée dans les contextes compacts (mobile, footer, e-mails).
 */
export function Logo({
  tone = 'light',
  showBaseline = true,
  className,
  href = '/',
}: {
  /** `light` = fond clair, texte sombre. `dark` = fond sombre, texte blanc. */
  tone?: 'light' | 'dark'
  showBaseline?: boolean
  className?: string
  href?: string | null
}) {
  const wordColor = tone === 'dark' ? 'text-white' : 'text-slate-ink'

  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-[26px] w-auto shrink-0" />
      <span className="inline-flex flex-col leading-none">
        <span
          className={cn(
            'font-wordmark text-[1.55rem] font-extrabold leading-none tracking-[-0.015em]',
            wordColor,
          )}
        >
          {identity.name}
          <span className="text-brand">{identity.wordmarkSuffix}</span>
        </span>
        {showBaseline ? (
          <span
            className={cn(
              'font-wordmark mt-1 text-[0.5rem] font-semibold uppercase leading-none tracking-[0.17em]',
              tone === 'dark' ? 'text-white/60' : 'text-muted',
            )}
          >
            {identity.baseline}
          </span>
        ) : null}
      </span>
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex rounded-xs" aria-label={`${identity.name} — accueil`}>
      {content}
    </Link>
  )
}

/** Les trois barres seules — favicon, e-mails, chargeurs. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 54 28" className={className} aria-hidden="true" focusable="false">
      <g fill="currentColor" className="text-brand">
        <path d="M10.8 2h10.4L13.6 26H3.2z" />
        <path d="M24.6 2H35l-7.6 24H17z" />
        <path d="M38.4 2h10.4l-7.6 24H30.8z" />
      </g>
    </svg>
  )
}
