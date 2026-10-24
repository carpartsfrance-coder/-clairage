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
    /*
      `.header-cart-link` de la référence : icône de 25 px, pastille rouge de
      17 px cerclée de blanc, intitulé de 11 px en demi-gras — masqué sous
      1100 px, comme dans la référence.
    */
    <Link
      href="/panier"
      aria-label={label}
      className="touch-cible flex min-h-[38px] items-center gap-[9px] rounded-sm px-1 transition-colors hover:text-brand"
    >
      <span className="relative flex shrink-0">
        <IconCart className="size-[25px] text-[#333d2a]" strokeWidth={1.45} />
        <span
          aria-hidden
          className="absolute -top-[7px] -right-[5px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-brand px-[3px] text-[8px] leading-none font-bold text-white"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </span>
      <span className="hidden text-[11px] font-semibold text-[#3e4a33] xl:block">Panier</span>
    </Link>
  )
}
