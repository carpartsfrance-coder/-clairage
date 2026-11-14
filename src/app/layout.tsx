import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { identity, siteConfig } from '@/lib/identity'

/**
 * Mise en page racine — volontairement réduite à la coquille du document.
 *
 * Elle ne contient plus que ce qui est vrai partout : la langue, les polices,
 * la feuille de style et les balises de tête. **Aucune lecture de la requête**,
 * donc aucune raison d'empêcher une page d'être pré-rendue.
 *
 * Avant, c'est ici que se posaient l'en-tête et le pied de page de la
 * boutique, et il fallait lire l'en-tête `x-pathname` pour savoir s'il fallait
 * s'abstenir sur le back-office. Cette seule lecture rendait **toutes** les
 * pages du site dynamiques : plus rien ne pouvait être mis en cache, et les
 * 31 000 fiches étaient recalculées à chaque passage de Googlebot.
 *
 * Le décor de la boutique vit désormais dans `(boutique)/layout.tsx`, un
 * groupe de routes qui ne change aucune URL ; le back-office garde le sien
 * dans `admin/layout.tsx`. Personne n'a plus besoin de savoir où il se trouve.
 */

/**
 * Les deux polices sont téléchargées à la construction et servies depuis le
 * domaine : aucune requête vers un CDN tiers au moment du rendu, et rien à
 * déclarer côté consentement pour les polices.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--font-wordmark-src',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.defaultMetaTitle,
    template: `%s — ${identity.name}`,
  },
  description: siteConfig.defaultMetaDescription,
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: identity.name,
  },
  // Tant que la boutique n'est pas ouverte, rien n'est proposé à l'indexation.
  robots: siteConfig.demoBanner ? { index: false, follow: false } : undefined,
  // Preuve de propriété du site pour Google (Merchant Center, Search Console) :
  // le code donné par Google, mis dans GOOGLE_SITE_VERIFICATION sur Render.
  // Ce code est public par nature (il est lu dans la page) : ce n'est pas un secret.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#212428',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={identity.locale.lang} className={`${inter.variable} ${montserrat.variable}`}>
      {/*
        `flex min-h-dvh flex-col` reste ici : la boutique s'en sert pour coller
        le pied de page en bas, le back-office pour occuper la hauteur.
      */}
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  )
}
