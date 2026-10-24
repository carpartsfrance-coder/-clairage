import type { Metadata } from 'next'
import {
  VITRINE_RUBRIQUES,
  getFeaturedProducts,
  getHomeBlocks,
  getHomeFaq,
  getUniverses,
} from '@/lib/queries/home'
import { getSelectedVehicle } from '@/lib/session'
import { HeroSection } from '@/components/home/HeroSection'
import { VehicleBand } from '@/components/home/VehicleBand'
import { ReassuranceBand } from '@/components/home/ReassuranceBand'
import { UniversesSection } from '@/components/home/UniversesSection'
import { ComparisonSection } from '@/components/home/ComparisonSection'
import { FeaturedProducts } from '@/components/home/FeaturedProducts'
import { MethodSection } from '@/components/home/MethodSection'
import { MotoSection } from '@/components/home/MotoSection'
import { FaqHelpSection } from '@/components/home/FaqHelpSection'
import { OrganizationStructuredData } from '@/components/seo/StructuredData'

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
  const [blocks, universes, products, faq, vehicle] = await Promise.all([
    getHomeBlocks(),
    getUniverses(6),
    getFeaturedProducts(4),
    getHomeFaq(4),
    // Le bandeau de sélection s'ouvre sur le véhicule déjà retenu plutôt que
    // de redemander ce que l'en-tête affiche.
    getSelectedVehicle(),
  ])

  return (
    <>
      {/* Rendu seulement si l'identité légale est renseignée : voir
          StructuredData.tsx. */}
      <OrganizationStructuredData />

      <HeroSection content={blocks.hero} />
      <VehicleBand content={blocks.vehicleBand} vehicle={vehicle} />
      <ReassuranceBand items={blocks.reassurance} />
      <UniversesSection content={blocks.universes} universes={universes} />
      <ComparisonSection content={blocks.comparison} />
      <FeaturedProducts
        content={blocks.products}
        products={products}
        shortcut={{ label: 'Trouver pour mon véhicule', href: '#choisir-mon-vehicule' }}
        /* Les rubriques viennent de la requête qui alimente la vitrine : les
           raccourcis affichés et les familles où le repli va puiser sont donc
           forcément les mêmes. */
        filters={[
          { label: 'Tout découvrir', href: '/c' },
          ...VITRINE_RUBRIQUES.map((rubrique) => ({
            label: rubrique.label,
            href: `/c/${rubrique.slug}`,
          })),
        ]}
      />
      <MethodSection content={blocks.method} />
      <MotoSection content={blocks.moto} />
      <FaqHelpSection faq={faq} help={blocks.help} />
    </>
  )
}
