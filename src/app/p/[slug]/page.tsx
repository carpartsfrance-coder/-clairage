import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/queries/product'
import { getSelectedVehicle } from '@/lib/session'
import { getShippingOffers } from '@/lib/shipping'
import { commercialTerms, formatPrice, siteConfig } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import {
  BreadcrumbStructuredData,
  FaqStructuredData,
  ProductStructuredData,
} from '@/components/seo/StructuredData'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { ProductGallery } from '@/components/product/ProductGallery'
import { BuyBox } from '@/components/product/BuyBox'
import { ConfigurationContents } from '@/components/product/ConfigurationContents'
import { OptionalAddons } from '@/components/product/OptionalAddons'
import { ProductConfigurationProvider } from '@/components/product/ProductConfiguration'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconCar, IconHeadset, IconShield, IconWrench } from '@/components/ui/icons'

/**
 * Fiche produit — 02-fiche-produit.png, avec le header final.
 *
 * Le véhicule sélectionné traverse toute la page : il décide du conditionnement
 * recommandé, du statut de compatibilité et des accessoires à proposer. Sans
 * lui, la fiche reste complète mais ne conclut rien.
 *
 * Les onglets sont des ancres plutôt qu'un composant à état : la navigation au
 * clavier fonctionne sans script, les sections restent lisibles si le
 * JavaScript échoue, et « Voir le contenu » devient un lien qui marche.
 */

type PageProps = { params: Promise<{ slug: string }> }

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: 'Montage simple',
  MEDIUM: 'Montage intermédiaire',
  HARD: 'Montage difficile',
}

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

  const eyebrow = [product.category?.name, position].filter(Boolean).join(' / ')

  /*
    Pastille posée sur le visuel.

    Elle reprenait mot pour mot la seconde ligne du titre — « Blanc pur
    6 000 K » — et sur mobile les deux se suivaient à quelques pixels : la même
    étiquette, deux fois, dont une par-dessus la photo. Le titre porte
    désormais seul la température de couleur, et la pastille ne sert plus qu'au
    culot, qui n'est écrit nulle part ailleurs à cet endroit.

    Elle disparaît donc complètement sur un produit sans culot, plutôt que de
    répéter quelque chose.
  */
  const badge = product.bulbBase ? `Culot ${product.bulbBase}` : null

  // Même liste pour le fil d'Ariane affiché et pour son balisage : deux
  // sources finiraient par divergé, et c'est le balisage qu'on ne relit pas.
  const breadcrumbItems = [
    { label: 'Accueil', href: '/' },
    { label: 'Catégories', href: '/c' },
    ...(product.category
      ? [{ label: product.category.name, href: `/c/${product.category.slug}` }]
      : []),
    { label: product.name },
  ]

  return (
    /*
      Le conditionnement choisi est partagé par toute la fiche : le bloc
      d'achat le pose, la section Installation le lit. Sans ce partage, les deux
      décrivaient des conditionnements différents sur la même page.
    */
    <ProductConfigurationProvider
      variants={product.variants}
      recommendedVariantId={product.recommendedVariantId}
    >
    <div className="pb-28 lg:pb-16">
      {/* Données structurées : voir StructuredData.tsx — rien n'y est émis en
          préproduction, et rien n'y est affirmé qui ne soit en base. */}
      <ProductStructuredData product={product} />
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <FaqStructuredData items={product.faq} />

      <div className="container-page pt-5">
        <Breadcrumb items={breadcrumbItems} />

        {/*
          Masqué sous lg : le header mobile porte déjà un bandeau véhicule, et
          le bloc d'achat nomme le véhicule ET dit ce qu'il implique pour cette
          référence. Trois rappels empilés sur un écran de téléphone, c'est
          deux de trop.
        */}
        <VehicleBar vehicle={vehicle} className="mt-4 max-lg:hidden" />
      </div>

      {/*
        Galerie + achat.

        Le placement explicite en grille sert le mobile : dans l'ordre du DOM
        viennent le titre, puis la galerie, puis le bloc d'achat — le client
        sait ce qu'il regarde avant de faire défiler une grande image. Sur
        grand écran, le titre et le bloc d'achat se replacent dans la colonne
        de droite, en face de la galerie.
      */}
      <div className="container-page mt-6 grid gap-x-12 gap-y-6 lg:grid-cols-2">
        <div className="lg:col-start-2 lg:row-start-1">
          {eyebrow ? <p className="eyebrow text-brand">{eyebrow}</p> : null}

          <h1 className="mt-2 text-[2rem] leading-[1.1] font-extrabold sm:text-[2.5rem]">
            {product.name}
            {product.colorTemperature ? (
              <span className="block">
                Blanc pur {product.colorTemperature.toLocaleString('fr-FR')} K
              </span>
            ) : null}
          </h1>

          {product.tagline ? (
            <p className="mt-3 text-base text-muted-strong sm:text-lg">{product.tagline}</p>
          ) : null}
        </div>

        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ProductGallery
            items={product.gallery}
            badge={badge}
            productName={product.name}
          />
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <BuyBox
            variants={product.variants}
            recommendedVariantId={product.recommendedVariantId}
            vehicleLabel={vehicle?.label ?? null}
            shippingOffers={shippingOffers}
            returnWindowDays={commercialTerms.returnWindowDays}
          />
        </div>
      </div>

      {/* ---------------- Réassurance ---------------- */}
      <section
        aria-label="Nos engagements"
        className="mt-12 border-y border-line bg-surface-soft"
      >
        <div className="container-page grid gap-6 py-7 md:grid-cols-3">
          {[
            {
              Icon: IconCar,
              title: 'Pensé pour votre véhicule',
              text: 'La compatibilité est indiquée par emplacement, avec sa source et sa date.',
            },
            {
              Icon: IconWrench,
              title: 'Sans modifier le câblage',
              text: "Quand le montage l'exige, les adaptateurs nécessaires sont signalés.",
            },
            {
              Icon: IconShield,
              title: 'Accompagné de A à Z',
              text: 'Une équipe à votre écoute avant et après le montage.',
            },
          ].map(({ Icon, title, text }, index) => (
            <div
              key={title}
              className={index > 0 ? 'md:border-l md:border-line md:pl-6' : undefined}
            >
              <div className="flex items-start gap-3.5">
                <Icon className="size-9 shrink-0 text-slate-ink" />
                <div className="min-w-0">
                  <p className="font-bold">{title}</p>
                  <p className="text-sm text-muted-strong">{text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Onglets (ancres) ---------------- */}
      <nav
        aria-label="Sections de la fiche"
        className="sticky top-0 z-20 border-b border-line bg-white"
      >
        <div className="container-page flex gap-6 overflow-x-auto">
          {[
            { href: '#le-changement', label: 'Le changement' },
            { href: '#contenu', label: kitVariant ? 'Dans votre kit' : 'Caractéristiques' },
            { href: '#installation', label: 'Installation' },
            { href: '#questions', label: 'Vos questions' },
          ].map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className="shrink-0 border-b-2 border-transparent py-4 text-[0.9375rem] font-semibold transition-colors hover:border-brand hover:text-brand"
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      {/* ---- Le changement ---- */}
      <section
        id="le-changement"
        aria-labelledby="titre-changement"
        className="on-dark relative isolate overflow-hidden bg-ink"
      >
        <div className="relative z-10 container-page py-12">
          <p className="eyebrow text-brand">Le détail qui change tout</p>
          <h2 id="titre-changement" className="mt-2 max-w-xl text-[1.75rem] font-extrabold text-white sm:text-[2.125rem]">
            <span className="block">Votre voiture.</span>
            <span className="block">Un autre regard.</span>
          </h2>
          {product.description ? (
            <p className="mt-3 max-w-lg text-white/75">{product.description}</p>
          ) : null}
        </div>

        <div className="relative aspect-[21/9] w-full md:absolute md:inset-0 md:-z-10 md:aspect-auto">
          <Image
            src="/demo/comparatif-phares-led.jpg"
            alt="Comparaison du rendu d'éclairage : jaune à gauche, blanc LED à droite."
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-ink/25 md:bg-linear-to-r md:from-ink md:from-15% md:via-ink/80 md:via-55% md:to-ink/5"
          />
          <p className="absolute bottom-2 right-4 text-[0.6875rem] text-white/55">
            Simulation de rendu — illustration.
          </p>
        </div>
      </section>

      {/* ---- Contenu et caractéristiques ---- */}
      <section id="contenu" aria-labelledby="titre-contenu" className="container-page py-12">
        <h2 id="titre-contenu" className="text-2xl font-extrabold">
          {kitVariant ? 'Dans votre kit' : 'Caractéristiques'}
        </h2>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {kitVariant ? (
            <Card className="p-5">
              <h3 className="font-bold">{kitVariant.name}</h3>
              <ul className="mt-3 divide-y divide-line">
                {kitVariant.components.map((component) => (
                  <li key={component.sku} className="flex items-baseline gap-3 py-2.5 text-sm">
                    <span className="w-10 shrink-0 font-bold">{component.quantity} ×</span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/p/${component.productSlug}`}
                        className="font-semibold underline underline-offset-4 hover:text-brand"
                      >
                        {component.productName}
                      </Link>
                      <span className="block text-muted">{component.variantName}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-ok">
                      {component.required ? 'Inclus' : 'Complément'}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Ce que le client gagne à savoir : le kit part complet, en un
                  seul colis. Comment la disponibilité est calculée regarde le
                  catalogue, pas l'acheteur — c'est documenté côté code. */}
              <p className="mt-3 text-xs text-muted">
                Tout est expédié ensemble, dans le même colis.
              </p>
            </Card>
          ) : null}

          {product.specs.length > 0 ? (
            <div>
              <h3 className="font-bold">Caractéristiques</h3>
              <dl className="mt-3 divide-y divide-line border-y border-line">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="flex gap-4 py-2.5 text-sm">
                    <dt className="w-44 shrink-0 text-muted-strong">{spec.label}</dt>
                    <dd className="font-semibold">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>

        {product.optionalAddons.length > 0 ? (
          <div className="mt-10">
            <h3 className="font-bold">Compléments facultatifs</h3>
            <p className="mt-1 text-sm text-muted-strong">
              Ils ne sont pas nécessaires au montage et ne sont jamais ajoutés automatiquement. Les
              adaptateurs et décodeurs exigés par votre kit, eux, se trouvent dans le bloc
              d&apos;achat.
            </p>
            <OptionalAddons addons={product.optionalAddons} vehicleSelected={Boolean(vehicle)} />
          </div>
        ) : null}
      </section>

      {/* ---- Installation ---- */}
      <section
        id="installation"
        aria-labelledby="titre-installation"
        className="border-y border-line bg-surface-soft"
      >
        <div className="container-page py-12">
          <h2 id="titre-installation" className="text-2xl font-extrabold">
            Installation
          </h2>

          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            {product.difficulty !== 'UNKNOWN' ? (
              <p className="flex items-center gap-2.5 font-semibold">
                <IconWrench className="size-5 text-muted-strong" />
                {DIFFICULTY_LABELS[product.difficulty]}
              </p>
            ) : (
              <p className="flex items-center gap-2.5 text-muted-strong">
                <IconWrench className="size-5" />
                Difficulté de montage non évaluée pour cette référence.
              </p>
            )}
          </div>

          {/*
            Contenu et restrictions du conditionnement CHOISI.

            Ce bloc agrégeait auparavant les restrictions de tous les
            conditionnements : la fiche affirmait en haut que le kit complet
            contenait les adaptateurs et les décodeurs, et répétait ici qu'ils
            n'étaient pas inclus. Les deux ne pouvaient pas être vrais ensemble.
          */}
          <ConfigurationContents />

          {product.guides.length > 0 ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {product.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/guides/${guide.slug}`}
                    className="flex h-full flex-col gap-1 rounded-md border border-line bg-white p-4 transition-colors hover:border-line-strong"
                  >
                    <span className="font-bold">{guide.title}</span>
                    {guide.durationMinutes ? (
                      <span className="text-sm text-muted">
                        Environ {guide.durationMinutes} minutes
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 max-w-2xl text-sm text-muted-strong">
              Aucun guide de montage n&apos;est encore publié pour cette référence.{' '}
              <Link href="/contact" className="font-semibold underline underline-offset-4">
                Demandez-nous la marche à suivre
              </Link>{' '}
              — nous répondons au cas par cas.
            </p>
          )}
        </div>
      </section>

      {/* ---- Questions et avis ---- */}
      <section id="questions" aria-labelledby="titre-questions" className="container-page py-12">
        <h2 id="titre-questions" className="text-2xl font-extrabold">
          Vos questions
        </h2>

        {product.faq.length > 0 ? (
          <div className="mt-5 max-w-3xl">
            {product.faq.map((item) => (
              <details key={item.question} className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <IconArrowRight className="size-5 shrink-0 rotate-90 text-muted-strong transition-transform group-open:-rotate-90" />
                </summary>
                <p className="pb-4 text-sm leading-relaxed text-muted-strong">{item.answer}</p>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-4 max-w-2xl text-sm text-muted-strong">
            Aucune question n&apos;est encore publiée pour cette référence.
          </p>
        )}

        <h3 className="mt-10 text-lg font-bold">Avis</h3>
        {product.reviews.length > 0 ? (
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {product.reviews.map((review, index) => (
              <li key={index}>
                <Card className="h-full p-5">
                  <p className="font-bold">{review.title ?? review.authorName}</p>
                  <p className="mt-1 text-sm text-muted-strong">{review.body}</p>
                  <p className="mt-3 text-xs text-muted">
                    {review.authorName}
                    {review.verifiedPurchase ? ' · achat vérifié' : null}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          // Aucun avis n'est fabriqué : tant que la collecte n'a pas commencé,
          // la section le dit plutôt que d'afficher une note inventée.
          <EmptyState
            className="mt-4"
            title="Aucun avis pour le moment."
            description="Les avis seront publiés ici lorsque des clients en auront déposé après un achat. Rien n'est affiché tant qu'il n'y en a pas."
          />
        )}
      </section>

      {/* ---- Assistance ---- */}
      <section aria-label="Assistance" className="container-page">
        <div className="flex flex-col gap-4 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3.5">
            <IconHeadset className="size-9 shrink-0 text-slate-ink" />
            <div>
              <p className="text-[1.05rem] font-bold">Un doute sur cette référence ?</p>
              <p className="text-sm text-muted-strong">
                Donnez-nous votre véhicule et votre équipement d&apos;origine : nous vérifions
                avant que vous achetiez.
              </p>
            </div>
          </div>
          <ButtonLink href="/contact" variant="secondary" className="shrink-0 max-md:w-full">
            Demander conseil
          </ButtonLink>
        </div>
      </section>

      {siteConfig.demoBanner ? (
        <p className="container-page mt-8 text-xs text-muted">
          {siteConfig.demoBannerLabel} — visuels illustratifs, prix et compatibilités à remplacer
          avant ouverture.
        </p>
      ) : null}
    </div>
    </ProductConfigurationProvider>
  )
}
