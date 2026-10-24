import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { footerNav } from '@/lib/navigation'
import { IconHeadset, IconReturn, IconTruck } from '@/components/ui/icons'
import { commercialTerms, formatPrice, identity, siteConfig } from '@/lib/identity'

/**
 * Pied de page — `.home-footer` du code de référence.
 *
 * Valeurs reprises de `home.css` : 39 px de marge haute et 22 px de marge
 * basse, grille d'écart 30 px refermée par un filet #3c4448 à 29 px, intitulés
 * de colonne à 10 px, liens à 9 px espacés de 8 px, colonne de repères à
 * droite, puis la ligne de bas de page à 8 px et l'astérisque à 7 px.
 *
 * Deux choses ne viennent pas de la référence, et restent :
 *
 * - Les liens gardent 10 px de marge intérieure sous 1024 px. Un lien de 9 px
 *   sans hauteur propre fait une cible de 12 px : c'est injouable au doigt.
 * - Les mentions légales affichées dépendent de ce qui est réellement
 *   renseigné dans `identity.legal`. Tant qu'une information manque, la ligne
 *   n'est pas rendue — on ne comble pas un champ d'identité par une formule
 *   générique — et l'absence est dite au visiteur.
 */
export function Footer() {
  const { legal, contact } = identity
  const hasLegalIdentity = Boolean(legal.companyName)
  const year = new Date().getFullYear()

  // .footer-manifesto : les repères de la référence, mais lus depuis les
  // conditions commerciales. Un seuil non renseigné ne s'affiche pas.
  const promises = [
    commercialTerms.freeShippingThresholdCents
      ? {
          icon: IconTruck,
          text: `Livraison offerte dès ${formatPrice(commercialTerms.freeShippingThresholdCents)}`,
        }
      : null,
    commercialTerms.returnWindowDays
      ? { icon: IconReturn, text: `Retours sous ${commercialTerms.returnWindowDays} jours` }
      : null,
    { icon: IconHeadset, text: 'Assistance au choix et au montage' },
  ].filter((promise): promise is { icon: typeof IconTruck; text: string } => promise !== null)

  return (
    <footer className="mt-auto bg-ink text-white">
      <div className="container-page pt-[30px] pb-[21px] lg:pt-[39px] lg:pb-[22px]">
        {/* .footer-top : marque, colonnes de liens, repères. */}
        <div className="grid grid-cols-2 gap-[23px] border-b border-[#3a454b] pb-[23px] lg:grid-cols-[1.2fr_repeat(4,0.8fr)_1.2fr] lg:gap-[30px] lg:border-[#3c4448] lg:pb-[29px]">
          {/* Sous 1024 px la référence met la marque et la baseline côte à côte
              sur toute la largeur. */}
          <div className="col-span-2 flex items-center gap-[22px] lg:col-span-1 lg:block">
            <Logo tone="dark" height={38} />
            <p className="max-w-xs text-[10px] leading-[1.7] text-[#8a989e] lg:mt-[15px] lg:text-[11px] lg:leading-[1.8]">
              {identity.tagline}
            </p>
          </div>

          {footerNav.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3 text-[10px] font-bold text-[#e2e7e8] lg:mb-3.5">
                {column.title}
              </h2>
              <ul>
                {column.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block py-2.5 text-[9px] text-[#97a5aa] transition-colors hover:text-white lg:my-2 lg:py-0"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* .footer-manifesto : repères à gauche d'une icône de 16 px. */}
          <div className="col-span-2 border-t border-[#3a454b] pt-5 lg:col-span-1 lg:border-0 lg:pt-0 lg:pl-5">
            <ul>
              {promises.map((promise) => (
                <li
                  key={promise.text}
                  className="mb-3 flex items-center gap-2.5 text-[9px] text-[#bdc8ca] last:mb-0 lg:mb-[15px]"
                >
                  <promise.icon className="size-4 shrink-0" />
                  {promise.text}
                </li>
              ))}

              {contact.email ? (
                <li className="mt-3 flex items-center gap-2.5 text-[9px] lg:mt-[15px]">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-[#bdc8ca] underline underline-offset-[3px] hover:text-white"
                  >
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li className="mt-2 flex items-center gap-2.5 text-[9px]">
                  <a
                    href={`tel:${contact.phone.replace(/\s/g, '')}`}
                    className="text-[#bdc8ca] underline underline-offset-[3px] hover:text-white"
                  >
                    {contact.phone}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        {/* .footer-bottom : identité à gauche, mention de démonstration à droite. */}
        <div className="mt-[17px] block gap-5 text-[7px] leading-[1.8] text-[#84949b] lg:mt-5 lg:flex lg:justify-between lg:text-[8px] lg:leading-normal">
          <span className="block">
            © {year} {identity.name}
            {hasLegalIdentity ? ` · ${legal.companyName}` : null}
            {legal.siret ? ` · SIRET ${legal.siret}` : null}
          </span>

          {siteConfig.demoBanner ? (
            <span className="block">
              {siteConfig.demoBannerLabel} — visuels et caractéristiques à remplacer avant
              ouverture.
            </span>
          ) : null}
        </div>

        {/*
          .footer-asterisk — appelée par l'astérisque du bandeau de repères.
          Elle empêche « Branchement sans modifier le câblage » d'être lu comme
          une promesse valable pour tous les véhicules.
        */}
        <p className="mt-3 text-[6px] leading-[1.7] text-[#647c86] lg:text-[7px]">
          * Selon le kit et le véhicule. Accessoires et contraintes de montage à vérifier sur la
          fiche produit.
        </p>

        {/*
          Mention destinée au visiteur, pas à l'exploitant : elle dit ce qui
          manque, sans nommer le fichier où le renseigner. La marche à suivre
          est dans docs/render.md et dans l'écran « État de l'installation ».
          Elle reste affichée — taire l'absence de mentions légales sur un site
          qui prend des commandes serait pire que l'avouer.
        */}
        {!hasLegalIdentity ? (
          <p className="mt-3 rounded-sm border border-ink-line px-3 py-2 text-[9px] text-white/45">
            Les mentions légales de ce site ne sont pas encore publiées. Cette boutique n&apos;est
            pas ouverte à la vente.
          </p>
        ) : null}
      </div>
    </footer>
  )
}
