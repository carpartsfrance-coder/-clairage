import Link from 'next/link'
import { IconCart } from '@/components/ui/icons'

/**
 * Accès au panier. Le compteur vient de la session réelle : il vaut 0 tant
 * qu'aucune ligne n'existe, et la pastille reste affichée à 0 comme sur la
 * maquette, pour que la cible garde la même taille d'un état à l'autre.
 */
export function CartLink({ itemCount }: { itemCount: number }) {
  const label =
    itemCount === 0
      ? 'Panier, vide'
      : `Panier, ${itemCount} article${itemCount > 1 ? 's' : ''}`

  return (
    <Link
      href="/panier"
      aria-label={label}
      className="flex h-12 items-center gap-3 rounded-sm px-2 transition-colors hover:text-brand"
    >
      <span className="relative shrink-0">
        <IconCart className="size-7" />
        <span
          aria-hidden
          className="absolute -right-2 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-brand text-[0.6875rem] font-bold leading-none text-white"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </span>
      <span className="hidden text-[0.9375rem] font-semibold lg:block">Panier</span>
    </Link>
  )
}
