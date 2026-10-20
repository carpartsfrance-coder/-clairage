import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Pastille d'une marque de véhicule : son logo, ou un monogramme.
 *
 * **Aucun logo n'est livré avec le projet.** Un logo de constructeur est une
 * marque déposée : l'afficher relève d'un droit que l'exploitant détient ou
 * non, selon ses accords de distribution. Le code se contente donc de poser
 * celui qui a été téléversé dans les médias et rattaché à la marque
 * (`VehicleMake.logoMediaId`).
 *
 * Sans logo, on dessine un monogramme — les premières lettres du nom dans un
 * cadre neutre. Pas de pastille vide, pas de logo approchant : le menu reste
 * lisible et n'emprunte rien.
 *
 * Le logo est purement décoratif ici : le nom de la marque est toujours écrit
 * à côté, donc l'image porte un `alt` vide plutôt que de faire répéter le nom
 * aux lecteurs d'écran.
 */

/**
 * Monogramme d'une marque.
 *
 * Deux lettres pour un nom composé (« Alfa Romeo » → AR), sinon les deux
 * premières (« Volkswagen » → VO). Les chiffres et la ponctuation sont
 * écartés : « 4×4 Factory » doit donner FA, pas 4×.
 */
export function monogramme(nom: string): string {
  const mots = nom
    .split(/[\s-]+/)
    .map((mot) => mot.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)

  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[1][0]).toUpperCase()
}

/**
 * Trois tailles, et une seule décision par taille.
 *
 * `sm` est la pastille d'une ligne de liste, `md` celle d'une ligne de
 * tableau, `lg` celle d'une grille où le logo est ce qu'on regarde en
 * premier — le nom n'arrive qu'en dessous. Le carré de 60 px laisse un logo
 * large (Mercedes-Benz, Land Rover) atteindre une taille lisible là où 40 px
 * le réduisaient à une tache.
 */
const TAILLES = {
  sm: { boite: 'size-7 rounded-md', texte: 'text-[9px]', marge: 'p-0.5', sizes: '28px' },
  md: { boite: 'size-10 rounded-md', texte: 'text-[11px]', marge: 'p-0.5', sizes: '40px' },
  lg: { boite: 'size-[60px] rounded-lg', texte: 'text-[15px]', marge: 'p-[7px]', sizes: '60px' },
} as const

export function BrandMark({
  name,
  logo,
  size = 'md',
  className,
}: {
  name: string
  logo?: { url: string; alt: string } | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const taille = TAILLES[size]

  /*
    Le monogramme OU le logo, jamais les deux superposés.

    Les deux étaient empilés, le logo par-dessus, pour que la pastille ne
    reste pas vide le temps qu'un PNG arrive. Mais un logo de constructeur
    est presque toujours transparent : le monogramme se lisait au travers, et
    « CF » barrait CFMOTO, « DS » barrait DS Automobiles, « DA » barrait
    Dacia. Deux marques pour une seule voiture, sur la moitié de la grille.

    Le blanc du cadre tient maintenant le rôle que l'empilement cherchait à
    jouer : pendant le chargement, la pastille est un carré blanc bordé — une
    place tenue, et rien à lire de faux. Sans logo, c'est le monogramme qui
    occupe le cadre, sur fond papier pour qu'on voie au premier coup d'œil
    qu'il n'y a pas d'image.
  */
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden border border-[#e3e6dc] font-bold tracking-[0.5px] text-[#8c9481]',
        logo ? 'bg-white' : 'bg-surface-paper',
        taille.boite,
        taille.texte,
        className,
      )}
    >
      {logo ? (
        <Image
          src={logo.url}
          alt=""
          fill
          sizes={taille.sizes}
          className={cn('object-contain', taille.marge)}
        />
      ) : (
        <span aria-hidden="true">{monogramme(name)}</span>
      )}
    </span>
  )
}
