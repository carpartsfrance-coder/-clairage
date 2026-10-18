import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { footerNav } from '@/lib/navigation'
import { commercialTerms, formatPrice, identity, siteConfig } from '@/lib/identity'

/**
 * Pied de page. Les mentions légales affichées dépendent de ce qui est
 * réellement renseigné dans `identity.legal` : tant qu'une information
 * manque, la ligne correspondante n'est pas rendue — on ne comble pas un
 * champ d'identité par une formule générique.
 */
export function Footer() {
  const { legal, contact } = identity
  const hasLegalIdentity = Boolean(legal.companyName)
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-line bg-ink text-white">
      <div className="container-page py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
          <div>
            <Logo tone="dark" />
            <p className="mt-4 max-w-xs text-sm text-white/65">{identity.tagline}</p>

            <ul className="mt-5 space-y-1.5 text-sm text-white/65">
              {commercialTerms.freeShippingThresholdCents ? (
                <li>
                  Livraison offerte dès{' '}
                  {formatPrice(commercialTerms.freeShippingThresholdCents)}
                </li>
              ) : null}
              {commercialTerms.returnWindowDays ? (
                <li>Retours sous {commercialTerms.returnWindowDays} jours</li>
              ) : null}
              {contact.email ? (
                <li>
                  <a href={`mailto:${contact.email}`} className="underline underline-offset-4">
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="underline underline-offset-4">
                    {contact.phone}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          {footerNav.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-white/65 transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ink-line pt-6 text-xs text-white/50 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {identity.name}
            {hasLegalIdentity ? ` · ${legal.companyName}` : null}
            {legal.siret ? ` · SIRET ${legal.siret}` : null}
          </p>

          {siteConfig.demoBanner ? (
            <p className="text-white/45">
              {siteConfig.demoBannerLabel} — visuels et caractéristiques à remplacer avant
              ouverture.
            </p>
          ) : null}
        </div>

        {/*
          Mention destinée au visiteur, pas à l'exploitant : elle dit ce qui
          manque, sans nommer le fichier où le renseigner. La marche à suivre
          est dans docs/render.md et dans l'écran « État de l'installation ».
          Elle reste affichée — taire l'absence de mentions légales sur un site
          qui prend des commandes serait pire que l'avouer.
        */}
        {!hasLegalIdentity ? (
          <p className="mt-4 rounded-sm border border-ink-line px-3 py-2 text-xs text-white/45">
            Les mentions légales de ce site ne sont pas encore publiées. Cette boutique n&apos;est
            pas ouverte à la vente.
          </p>
        ) : null}
      </div>
    </footer>
  )
}
