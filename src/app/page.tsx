import type { Metadata } from 'next'
import {
  getFeaturedProducts,
  getRubriquesVitrine,
  getHomeBlocks,
  getHomeFaq,
  getUniverses,
} from '@/lib/queries/home'
import { getSelectedVehicle } from '@/lib/session'
import { getNavigation } from '@/lib/queries/navigation'
import { getSeuilLivraisonOfferte } from '@/lib/shipping'
import { faqGeneraleParDefaut } from '@/lib/faq-generale'
import { dureeGarantie, formatPrice } from '@/lib/identity'
import { HeroFinder } from '@/components/home/HeroFinder'
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
  const [blocks, universes, products, faqPubliee, rubriques, navigation, seuil, faqParDefaut, vehicle] = await Promise.all([
    getHomeBlocks(),
    getUniverses(6),
    getFeaturedProducts(4),
    getHomeFaq(4),
    getRubriquesVitrine(),
    // Sert seulement à savoir si le parcours moto existe : le menu ne
    // l'affiche que si une marque moto mène à des produits.
    getNavigation(),
    getSeuilLivraisonOfferte(),
    faqGeneraleParDefaut(),
    // Le bandeau de sélection s'ouvre sur le véhicule déjà retenu plutôt que
    // de redemander ce que l'en-tête affiche.
    getSelectedVehicle(),
  ])

  /*
    Les repères sous le bandeau d'accueil : la compatibilité d'abord, puis les
    deux arguments qui décident un premier achat — la garantie et la livraison
    offerte — tirés de la configuration, jamais écrits en dur.
  */
  const [premier, ...autres] = blocks.reassurance
  const reperes = [
    ...(premier ? [premier] : []),
    ...(dureeGarantie()
      ? [{ icon: 'shield', title: `Garantie ${dureeGarantie()}`, text: 'Sur toutes nos ampoules et LED' }]
      : []),
    ...(seuil
      ? [{ icon: 'truck', title: `Livraison offerte dès ${formatPrice(seuil)}`, text: 'En France métropolitaine' }]
      : []),
    ...autres.filter((item) => item.icon !== 'headset'),
  ].slice(0, 4)

  // Questions publiées en back-office, sinon les quatre premières par défaut.
  const faq = faqPubliee.length > 0 ? faqPubliee : faqParDefaut.slice(0, 4)

  return (
    <>
      {/* Rendu seulement si l'identité légale est renseignée : voir
          StructuredData.tsx. */}
      <OrganizationStructuredData />

      {/*
        Le bandeau et le sélecteur n'en font plus qu'un bloc : la promesse à
        droite, l'action à gauche, dans le premier écran. Ils se suivaient, ce
        qui obligeait à descendre pour agir.
      */}
      <HeroFinder
        hero={blocks.hero}
        /*
          « Je connais ma référence d'ampoule » menait à une recherche vide :
          les packs se choisissent par véhicule et n'affichent pas de
          référence. Le raccourci mène à la même recherche, qui trouve un
          véhicule tapé en toutes lettres.
        */
        finder={{ ...blocks.vehicleBand, shortcutLabel: 'Ou tapez votre véhicule : « clio 4 veilleuses »' }}
        vehicle={vehicle}
      />
      <ReassuranceBand items={reperes} />
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
          ...rubriques.slice(0, 4).map((rubrique) => ({
            label: rubrique.label,
            href: `/c/${rubrique.slug}`,
          })),
        ]}
      />
      <MethodSection content={blocks.method} />
      {/* Pas de mise en avant moto tant qu'aucun pack moto n'est en ligne :
          son bouton menait à « Aucune marque moto n'est encore référencée ». */}
      {navigation.some((section) => section.key === 'packs-moto') ? (
        <MotoSection
          content={{
            ...blocks.moto,
            // La rubrique « Moto & scooter » est vide : les packs moto se
            // trouvent par marque et modèle, comme ceux des voitures.
            ctaHref: blocks.moto.ctaHref === '/c/moto' ? '/packs/moto' : blocks.moto.ctaHref,
          }}
        />
      ) : null}
      <FaqHelpSection faq={faq} help={blocks.help} />
    </>
  )
}
