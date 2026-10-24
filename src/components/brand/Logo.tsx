import Image from 'next/image'
import Link from 'next/link'
import { identity } from '@/lib/identity'
import { cn } from '@/lib/cn'

/**
 * Logotype LEDVROOM.
 *
 * Deux fichiers pour un seul dessin : le mot-symbole est noir sur fond clair,
 * blanc sur fond sombre, et « LED » reste rouge dans les deux cas. Ce n'est
 * pas une recolorisation possible en CSS — il faut les deux images, et `tone`
 * choisit laquelle.
 *
 * **La signature « Éclairage auto & moto » est dans l'image.** Elle n'est donc
 * plus une ligne de texte qu'on affiche ou qu'on masque : d'où la disparition
 * de `showBaseline`, qui n'avait plus rien à commander. Les emplacements
 * compacts jouent sur la hauteur, pas sur le contenu.
 *
 * La hauteur pilote tout, la largeur suit le rapport 2000 × 669 du fichier.
 * `priority` sur l'en-tête : le logotype est au-dessus de la ligne de
 * flottaison, et le laisser arriver en différé fait sauter la mise en page au
 * premier affichage.
 */

/** Rapport du fichier source, à tenir pour que rien ne s'étire. */
const RAPPORT = 2000 / 669

export function Logo({
  tone = 'light',
  height = 40,
  priority = false,
  className,
  href = '/',
}: {
  /** `light` = fond clair, mot en noir. `dark` = fond sombre, mot en blanc. */
  tone?: 'light' | 'dark'
  /** Hauteur rendue, en pixels. La largeur en découle. */
  height?: number
  priority?: boolean
  className?: string
  href?: string | null
}) {
  const fichier = tone === 'dark' ? 'ledvroom-fond-sombre' : 'ledvroom'

  const content = (
    <Image
      src={`/marque/${fichier}.webp`}
      /*
        Le texte alternatif porte le nom et la signature parce que l'image les
        porte : un lecteur d'écran doit entendre ce qu'un œil lit. Quand le
        logotype est un lien, c'est lui qui nomme la destination.
      */
      alt={`${identity.name} — ${identity.baseline}`}
      width={Math.round(height * RAPPORT)}
      height={height}
      priority={priority}
      className={cn('h-auto w-auto', className)}
      style={{ height, width: 'auto' }}
    />
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex rounded-xs" aria-label={`${identity.name} — accueil`}>
      {content}
    </Link>
  )
}

/**
 * L'icône carrée seule — le « V » sur fond noir.
 *
 * Elle sert là où le logotype complet serait illisible : une pastille, une
 * vignette, un en-tête très étroit. C'est le même dessin que la favicon.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/marque/icone.webp"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[22%]', className)}
    />
  )
}
