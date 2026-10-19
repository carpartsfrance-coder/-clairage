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

export function BrandMark({
  name,
  logo,
  size = 'md',
  className,
}: {
  name: string
  logo?: { url: string; alt: string } | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const dimension = size === 'sm' ? 'size-7' : 'size-10'

  /*
    Le monogramme est TOUJOURS rendu, et le logo se pose par-dessus.

    Entre la première peinture et le décodage de l'image, la pastille restait
    vide : un trou dans la grille des marques, le temps qu'un PNG lourd
    arrive. Un logo introuvable ou supprimé des médias laissait le même trou,
    définitivement. En gardant le monogramme dessous, la place est toujours
    occupée par quelque chose de lisible.
  */
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-[#e3e6dc] bg-surface-paper font-bold tracking-[0.5px] text-[#8c9481]',
        dimension,
        size === 'sm' ? 'text-[9px]' : 'text-[11px]',
        className,
      )}
    >
      <span aria-hidden="true">{monogramme(name)}</span>

      {logo ? (
        <Image
          src={logo.url}
          alt=""
          fill
          sizes={size === 'sm' ? '28px' : '40px'}
          className="bg-white object-contain p-0.5"
        />
      ) : null}
    </span>
  )
}
