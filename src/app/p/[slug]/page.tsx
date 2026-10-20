import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/queries/product'
import { getSelectedVehicle } from '@/lib/session'
import { getShippingOffers } from '@/lib/shipping'
import { commercialTerms, siteConfig } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import {
  BreadcrumbStructuredData,
  FaqStructuredData,
  ProductStructuredData,
} from '@/components/seo/StructuredData'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ProductTitle } from '@/components/product/ProductTitle'
import { BuyBox } from '@/components/product/BuyBox'
import { ConfigurationContents } from '@/components/product/ConfigurationContents'
import { KitContents } from '@/components/product/KitContents'
import { OptionalAddons } from '@/components/product/OptionalAddons'
import { ProductConfigurationProvider } from '@/components/product/ProductConfiguration'
import { SectionNav } from '@/components/product/SectionNav'
import { Prose } from '@/components/ui/Prose'
import { ToneComparison } from '@/components/product/ToneComparison'
import { Card, EmptyState } from '@/components/ui/Surface'
import { ButtonLink } from '@/components/ui/Button'
import { IconCar, IconHeadset, IconShield, IconWrench } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Fiche produit — `reference-site/product.html` du dossier de référence.
 *
 * L'ordre des sections est celui de la référence : contexte véhicule, galerie
 * et achat, réassurance, ancres, comparaison, contenu du kit, installation,
 * compléments, questions, assistance. Les valeurs de `styles.css` sont
 * reprises telles quelles — la bascule en colonne unique se fait à 800 px
 * (préfixe `fiche:`), pas au `lg` de Tailwind.
 *
 * Deux choses traversent toute la page :
 *
 * - **Le véhicule sélectionné** décide du conditionnement recommandé, du
 *   statut de compatibilité et des accessoires à proposer. Sans lui, la fiche
 *   reste complète mais ne conclut rien.
 * - **Le conditionnement choisi** est partagé par le bloc d'achat, le contenu
 *   du kit, la section Installation et la barre fixe. Sans ce partage, les
 *   sections décrivaient des conditionnements différents sur la même page.
 *
 * Les onglets sont des ancres plutôt qu'un composant à état : la navigation au
 * clavier fonctionne sans script, les sections restent lisibles si le
 * JavaScript échoue, et « Voir le contenu » devient un lien qui marche.
 */

type PageProps = { params: Promise<{ slug: string }> }

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: 'Niveau accessible',
  MEDIUM: 'Niveau intermédiaire',
  HARD: 'Niveau confirmé',
}

/** Nombre de barres allumées dans la pastille de niveau. */
const DIFFICULTY_BARS: Record<string, number> = { EASY: 1, MEDIUM: 2, HARD: 3 }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return { title: 'Produit introuvable' }

  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.tagline ?? undefined,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: {
      title: product.metaTitle ?? product.name,
      description: product.metaDescription ?? product.tagline ?? undefined,
      images: product.gallery[0] ? [product.gallery[0].url] : undefined,
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const vehicle = await getSelectedVehicle()
  const product = await getProduct(slug, vehicle?.configurationId ?? null)

  if (!product) notFound()

  const shippingOffers = await getShippingOffers()

  const kitVariant = product.variants.find((variant) => variant.components.length > 0)
  const position = product.variants.find((variant) => variant.fitment.positionLabel)?.fitment
    .positionLabel

  const eyebrow = [product.category?.name, position].filter(
    (partie): partie is string => Boolean(partie),
  )

  /*
    Pastille posée sur le visuel.

    Elle reprenait mot pour mot la seconde ligne du titre — « Blanc pur
    6 000 K » — et sur mobile les deux se suivaient à quelques pixels. Le titre
    porte seul la température de couleur ; la pastille ne sert plus qu'au
    culot, qui n'est écrit nulle part ailleurs à cet endroit. Elle disparaît
    donc complètement sur un produit sans culot.
  */

  // Même liste pour le fil d'Ariane affiché et pour son balisage : deux
  // sources finiraient par diverger, et c'est le balisage qu'on ne relit pas.
  const breadcrumbItems = [
    { label: 'Accueil', href: '/' },
    { label: 'Catégories', href: '/c' },
    ...(product.category
      ? [{ label: product.category.name, href: `/c/${product.category.slug}` }]
      : []),
    { label: product.name },
  ]

  // Le visuel de la comparaison est celui que le catalogue désigne comme le
  // rendu. Aucun rendu enregistré, aucune section : on ne fabrique pas un
  // avant/après avec la photo du produit.
  const rendu = product.gallery.find((item) => item.role === 'RESULT')
  const visuelKit = product.gallery.find((item) => item.role === 'KIT_CONTENT') ?? product.gallery[0]

  /*
    Une section ne s'affiche que si elle a quelque chose à dire, et son ancre
    disparaît avec elle.

    La fiche montrait « Aucun guide de montage n'est encore publié » et
    « Aucun avis pour le moment » sous deux onglets qui promettaient du
    contenu : trois clics pour apprendre qu'il n'y a rien. Rien n'est inventé
    pour les remplir — elles s'effacent, et l'assistance reste joignable en bas
    de page comme dans le bloc d'achat.
  */
  const aContenuKit = Boolean(kitVariant) || product.specs.length > 0
  const aContenuMontage = product.guides.length > 0 || product.difficulty !== 'UNKNOWN'
  const aContenuQuestions = product.faq.length > 0 || product.reviews.length > 0

  /*
    Le rédactionnel long existait en base sans être rendu nulle part : les
    fiches portaient leur description et n'en montraient rien. Une section lui
    est donc rendue, et elle n'apparaît que s'il y a du texte.
  */
  const aDescription = (product.body ?? '').trim().length > 0

  /*
    L'ordre est celui de la V2, et il suit la décision d'achat : ce qu'on
    reçoit, puis ce que ça change, puis ce que ça suppose, puis comment on le
    monte. Le rédactionnel long n'a pas de section dans la maquette ; il reste
    avec les caractéristiques, dont il est le développement, plutôt que
    d'ouvrir la page sur un pavé de texte.
  */
  const sections = [
    ...(aContenuKit
      ? [{ href: '#dans-votre-kit', label: kitVariant ? 'Dans votre pack' : 'Caractéristiques' }]
      : []),
    ...(rendu ? [{ href: '#rendu', label: 'Le rendu' }] : []),
    ...(aDescription ? [{ href: '#description', label: 'La référence' }] : []),
    ...(aContenuMontage ? [{ href: '#montage', label: 'Installation' }] : []),
    ...(aContenuQuestions ? [{ href: '#questions', label: 'Vos questions' }] : []),
  ]

  const barres = DIFFICULTY_BARS[product.difficulty] ?? 0

  return (
    <ProductConfigurationProvider
      variants={product.variants}
      recommendedVariantId={product.recommendedVariantId}
    >
      {/*
        La barre d'achat fixe occupe le bas de l'écran : on lui réserve sa
        hauteur, plus la zone de sécurité des téléphones à encoche, pour
        qu'elle ne recouvre jamais la fin de la page.
      */}
      <div className="pb-[calc(77px+env(safe-area-inset-bottom))] fiche:pb-[78px]">
        {/* Données structurées : voir StructuredData.tsx — rien n'y est émis en
            préproduction, et rien n'y est affirmé qui ne soit en base. */}
        <ProductStructuredData product={product} />
        <BreadcrumbStructuredData items={breadcrumbItems} />
        <FaqStructuredData items={product.faq} />

        <div className="container-page">
          <Breadcrumb items={breadcrumbItems} />

          {/*
            Masqué sous le basculement : le header mobile porte déjà un bandeau
            véhicule, et le bloc d'achat nomme le véhicule ET dit ce qu'il
            implique pour cette référence. Trois rappels empilés sur un écran de
            téléphone, c'est deux de trop — la référence, elle, n'a pas de
            bandeau véhicule dans son header.
          */}
          <VehicleBar vehicle={vehicle} className="mb-[27px] max-fiche:hidden" />

          {/*
            .hero — galerie à gauche (1.13fr), titre et achat à droite (1fr),
            58 px d'écart. Sous 800 px la référence passe en colonne unique avec
            `display:contents` : le titre vient AVANT la galerie, puis le bloc
            d'achat. Même résultat ici par placement explicite en grille.
          */}
          <section
            aria-label={product.name}
            className="flex flex-col pt-[6px] pb-[27px] fiche:grid fiche:grid-cols-[minmax(0,1.07fr)_minmax(0,1fr)] fiche:items-start fiche:gap-x-[36px] fiche:pt-[9px] fiche:pb-10 min-[1101px]:gap-x-[62px] min-[1450px]:gap-x-[74px]"
          >
            {/* .gallery */}
            <div className="order-2 mt-1 fiche:order-none fiche:mt-0">
              <ProductGallery items={product.gallery} productName={product.name} />
            </div>

            {/*
              .purchase — un seul enfant de grille sur grand écran, pour que le
              titre et le bloc d'achat se suivent sans l'écart de 58 px de la
              grille. Sous le basculement, `display:contents` le dissout : ses
              deux enfants redeviennent des éléments de la colonne, et leur
              ordre place le titre avant la galerie, comme dans la référence.
            */}
            <div className="contents fiche:block">
            {/*
              .product-title-block — la V2 remonte la température de couleur du
              titre vers la ligne de caractéristiques, où elle voisine le
              conditionnement et la présence des accessoires. Le titre reprend
              le nom tel qu'il est au catalogue : le découper en deux lignes
              comme la maquette supposerait d'y deviner une césure, et un nom
              de produit n'en porte pas.
            */}
            <ProductTitle
              eyebrow={eyebrow}
              name={product.name}
              secondLine={
                product.colorTemperature
                  ? `Blanc ${product.colorTemperature.toLocaleString('fr-FR')} K`
                  : null
              }
              tagline={product.tagline}
            />

            {/* .buybox */}
            <div className="order-3 mt-6 fiche:mt-0">
              <BuyBox
                productName={product.name}
                thumbnail={
                  product.gallery[0]
                    ? { url: product.gallery[0].url, alt: product.gallery[0].alt }
                    : null
                }
                variants={product.variants}
                recommendedVariantId={product.recommendedVariantId}
                vehicleLabel={vehicle?.label ?? null}
                shippingOffers={shippingOffers}
                returnWindowDays={commercialTerms.returnWindowDays}
              />
            </div>
            </div>
          </section>
        </div>

        {/* ---------------- .assurance-strip ---------------- */}
        <section
          aria-label="Nos engagements"
          className="border-t border-[#edf0e7] border-b-[#e9eee0] bg-[#f6f7f3]"
        >
          <div className="container-page grid gap-[17px] py-[21px] fiche:flex fiche:min-h-[87px] fiche:items-center fiche:justify-between fiche:gap-5 fiche:py-0 min-[1101px]:gap-[25px]">
            {[
              {
                Icon: IconCar,
                title: 'Pensé pour votre véhicule',
                text: 'La compatibilité est indiquée par emplacement, avec sa source.',
              },
              {
                Icon: IconWrench,
                title: 'Sans modifier le câblage',
                text: "Quand le montage l'exige, les adaptateurs sont signalés.",
              },
              {
                Icon: IconShield,
                title: 'Accompagné de A à Z',
                text: 'Du choix du kit à son installation.',
              },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="flex items-center gap-3 min-[1101px]:gap-3.5">
                <Icon
                  className="size-[23px] shrink-0 text-[#647951] min-[1101px]:size-[25px]"
                  strokeWidth={1.3}
                />
                <span className="min-w-0">
                  <strong className="block text-[11px] font-semibold min-[1450px]:text-[12px]">
                    {title}
                  </strong>
                  <small className="mt-[2px] block text-[10px] text-[#8a957e] fiche:mt-[3px] min-[1101px]:text-[9px] min-[1281px]:text-[10px] min-[1450px]:text-[11px] min-[1450px]:text-[#7c8c6c]">
                    {text}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- .section-nav ---------------- */}
        {sections.length > 0 ? <SectionNav items={sections} /> : null}

        {/* ---------------- #dans-votre-kit ---------------- */}
        {aContenuKit ? (
        <>
        {/*
          La référence nomme cette section `#contenu`. Cet identifiant est déjà
          pris ici : le lien d'évitement du gabarit pointe sur `<main
          id="contenu">`. Deux éléments portaient donc le même identifiant, et
          « Voir le contenu » comme l'onglet renvoyaient en haut de page au lieu
          de la section. D'où ce nom distinct.
        */}
        <section
          id="dans-votre-kit"
          aria-labelledby="titre-contenu"
          className="container-page scroll-mt-32 py-[38px] fiche:pt-[61px] fiche:pb-[59px]"
        >
          {/* .section-heading : titre à gauche, précision à droite. */}
          <div className="mb-[22px] block justify-between fiche:mb-[30px] fiche:flex fiche:items-end">
            <div>
              <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-brand uppercase fiche:text-[9px] fiche:tracking-[1.6px]">
                Tout est prévu
              </p>
              <h2
                id="titre-contenu"
                className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]"
              >
                {kitVariant ? 'Ouvrez. Installez. Profitez.' : 'Caractéristiques'}
              </h2>
            </div>
            <p className="mt-[11px] text-[10px] leading-[1.7] text-[#858580] fiche:mt-0 fiche:text-right fiche:text-[11px]">
              Ce que réunit le conditionnement
              <span className="hidden fiche:inline">
                <br />
              </span>{' '}
              retenu dans le bloc d&apos;achat.
            </p>
          </div>

          <KitContents
            image={visuelKit?.url ?? null}
            imageAlt={visuelKit?.alt ?? `${product.name} — contenu`}
          />

          {product.specs.length > 0 ? (
            <div className={cn(kitVariant && 'mt-10')}>
              <h3 className="text-[12px] font-bold">Caractéristiques</h3>
              <dl className="mt-3 grid gap-x-12 border-t border-line fiche:grid-cols-2">
                {product.specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex gap-4 border-b border-line py-2.5 text-[11px]"
                  >
                    <dt className="w-40 shrink-0 text-[#85857e]">{spec.label}</dt>
                    <dd className="font-semibold">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
        </>
        ) : null}

        {/* ---------------- #rendu ---------------- */}
        {rendu ? (
          <ToneComparison
            title={'Votre voiture.\nUn autre regard.'}
            subtitle={product.description}
            image={rendu.url}
            imageAlt={rendu.alt}
          />
        ) : null}

        {/* ---------------- #description ---------------- */}
        {aDescription ? (
          <section
            id="description"
            aria-labelledby="titre-description"
            className="container-page scroll-mt-32 py-[38px] fiche:pt-[61px] fiche:pb-[59px]"
          >
            <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-brand uppercase fiche:text-[9px] fiche:tracking-[1.6px]">
              La référence
            </p>
            <h2
              id="titre-description"
              className="mb-[22px] text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:mb-[25px] fiche:text-[29px] fiche:tracking-[-1px]"
            >
              {product.name}
            </h2>
            <Prose className="max-w-[680px]">{product.body ?? ''}</Prose>
          </section>
        ) : null}

        {/* ---------------- #montage ---------------- */}
        {aContenuMontage ? (
        <section
          id="montage"
          aria-labelledby="titre-montage"
          className="scroll-mt-32 border-y border-[#eeeee9] bg-surface-paper py-[35px] fiche:py-[50px]"
        >
          {/* .install-layout : texte à gauche (.85fr), étapes à droite. */}
          <div className="container-page block fiche:grid fiche:grid-cols-[0.85fr_1.15fr] fiche:items-center fiche:gap-[40px] min-[1101px]:gap-[76px]">
            <div>
              <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-brand uppercase fiche:text-[9px] fiche:tracking-[1.6px]">
                Du choix au premier allumage
              </p>
              <h2
                id="titre-montage"
                className="mb-4 text-[28px] leading-[1.12] font-bold tracking-[-0.9px] fiche:text-[32px]"
              >
                Le montage,
                <br />
                bien accompagné.
              </h2>
              <p className="max-w-full text-[11px] leading-[1.8] text-[#787a73] fiche:max-w-[310px]">
                Retrouvez les étapes et les points à vérifier avant de commencer.
              </p>

              {/* .level-pill : le niveau réellement enregistré, ou son absence. */}
              <p className="mt-3.5 flex items-center gap-2 text-[9px] text-[#62655f] fiche:mt-[18px]">
                <span aria-hidden="true" className="flex items-end gap-0.5">
                  {[6, 9, 12].map((hauteur, index) => (
                    <i
                      key={hauteur}
                      style={{ height: `${hauteur}px` }}
                      className={cn(
                        'block w-1 rounded-[1px]',
                        index < barres ? 'bg-[#363e34]' : 'bg-[#d5d7d0]',
                      )}
                    />
                  ))}
                </span>
                {DIFFICULTY_LABELS[product.difficulty] ??
                  'Difficulté de montage non évaluée pour cette référence'}
              </p>

              {/* Le bouton ne s'affiche que s'il mène quelque part : sans
                  guide publié, il ouvrait une page vide. */}
              {product.guides.length > 0 ? (
                <ButtonLink
                  href="/guides"
                  variant="secondary"
                  className="mt-4 min-h-[42px] gap-4 rounded-md px-[17px] text-[11px] fiche:mt-5"
                >
                  Découvrir les guides
                </ButtonLink>
              ) : null}
            </div>

            <div className="mt-[30px] fiche:mt-0">
              {product.guides.length > 0 ? (
                <ol>
                  {product.guides.map((guide, index) => (
                    /* .step : pastille numérotée, filet de liaison, intitulé. */
                    <li key={guide.slug} className="relative flex gap-[17px] pb-[23px] fiche:pb-[26px]">
                      {index < product.guides.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-8 bottom-0 left-[15px] w-px bg-[#d9dcd3]"
                        />
                      ) : null}
                      <span className="relative grid size-[31px] shrink-0 place-items-center rounded-full border border-[#c9ccc1] bg-surface-paper text-[11px]">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="mt-[3px] mb-[5px] text-[12px] font-bold">
                          <Link
                            href={`/guides/${guide.slug}`}
                            className="underline-offset-[3px] hover:underline"
                          >
                            {guide.title}
                          </Link>
                        </h3>
                        <p className="max-w-[360px] text-[10px] text-[#7e8078]">
                          {guide.durationMinutes
                            ? `Environ ${guide.durationMinutes} minutes.`
                            : 'Durée non indiquée.'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}

              {/*
                Contenu et restrictions du conditionnement CHOISI : ce que le
                conditionnement retenu n'apporte PAS, et qui manquerait au
                moment du montage.
              */}
              <ConfigurationContents />

              {/* .help-inline */}
              <Link
                href="/contact"
                className="mt-4 flex w-full items-center gap-3 rounded-[7px] border border-[#e5e6df] bg-white px-3 py-3.5 text-[10px] text-[#777b70] hover:border-slate-ink fiche:px-4"
              >
                <IconHeadset className="size-[19px] shrink-0 text-[#383e34]" />
                <span>
                  Un doute à une étape ?
                  <strong className="ml-0 block font-semibold text-[#30382c] fiche:ml-[3px] fiche:inline">
                    Demandez-nous conseil ↗
                  </strong>
                </span>
              </Link>
            </div>
          </div>
        </section>
        ) : null}

        {/* ---------------- #complements ---------------- */}
        {product.optionalAddons.length > 0 ? (
          <section
            id="complements"
            aria-labelledby="titre-complements"
            className="container-page scroll-mt-32 py-[38px] fiche:pt-[61px] fiche:pb-[59px]"
          >
            <div className="mb-[22px] block justify-between fiche:mb-[30px] fiche:flex fiche:items-end">
              <div>
                <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-brand uppercase fiche:text-[9px] fiche:tracking-[1.6px]">
                  Pour aller plus loin
                </p>
                <h2
                  id="titre-complements"
                  className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]"
                >
                  Le blanc, jusque dans les détails.
                </h2>
              </div>
              <p className="mt-[11px] text-[10px] leading-[1.7] text-[#858580] fiche:mt-0 fiche:text-right fiche:text-[11px]">
                Des compléments facultatifs.
                <span className="hidden fiche:inline">
                  <br />
                </span>{' '}
                Votre kit principal reste complet.
              </p>
            </div>

            <OptionalAddons
              addons={product.optionalAddons}
              vehicleSelected={Boolean(vehicle)}
            />

            <p className="mt-3 text-[8px] leading-[1.7] text-[#999b92]">
              Les adaptateurs et décodeurs exigés par votre kit ne sont pas ici : ils figurent dans
              le bloc d&apos;achat, avec le conditionnement qui les contient.
            </p>
          </section>
        ) : null}

        {/* ---------------- #questions ---------------- */}
        {aContenuQuestions ? (
        <section
          id="questions"
          aria-labelledby="titre-questions"
          className="container-page block scroll-mt-32 pb-[35px] fiche:grid fiche:grid-cols-[0.72fr_1.28fr] fiche:gap-[40px] fiche:pt-2.5 fiche:pb-[63px] min-[1101px]:gap-[70px]"
        >
          <div>
            <p className="mb-2.5 text-[8px] font-bold tracking-[1.2px] text-brand uppercase fiche:text-[9px] fiche:tracking-[1.6px]">
              On vous répond
            </p>
            <h2
              id="titre-questions"
              className="text-[28px] leading-[1.12] font-bold tracking-[-0.9px] fiche:text-[33px] fiche:tracking-[-1px]"
            >
              Avant de
              <span className="hidden fiche:inline">
                <br />
              </span>{' '}
              passer au blanc.
            </h2>
            <p className="mt-3 mb-[23px] text-[10px] leading-[1.9] text-[#81847c] fiche:mt-5 fiche:mb-0 fiche:text-[11px]">
              Encore une question ?
              <Link
                href="/contact"
                className="ml-[5px] inline-flex min-h-11 items-center text-[10px] font-bold text-ink hover:underline fiche:ml-0 fiche:mt-1.5 fiche:flex fiche:min-h-0 fiche:text-[11px]"
              >
                Parlons de votre véhicule ↗
              </Link>
            </p>
          </div>

          <div>
            {product.faq.length > 0 ? (
              <ul className="border-t border-line">
                {product.faq.map((item) => (
                  <li key={item.question} className="border-b border-line py-4">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 text-[11px] font-semibold [&::-webkit-details-marker]:hidden fiche:gap-[15px] fiche:text-[12px]">
                        {item.question}
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-[17px] leading-[26px] font-normal text-[#8c8e85] transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-[580px] text-[10px] leading-[1.8] text-[#7b8074] fiche:text-[11px]">
                        {item.answer}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : null}

            {/*
              Les avis n'existent pas dans la référence. Ils restent une
              fonction réelle de la boutique — mais le bloc ne s'affiche que
              s'il y en a. Annoncer « Aucun avis pour le moment » occupait un
              écran pour ne rien dire, et aucun avis n'est fabriqué pour le
              remplir.
            */}
            {product.reviews.length > 0 ? (
              <>
                <h3 className="mt-10 text-[12px] font-bold">Avis</h3>
                <ul className="mt-3 grid gap-3 fiche:grid-cols-2">
                  {product.reviews.map((review, index) => (
                    <li key={index}>
                      <Card className="h-full p-4">
                        <p className="text-[12px] font-bold">
                          {review.title ?? review.authorName}
                        </p>
                        <p className="mt-1 text-[10px] leading-[1.8] text-[#7b8074]">
                          {review.body}
                        </p>
                        <p className="mt-2 text-[9px] text-muted">
                          {review.authorName}
                          {review.verifiedPurchase ? ' · achat vérifié' : null}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
        ) : null}

        {/* ---------------- #assistance ---------------- */}
        <section
          id="assistance"
          aria-labelledby="titre-assistance"
          className="container-page"
        >
          <div className="mb-9 block rounded-lg bg-[#f4f5f0] p-[23px] fiche:mb-14 fiche:flex fiche:items-center fiche:gap-[22px] fiche:rounded-[10px] fiche:px-8 fiche:py-[29px]">
            <span className="mb-4 grid size-10 shrink-0 place-items-center rounded-full bg-white fiche:mb-0 fiche:size-[52px]">
              <IconHeadset className="size-[21px] text-slate-ink fiche:size-6" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="mb-[7px] text-[7px] font-bold tracking-[1.2px] text-brand uppercase">
                Un humain à vos côtés
              </p>
              <h2
                id="titre-assistance"
                className="text-[22px] leading-[1.25] font-bold tracking-[-0.5px] fiche:text-[21px] fiche:leading-normal"
              >
                Le bon kit commence par le bon conseil.
              </h2>
              <p className="mt-1.5 text-[10px] text-[#83867a]">
                Une question sur votre véhicule ou son installation ?
              </p>
            </div>

            <ButtonLink
              href="/contact"
              variant="secondary"
              className="mt-[18px] w-full shrink-0 gap-4 rounded-md px-[17px] text-[11px] whitespace-nowrap fiche:mt-0 fiche:ml-auto fiche:w-auto"
            >
              Demander conseil
            </ButtonLink>
          </div>
        </section>

        {siteConfig.demoBanner ? (
          <p className="container-page pb-6 text-[8px] leading-[1.7] text-[#999b92]">
            {siteConfig.demoBannerLabel} — visuels illustratifs, prix et compatibilités à remplacer
            avant ouverture.
          </p>
        ) : null}
      </div>
    </ProductConfigurationProvider>
  )
}
