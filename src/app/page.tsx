import type { Metadata } from 'next'
import { getFeaturedProducts, getHomeBlocks, getHomeFaq, getUniverses } from '@/lib/queries/home'
import { HeroSection } from '@/components/home/HeroSection'
import { VehicleBand } from '@/components/home/VehicleBand'
import { ReassuranceBand } from '@/components/home/ReassuranceBand'
import { UniversesSection } from '@/components/home/UniversesSection'
import { ComparisonSection } from '@/components/home/ComparisonSection'
import { FeaturedProducts } from '@/components/home/FeaturedProducts'
import { MethodSection } from '@/components/home/MethodSection'
import { MotoSection } from '@/components/home/MotoSection'
import { FaqHelpSection } from '@/components/home/FaqHelpSection'

export const metadata: Metadata = {
  title: 'Éclairage LED auto & moto',
  alternates: { canonical: '/' },
}

/**
 * Page d'accueil.
 *
 * L'ordre des blocs est celui du cahier des charges : visuel et promesse,
 * sélecteur de véhicule, réassurance, univers, comparatif, produits, méthode,
 * moto, aide. Chaque section reçoit ses données en props ; la page est le seul
 * endroit qui parle à la base, ce qui permet de rejouer n'importe quelle
 * section isolément.
 */
export default async function HomePage() {
  const [blocks, universes, products, faq] = await Promise.all([
    getHomeBlocks(),
    getUniverses(6),
    getFeaturedProducts(4),
    getHomeFaq(4),
  ])

  return (
    <>
      <HeroSection content={blocks.hero} />
      <VehicleBand content={blocks.vehicleBand} />
      <ReassuranceBand items={blocks.reassurance} />
      <UniversesSection content={blocks.universes} universes={universes} />
      <ComparisonSection content={blocks.comparison} />
      <FeaturedProducts
        content={blocks.products}
        products={products}
        filters={[
          { label: 'Tout découvrir', href: '/c' },
          { label: 'Phares LED', href: '/c/phares-led' },
          { label: 'Intérieur', href: '/c/interieur' },
          { label: 'Plaque & recul', href: '/c/plaque-recul' },
          { label: 'Xénon', href: '/c/xenon' },
        ]}
      />
      <MethodSection content={blocks.method} />
      <MotoSection content={blocks.moto} />
      <FaqHelpSection faq={faq} help={blocks.help} />
    </>
  )
}
