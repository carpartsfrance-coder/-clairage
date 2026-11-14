import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BarreDeNavigation } from '@/components/layout/BarreDeNavigation'
import { Mesure } from '@/components/mesure/Mesure'
import { identity, siteConfig } from '@/lib/identity'

/*
  Pré-rendu partiel : cette page n'est pas encore reprise. `instant = false`
  la dispense de la vérification ; elle se comporte exactement comme avant.
  Retirer cette ligne, c'est la faire entrer dans le nouveau modèle — voir le
  commentaire de `cacheComponents` dans next.config.ts.
*/
export const instant = false

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Le back-office a sa propre mise en page : poser l'en-tête et le pied de
  // page de la boutique par-dessus un outil de travail encombre l'écran et
  // ajoute une vingtaine de liens inutiles à la navigation au clavier.
  const pathname = (await headers()).get('x-pathname') ?? ''
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')

  return (
    <html lang={identity.locale.lang} className={`${inter.variable} ${montserrat.variable}`}>
      <body className="flex min-h-dvh flex-col">
        {isAdmin ? (
          children
        ) : (
          <>
            {/* Retour visuel immédiat au clic sur un lien (voir le composant). */}
            <Suspense fallback={null}>
              <BarreDeNavigation />
            </Suspense>
            <a href="#contenu" className="skip-link">
              Aller au contenu
            </a>
            <Header />
            <main id="contenu" className="flex-1">
              {children}
            </main>
            <Footer />
            <Suspense fallback={null}>
              <Mesure />
            </Suspense>
          </>
        )}
      </body>
    </html>
  )
}
