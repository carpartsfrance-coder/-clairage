import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { commercialTerms, formatPrice, identity, siteConfig } from '@/lib/identity'
import { getCartSummary, getSelectedVehicle } from '@/lib/session'
import { topNav } from '@/lib/navigation'
import { getNavigation } from '@/lib/queries/navigation'
import { MainNav } from './MainNav'
import { IconHeadset, IconReturn, IconTruck } from '@/components/ui/icons'
import { HeaderSearch } from './HeaderSearch'
import { VehicleMenu } from './VehicleMenu'
import { CartLink } from './CartLink'
import { MobileNav } from './MobileNav'
import { HeaderShell } from './HeaderShell'

/**
 * Header commun à toutes les pages — composition de 03-header-final.png.
 *
 * Trois étages sur ordinateur : bandeau de réassurance, ligne principale
 * (logo, recherche, véhicule, panier) et navigation par catégories. Sur
 * mobile, la ligne principale se réduit à menu / logo / panier, la recherche
 * passe sur sa propre ligne et le véhicule occupe un bandeau dédié : ce n'est
 * pas la version ordinateur rétrécie.
 *
 * **Hauteurs.** Le header est collant : tout ce qu'il occupe est retiré à la
 * page pendant toute la lecture. Il tient donc en ~160 px à l'arrivée, et se
 * replie à ~104 px dès qu'on défile — le bandeau de réassurance s'efface, la
 * ligne principale et la navigation se resserrent. Rien ne disparaît qui ne
 * soit retrouvable : sur mobile, le bandeau véhicule replié reste accessible
 * par le menu, et la recherche ne se replie jamais.
 *
 * Le repli est piloté par `HeaderShell`, qui pose `data-scrolled` sur le
 * `<header>`. Chaque étage réagit par `group-data-scrolled/header:`.
 *
 * Le véhicule et le compteur de panier viennent de la session réelle
 * (cookie + base). Aucun des deux n'est décoratif.
 */
export async function Header() {
  const [vehicle, cart, sections] = await Promise.all([
    getSelectedVehicle(),
    getCartSummary(),
    // L'arborescence vient du catalogue : le menu ne peut pas promettre une
    // famille, une marque ou un culot que la base n'a pas.
    getNavigation(),
  ])

  return (
    <HeaderShell>
      {/* ---------------- Bandeau de réassurance ----------------
          Il s'efface au défilement : c'est une information d'accueil, pas un
          outil de navigation. Ce qu'il annonce se retrouve en pied de page et
          dans le panier. */}
      <div
        className={
          /* .utility-bar : 29 px (26 sous 800 px), fond #202326, texte 10 px. */
          'overflow-hidden bg-[#202326] text-[#d4d9db] transition-[height] duration-200 motion-reduce:transition-none ' +
          'h-[26px] md:h-[29px] group-data-scrolled/header:h-0'
        }
      >
        <div className="container-page flex h-[26px] items-center justify-between gap-5 text-[9px] md:h-[29px] md:text-[10px]">
          <p className="flex min-w-0 items-center gap-2">
            <IconTruck className="size-[13px] shrink-0 md:size-[14px]" strokeWidth={1.4} />
            <span className="truncate">
              {commercialTerms.freeShippingThresholdCents
                ? `Livraison offerte dès ${formatPrice(commercialTerms.freeShippingThresholdCents)}`
                : 'Livraison et retours'}
            </span>
          </p>

          {siteConfig.demoBanner ? (
            <p className="hidden text-[8px] tracking-[0.5px] text-[#8e999f] uppercase lg:block">
              {siteConfig.demoBannerLabel}
            </p>
          ) : null}

          <nav
            aria-label="Informations pratiques"
            className="hidden items-center gap-4 text-[9px] text-[#c3c9cc] md:flex lg:gap-6"
          >
            {topNav.map((item, index) => (
              <span key={item.href} className="flex items-center gap-4">
                {index > 0 ? <span aria-hidden className="text-white/25">|</span> : null}
                <Link
                  href={item.href}
                  className="flex items-center gap-[7px] rounded-xs transition-colors hover:text-white"
                >
                  {item.icon === 'return' ? (
                    <IconReturn className="size-[14px] shrink-0" strokeWidth={1.4} />
                  ) : (
                    <IconHeadset className="size-[14px] shrink-0" strokeWidth={1.4} />
                  )}
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>
      </div>

      {/* ---------------- Ligne principale ---------------- */}
      <div className="border-b border-[#e7e9e5]">
        <div
          className={
            /* .shop-header-main : 89 px et 36 px d'écart (43 au-delà de 1450 px). */
            'container-page flex items-center gap-3 transition-[height] duration-200 motion-reduce:transition-none ' +
            'h-14 lg:h-[89px] lg:gap-9 group-data-scrolled/header:lg:h-[64px]'
          }
        >
          <MobileNav vehicle={vehicle} sections={sections} />

          {/* Le logotype se resserre au défilement, sans jamais devenir illisible. */}
          <Logo priority height={34} className="shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-scrolled/header:lg:origin-left group-data-scrolled/header:lg:scale-90" />

          {/* La grande recherche n'apparaît en ligne qu'à partir de lg. */}
          {/* .header-search : flex 1, plafonné à 550 px au-delà de 1450 px. */}
          <div className="ml-auto hidden flex-1 lg:ml-0 lg:block xl:max-w-[550px]">
            <HeaderSearch />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:gap-0">
            <div className="hidden lg:block">
              <VehicleMenu vehicle={vehicle} />
            </div>
            {/* .header-cart-link : filet à gauche, 24 px de retrait. */}
            <span aria-hidden className="mx-5 hidden h-8 w-px bg-[#e1e6d9] lg:block" />
            <CartLink itemCount={cart.itemCount} />
          </div>
        </div>

        {/* Recherche pleine largeur sous la ligne principale, mobile et tablette.
            Elle ne se replie jamais : chercher est la raison d'être de ce
            header, et la masquer obligerait à un geste de plus à chaque fois. */}
        <div className="container-page pb-2.5 lg:hidden">
          <HeaderSearch compact />
        </div>
      </div>

      {/* ---------------- Véhicule, bandeau mobile ----------------
          Replié au défilement : le véhicule retenu reste rappelé sur les pages
          qui en dépendent (fiche, panier, résultats) et reste modifiable
          depuis le menu. */}
      <div
        className={
          'overflow-hidden border-b border-line bg-[#f7f8f4] transition-[height] duration-200 motion-reduce:transition-none lg:hidden ' +
          'h-11 group-data-scrolled/header:h-0 group-data-scrolled/header:border-b-0'
        }
      >
        <div className="container-page flex h-11 items-center">
          <VehicleMenu vehicle={vehicle} variant="bar" />
        </div>
      </div>

      {/* ---------------- Navigation ---------------- */}
      <nav aria-label="Catégories" className="hidden border-t border-[#f0f1ec] lg:block">
        <div
          className={
            /* .shop-category-inner : 46 px, items à 12 px, écart de 28 px. */
            'container-page flex items-center justify-between transition-[height] duration-200 motion-reduce:transition-none ' +
            'h-[46px] group-data-scrolled/header:h-10'
          }
        >
          <MainNav sections={sections} />

          <Link
            href="/guides"
            /* .header-nav-help : 10 px, couleur #7f8d73. */
            className="flex shrink-0 items-center gap-2 text-[10px] whitespace-nowrap text-[#7f8d73] transition-colors hover:text-[#333e29]"
          >
            <IconHeadset className="size-4 shrink-0" strokeWidth={1.5} />
            Conseils &amp; montage
          </Link>
        </div>
      </nav>

      <span className="sr-only" aria-live="polite">
        {vehicle ? `Véhicule sélectionné : ${vehicle.label}` : 'Aucun véhicule sélectionné'}
      </span>
      <span className="sr-only">{identity.name}</span>
    </HeaderShell>
  )
}
