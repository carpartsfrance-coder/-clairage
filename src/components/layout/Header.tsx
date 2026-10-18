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
  const [vehicle, cart] = await Promise.all([getSelectedVehicle(), getCartSummary()])

  return (
    <HeaderShell>
      {/* ---------------- Bandeau de réassurance ----------------
          Il s'efface au défilement : c'est une information d'accueil, pas un
          outil de navigation. Ce qu'il annonce se retrouve en pied de page et
          dans le panier. */}
      <div
        className={
          'overflow-hidden bg-ink text-white transition-[height] duration-200 motion-reduce:transition-none ' +
          'h-8 md:h-9 group-data-scrolled/header:h-0'
        }
      >
        <div className="container-page flex h-8 items-center justify-between gap-4 text-[0.8125rem] md:h-9">
          <p className="flex min-w-0 items-center gap-2">
            <IconTruck className="size-4 shrink-0 text-white/70" />
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
                    <IconReturn className="size-4 shrink-0 text-white/70" />
                  ) : (
                    <IconHeadset className="size-4 shrink-0 text-white/70" />
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
        <div
          className={
            'container-page flex items-center gap-3 transition-[height] duration-200 motion-reduce:transition-none ' +
            'h-14 lg:h-[76px] lg:gap-6 group-data-scrolled/header:lg:h-[60px]'
          }
        >
          <MobileNav vehicle={vehicle} />

          {/* Le logotype se resserre au défilement, sans jamais devenir illisible. */}
          <Logo className="shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-scrolled/header:lg:scale-90 group-data-scrolled/header:lg:origin-left" />

          {/* La grande recherche n'apparaît en ligne qu'à partir de lg. */}
          <div className="ml-auto hidden max-w-[589px] flex-1 lg:ml-0 lg:block">
            <HeaderSearch />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:gap-0">
            <div className="hidden lg:block">
              <VehicleMenu vehicle={vehicle} />
            </div>
            <span aria-hidden className="mx-4 hidden h-8 w-px bg-line lg:block" />
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
          'overflow-hidden border-b border-line bg-surface-soft transition-[height] duration-200 motion-reduce:transition-none lg:hidden ' +
          'h-11 group-data-scrolled/header:h-0 group-data-scrolled/header:border-b-0'
        }
      >
        <div className="container-page flex h-11 items-center">
          <VehicleMenu vehicle={vehicle} variant="bar" />
        </div>
      </div>

      {/* ---------------- Navigation ---------------- */}
      <nav aria-label="Catégories" className="hidden border-b border-line lg:block">
        <div
          className={
            'container-page flex items-center justify-between transition-[height] duration-200 motion-reduce:transition-none ' +
            'h-12 group-data-scrolled/header:h-11'
          }
        >
          <ul className="flex items-center">
            {mainNav.map((item, index) => (
              <li key={item.href} className="flex items-center">
                {index > 0 ? <span aria-hidden className="h-4 w-px bg-line" /> : null}
                <Link
                  href={item.href}
                  className={`px-5 text-[0.9375rem] font-semibold transition-colors first:pl-0 ${
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
            className="flex shrink-0 items-center gap-2 text-[0.9375rem] font-semibold transition-colors hover:text-brand"
          >
            <IconHeadset className="size-5 shrink-0" />
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
