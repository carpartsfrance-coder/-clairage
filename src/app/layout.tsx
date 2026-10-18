import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { identity, siteConfig } from '@/lib/identity'

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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#212428',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={identity.locale.lang} className={`${inter.variable} ${montserrat.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>
        <Header />
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
