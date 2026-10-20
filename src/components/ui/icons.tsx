/**
 * Jeu d'icônes en trait fin (1.6 px), dessinées pour correspondre aux
 * maquettes. Toutes partagent la même boîte 24×24 et héritent de la couleur
 * du texte, de sorte qu'une icône posée dans un bandeau sombre n'a rien à
 * reconfigurer.
 *
 * Les icônes sont décoratives par défaut (aria-hidden). Lorsqu'une icône porte
 * seule le sens d'un contrôle, c'est au composant parent de fournir un
 * `aria-label`.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function Svg({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function IconTruck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 7.5h11v9H2z" />
      <path d="M13 10.5h4l3 3v3h-7z" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </Svg>
  )
}

export function IconHeadset(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 13.5h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M20 13.5h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1z" />
      <path d="M19 18.5v.5a2.5 2.5 0 0 1-2.5 2.5H13" />
    </Svg>
  )
}

export function IconReturn(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 9.5h12a5 5 0 0 1 0 10H9" />
      <path d="m6.5 6 -3.5 3.5 3.5 3.5" />
    </Svg>
  )
}

export function IconCar(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 16.5v2a.8.8 0 0 1-.8.8h-.9a.8.8 0 0 1-.8-.8v-2" />
      <path d="M22 16.5v2a.8.8 0 0 1-.8.8h-.9a.8.8 0 0 1-.8-.8v-2" />
      <path d="M1 16.5v-3.2a2 2 0 0 1 .5-1.3l1.3-1.5 1.5-3.6A2 2 0 0 1 6.1 5.5h11.8a2 2 0 0 1 1.8 1.4l1.5 3.6 1.3 1.5a2 2 0 0 1 .5 1.3v3.2z" />
      <path d="M3.3 11h17.4" />
      <circle cx="6" cy="14" r="1" />
      <circle cx="18" cy="14" r="1" />
    </Svg>
  )
}

export function IconMotorcycle(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5" cy="16" r="3.2" />
      <circle cx="19" cy="16" r="3.2" />
      <path d="M8.2 16h3.3l3.2-5h-4" />
      <path d="M14.7 11 17 7.5h2.5" />
      <path d="M16.3 16 13 11" />
      <path d="M7 9.5h3.5" />
    </Svg>
  )
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Svg>
  )
}

export function IconCart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 4h2.2l2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </Svg>
  )
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  )
}

export function IconChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  )
}

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </Svg>
  )
}

export function IconArrowUpRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </Svg>
  )
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  )
}

export function IconCheckCircle(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m8 12.3 2.8 2.7L16 9.8" />
    </Svg>
  )
}

export function IconGear(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </Svg>
  )
}

export function IconWrench(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15.6 3.8a5.5 5.5 0 0 0-6.9 7.1L3.4 16.2a2 2 0 0 0 0 2.8l1.6 1.6a2 2 0 0 0 2.8 0l5.3-5.3a5.5 5.5 0 0 0 7.1-6.9l-3.1 3.1-3-.7-.7-3z" />
    </Svg>
  )
}

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.8 4.5 6v6c0 4.3 3.1 7.7 7.5 9.2 4.4-1.5 7.5-4.9 7.5-9.2V6z" />
      <path d="m8.8 12 2.3 2.3 4.1-4.6" />
    </Svg>
  )
}

export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.2 1.9" />
    </Svg>
  )
}

export function IconInfo(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2" />
      <path d="M12 7.8h.01" />
    </Svg>
  )
}

export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.6 3.9 2.4 18a1.6 1.6 0 0 0 1.4 2.4h16.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0z" />
      <path d="M12 9v4.3" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.8}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </Svg>
  )
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.8}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

export function IconZoom(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5M11 8.5v5M8.5 11h5" />
    </Svg>
  )
}

export function IconPlay(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M10.2 8.8 15.6 12l-5.4 3.2z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPencil(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20h4L19.2 8.8a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" />
      <path d="m14.5 6.5 3 3" />
    </Svg>
  )
}

export function IconSliders(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h7M15 17h5" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="13" cy="17" r="2" />
    </Svg>
  )
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Svg>
  )
}

export function IconMail(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.8 7 7.1 5.4a1.8 1.8 0 0 0 2.2 0L20.2 7" />
    </Svg>
  )
}

/** Import de fichier : une feuille et une flèche qui entre. */
export function IconImport(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M12 10.5v5.5" />
      <path d="m9.8 13.8 2.2 2.2 2.2-2.2" />
    </Svg>
  )
}

/** Média : un cadre, un horizon et un soleil. */
export function IconMinus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

/** Carton d'expédition : désigne un conditionnement et son contenu. */
export function IconPack(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m3 6 9-4 9 4v12l-9 4-9-4V6Z" />
      <path d="m3 6 9 4 9-4" />
      <path d="M12 10v12" />
      <path d="m7 4 10 4v5" />
    </Svg>
  )
}

export function IconImage(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m3.5 17 4.8-4.4a1.6 1.6 0 0 1 2.2 0l3.1 2.9 2.1-1.8a1.6 1.6 0 0 1 2.1 0l2.7 2.3" />
    </Svg>
  )
}
