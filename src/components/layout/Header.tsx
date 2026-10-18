import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { commercialTerms, formatPrice, identity, siteConfig } from '@/lib/identity'
import { getCartSummary, getSelectedVehicle } from '@/lib/session'
import { mainNav, topNav } from '@/lib/navigation'
import { IconHeadset, IconReturn, IconTruck } from '@/components/ui/icons'
import { HeaderSearch } from './HeaderSearch'
import { VehicleMenu } from './VehicleMenu'
import { CartLink } from './CartLink'
import { MobileNav } from './MobileNav'

/**
 * Header commun à toutes les pages — version 03-header-final.png.
 *
 * Trois étages sur ordinateur : bandeau fin (52 px), ligne principale (125 px)
 * et navigation (75 px). Sur mobile, la ligne principale se réduit à
 * menu / logo / panier, la recherche passe sur sa propre ligne et le véhicule
 * occupe un bandeau dédié : ce n'est pas la version ordinateur rétrécie.
 *
 * Le véhicule et le compteur de panier viennent de la session réelle
 * (cookie + base). Aucun des deux n'est décoratif.
 */
export async function Header() {
  const [vehicle, cart] = await Promise.all([getSelectedVehicle(), getCartSummary()])

  return (
    <header className="sticky top-0 z-40 bg-white">
      {/* ---------------- Bandeau fin ---------------- */}
      <div className="bg-ink text-white">
        <div className="container-page flex h-11 items-center justify-between gap-4 text-[0.8125rem] md:h-13">
          <p className="flex min-w-0 items-center gap-2">
            <IconTruck className="size-5 shrink-0 text-white/70" />
            <span className="truncate">
              {commercialTerms.freeShippingThresholdCents
                ? `Livraison offerte dès ${formatPrice(commercialTerms.freeShippingThresholdCents)}`
                : 'Livraison et retours'}
            </span>
          </p>

          {siteConfig.demoBanner ? (
            <p className="hidden text-white/55 lg:block">{siteConfig.demoBannerLabel}</p>
          ) : null}

          <nav aria-label="Informations pratiques" className="hidden items-center gap-4 md:flex">
            {topNav.map((item, index) => (
              <span key={item.href} className="flex items-center gap-4">
                {index > 0 ? <span aria-hidden className="text-white/25">|</span> : null}
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-xs text-white/85 transition-colors hover:text-white"
                >
                  {item.icon === 'return' ? (
                    <IconReturn className="size-5 shrink-0 text-white/70" />
                  ) : (
                    <IconHeadset className="size-5 shrink-0 text-white/70" />
                  )}
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>
      </div>

      {/* ---------------- Ligne principale ---------------- */}
      <div className="border-b border-line">
        <div className="container-page flex h-16 items-center gap-3 lg:h-[125px] lg:gap-8">
          <MobileNav vehicle={vehicle} />

          <Logo className="shrink-0" />

          {/* La grande recherche n'apparaît en ligne qu'à partir de lg. */}
          <div className="ml-auto hidden max-w-[589px] flex-1 lg:ml-0 lg:block">
            <HeaderSearch />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:gap-0">
            <div className="hidden lg:block">
              <VehicleMenu vehicle={vehicle} />
            </div>
            <span aria-hidden className="mx-5 hidden h-10 w-px bg-line lg:block" />
            <CartLink itemCount={cart.itemCount} />
          </div>
        </div>

        {/* Recherche pleine largeur sous la ligne principale, mobile et tablette. */}
        <div className="container-page pb-3 lg:hidden">
          <HeaderSearch compact />
        </div>
      </div>

      {/* ---------------- Véhicule, bandeau mobile ---------------- */}
      <div className="border-b border-line bg-surface-soft lg:hidden">
        <div className="container-page py-2">
          <VehicleMenu vehicle={vehicle} variant="bar" />
        </div>
      </div>

      {/* ---------------- Navigation ---------------- */}
      <nav
        aria-label="Catégories"
        className="hidden border-b border-line lg:block"
      >
        <div className="container-page flex h-[75px] items-center justify-between">
          <ul className="flex items-center">
            {mainNav.map((item, index) => (
              <li key={item.href} className="flex items-center">
                {index > 0 ? <span aria-hidden className="h-5 w-px bg-line" /> : null}
                <Link
                  href={item.href}
                  className={`px-6 text-[1.0625rem] font-semibold transition-colors first:pl-0 ${
                    item.highlight ? 'text-brand hover:text-brand-dark' : 'hover:text-brand'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/guides"
            className="flex shrink-0 items-center gap-2.5 text-[1.0625rem] font-semibold transition-colors hover:text-brand"
          >
            <IconHeadset className="size-6 shrink-0" />
            Conseils &amp; montage
          </Link>
        </div>
      </nav>

      <span className="sr-only" aria-live="polite">
        {vehicle ? `Véhicule sélectionné : ${vehicle.label}` : 'Aucun véhicule sélectionné'}
      </span>
      <span className="sr-only">{identity.name}</span>
    </header>
  )
}
