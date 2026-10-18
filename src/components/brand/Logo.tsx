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
    /*
      Composition reprise du code de référence (`.shop-brand`, `.brand`,
      `.brand-mark`, `.brand-baseline`) :
        — trois barres de 5 px de large, hautes de 15, 24 et 19 px, alignées
          en bas, écartées de 4 px, inclinées de -19° ;
        — le mot à 30 px, graisse 900, interlettrage -1.4 px ;
        — la ligne de signature à 7 px, interlettrage 1.45 px, décalée de
          38 px pour s'aligner sous la première lettre.
      Le dessin était auparavant un SVG à trois barres de hauteur égale.
    */
    <span className={cn('inline-flex flex-col gap-[7px]', className)}>
      <span
        className={cn(
          'inline-flex items-center text-[27px] leading-none font-black tracking-[-1.4px] whitespace-nowrap lg:text-[30px]',
          wordColor,
        )}
      >
        <LogoMark className="mr-3" />
        {identity.name}
        <span className="text-brand">{identity.wordmarkSuffix}</span>
      </span>

      {showBaseline ? (
        <span
          className={cn(
            'pl-[36px] text-[6px] leading-none tracking-[1.2px] uppercase lg:pl-[38px] lg:text-[7px] lg:tracking-[1.45px]',
            tone === 'dark' ? 'text-white/55' : 'text-[#90958c]',
          )}
        >
          {identity.baseline}
        </span>
      ) : null}
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex rounded-xs" aria-label={`${identity.name} — accueil`}>
      {content}
    </Link>
  )
}

/**
 * Les trois barres seules — `.brand-mark` de la référence.
 *
 * Elles sont dessinées en HTML plutôt qu'en SVG : l'inclinaison et les trois
 * hauteurs se lisent directement, et les barres suivent la couleur de marque
 * sans passer par un `fill`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 skew-x-[-19deg] items-end gap-[4px]', className)}
    >
      <i className="block h-[15px] w-[5px] bg-brand" />
      <i className="block h-[24px] w-[5px] bg-brand" />
      <i className="block h-[19px] w-[5px] bg-brand" />
    </span>
  )
}
