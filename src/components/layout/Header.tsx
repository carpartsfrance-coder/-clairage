import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { commercialTerms, dureeGarantie, formatPrice, identity, promesseRetour } from '@/lib/identity'
import { getCartSummary, getSelectedVehicle } from '@/lib/session'
import { getSeuilLivraisonOfferte } from '@/lib/shipping'
import { getNavigation } from '@/lib/queries/navigation'
import { MainNav } from './MainNav'
import { IconUser, IconHeadset } from '@/components/ui/icons'
import { HeaderSearch } from './HeaderSearch'
import { VehicleMenu } from './VehicleMenu'
import { CartLink } from './CartLink'
import { MobileNav } from './MobileNav'
import { HeaderShell } from './HeaderShell'
import { BoutonRecherche } from './BoutonRecherche'
import { BandeauEngagements, type Engagement } from './BandeauEngagements'

/**
 * Header commun à toutes les pages — composition de 03-header-final.png.
 *
 * Trois étages sur ordinateur : bandeau des engagements, ligne principale
 * (logo, recherche, véhicule, panier) et navigation par catégories. Sur
 * mobile, la ligne principale se réduit à menu / logo / panier, la recherche
 * passe sur sa propre ligne et le véhicule occupe un bandeau dédié : ce n'est
 * pas la version ordinateur rétrécie.
 *
 * **Hauteurs.** Le header est collant : tout ce qu'il occupe est retiré à la
 * page pendant toute la lecture. Il tient donc en ~160 px à l'arrivée, et se
 * replie à ~104 px dès qu'on défile — le bandeau des engagements s'efface, la
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
  const [vehicle, cart, sections, seuilLivraisonOfferte] = await Promise.all([
    getSelectedVehicle(),
    getCartSummary(),
    // L'arborescence vient du catalogue : le menu ne peut pas promettre une
    // famille, une marque ou un culot que la base n'a pas.
    getNavigation(),
    // Seuil réglé dans le back-office (page « Livraison »), pas une constante.
    getSeuilLivraisonOfferte(),
  ])

  // Chaque engagement n'apparaît que s'il est réglé : une promesse retirée
  // de `commercialTerms` (ou un seuil effacé du back-office) disparaît du
  // bandeau au lieu d'y rester écrite.
  const engagements: Engagement[] = [
    commercialTerms.dispatchEstimate
      ? {
          libelle: `Expédition sous ${commercialTerms.dispatchEstimate}`,
          href: '/livraison-retours',
          icone: 'expedition',
        }
      : null,
    { libelle: 'SAV en français et réactif', href: '/aide', icone: 'sav' },
    dureeGarantie()
      ? { libelle: `Garantie ${dureeGarantie()}`, href: '/garanties', icone: 'garantie' }
      : null,
    seuilLivraisonOfferte
      ? {
          libelle: `Livraison gratuite dès ${formatPrice(seuilLivraisonOfferte)}`,
          href: '/livraison-retours',
          icone: 'livraison',
        }
      : null,
    promesseRetour()
      ? { libelle: promesseRetour()!, href: '/livraison-retours#retours', icone: 'retour' }
      : null,
  ].filter((engagement): engagement is Engagement => engagement !== null)

  return (
    <HeaderShell>
      {/* ---------------- Bandeau des engagements ----------------
          Les cinq promesses de la boutique, sur le modèle du bandeau de
          LedPerf (demande de l'exploitant, 20 novembre 2026). Il s'efface au
          défilement : c'est une information d'accueil, pas un outil de
          navigation. Chaque engagement mène à la page qui le détaille, et ce
          qu'il annonce se retrouve en pied de page et dans le panier. */}
      <div
        className={
          'on-dark overflow-hidden bg-brand text-white transition-[height] duration-200 motion-reduce:transition-none ' +
          'h-[30px] lg:h-8 group-data-scrolled/header:h-0'
        }
      >
        <div className="container-page h-[30px] text-[11.5px] font-medium lg:h-8 lg:text-[12px]">
          <BandeauEngagements engagements={engagements} />
        </div>
      </div>

      {/* ---------------- Ligne principale ---------------- */}
      <div className="border-b border-[#e7e7e7]">
        <div
          className={
            /* .shop-header-main : 89 px et 36 px d'écart (43 au-delà de 1450 px). */
            'container-page flex items-center gap-3 transition-[height] duration-200 motion-reduce:transition-none ' +
            'h-[52px] lg:h-[89px] lg:gap-9 group-data-scrolled/header:lg:h-[64px]'
          }
        >
          <MobileNav vehicle={vehicle} sections={sections} />

          {/* Le logotype se resserre au défilement, sans jamais devenir illisible. */}
          <Logo priority height={34} className="shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-scrolled/header:lg:origin-left group-data-scrolled/header:lg:scale-90" />

          {/* La grande recherche n'apparaît en ligne qu'à partir de lg. */}
          {/* .header-search : flex 1, plafonné à 550 px au-delà de 1450 px. */}
          <div className="ml-auto hidden flex-1 lg:ml-0 lg:block xl:max-w-[550px] lg:[body:has([data-tunnel])_&]:hidden">
            <HeaderSearch />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:gap-0">
            <div className="hidden lg:block lg:[body:has([data-tunnel])_&]:hidden">
              <VehicleMenu vehicle={vehicle} />
            </div>
            {/* .header-cart-link : filet à gauche, 24 px de retrait. */}
            <span aria-hidden className="mx-5 hidden h-8 w-px bg-[#e0e0e0] lg:block" />
            {/*
              « Mon compte », repris de la maquette. Il mène à `/compte`, qui
              existe réellement — commandes, adresses, profil, véhicules — et
              non à une page à faire.
            */}
            <Link
              href="/compte"
              className="touch-cible hidden min-h-[38px] items-center gap-[9px] rounded-sm px-1 transition-colors hover:text-brand lg:flex"
            >
              <IconUser className="size-[25px] shrink-0 text-[#343434]" strokeWidth={1.45} />
              <span className="hidden text-[11px] font-semibold text-[#3f3f3f] xl:block">
                Mon compte
              </span>
            </Link>
            <span aria-hidden className="mx-5 hidden h-8 w-px bg-[#e0e0e0] lg:block" />
            {/* Mobile, page défilée : la loupe remplace la barre de recherche. */}
            <div className="lg:hidden [body:has([data-tunnel])_&]:hidden">
              <BoutonRecherche cible="recherche-mobile" />
            </div>
            <CartLink itemCount={cart.itemCount} />
          </div>
        </div>

        {/* Recherche pleine largeur sous la ligne principale, mobile et tablette.
            Affichée à l'arrivée ; repliée au défilement, où la loupe de la
            ligne principale la rouvre d'un appui (BoutonRecherche). Le header
            collant ne garde ainsi que la ligne du logo pendant la lecture. */}
        <div
          id="recherche-mobile"
          className="container-page pb-2.5 lg:hidden [body:has([data-tunnel])_&]:hidden [header[data-scrolled]:not([data-recherche])_&]:h-0 [header[data-scrolled]:not([data-recherche])_&]:overflow-hidden [header[data-scrolled]:not([data-recherche])_&]:pb-0"
        >
          <HeaderSearch compact />
        </div>
      </div>

      {/* ---------------- Véhicule, bandeau mobile ----------------
          Absent des fiches faites pour un véhicule précis (repère
          `data-fiche-vehicule`) : le titre porte déjà le véhicule.
          Replié au défilement : le véhicule retenu reste rappelé sur les pages
          qui en dépendent (fiche, panier, résultats) et reste modifiable
          depuis le menu. */}
      <div
        className={
          'overflow-hidden border-b border-line bg-[#f6f6f6] transition-[height] duration-200 motion-reduce:transition-none lg:hidden [body:has([data-fiche-vehicule])_&]:hidden [body:has([data-tunnel])_&]:hidden ' +
          'h-9 group-data-scrolled/header:h-0 group-data-scrolled/header:border-b-0'
        }
      >
        <div className="container-page flex h-9 items-center">
          <VehicleMenu vehicle={vehicle} variant="bar" />
        </div>
      </div>

      {/* ---------------- Navigation ----------------
          Recherche, véhicule et rayons sont masqués pendant la commande
          (repère `data-tunnel`) : au moment de payer, ils ne servent qu'à
          sortir du tunnel. Le logo et le panier restent. */}
      <nav aria-label="Catégories" className="hidden border-t border-[#eeeeee] lg:block lg:[body:has([data-tunnel])_&]:hidden">
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
            /* .header-nav-help : 10 px, couleur #808080. */
            className="flex shrink-0 items-center gap-2 text-[10px] whitespace-nowrap text-[#808080] transition-colors hover:text-[#343434]"
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
