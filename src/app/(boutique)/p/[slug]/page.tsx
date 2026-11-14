import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { ficheJumelle, ficheRenommee } from '@/lib/queries/adresses-renommees'
import { getProduct } from '@/lib/queries/product'
import { pageDeRepliFiche } from '@/lib/queries/repli-fiche'
import { getSelectedVehicle } from '@/lib/session'
import { getStaffUser } from '@/lib/admin/guard'
import { getShippingOffers } from '@/lib/shipping'
import { getPacksComplementaires } from '@/lib/queries/packs-complementaires'
import { getVehiculeDeLaFiche } from '@/lib/queries/vehicule-de-la-fiche'
import {
  accrocheSousLeTitre,
  sansMiseEnGardeDImport,
  anneesCourtes,
  corrigerRedactionnelDImport,
  descriptionSeo,
  enChiffres,
  nomDuVehicule,
  titreSeo,
} from '@/lib/seo-fiche'
import { commercialTerms, dureeGarantie, formatPrice, identity, promesseRetour, siteConfig } from '@/lib/identity'
import { getModelesReferences, plusDe } from '@/lib/queries/chiffres-catalogue'
import { faqFicheParDefaut } from '@/lib/faq-generale'
import { typeHorsAmpoules } from '@/lib/types-produit'
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
import { OptionsDuVehicule, ResumeFiche } from '@/components/product/ResumeEtOptions'
import { ConfigurationContents } from '@/components/product/ConfigurationContents'
import { KitContents } from '@/components/product/KitContents'
import { OptionalAddons } from '@/components/product/OptionalAddons'
import { ProductConfigurationProvider } from '@/components/product/ProductConfiguration'
import { SectionNav } from '@/components/product/SectionNav'
import { Prose } from '@/components/ui/Prose'
import { ToneSlider } from '@/components/product/ToneSlider'
import { Card } from '@/components/ui/Surface'
import {
  IconArrowRight,
  IconCar,
  IconCheck,
  IconHeadset,
  IconClose,
  IconPack,
  IconReturn,
  IconShield,
  IconWrench,
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { estComparatifAvantApres } from '@/lib/media-comparatif'
import { estEffetXenon } from '@/lib/effet-xenon'

/*
  Pré-rendu partiel : cette page n'est pas encore reprise. `instant = false`
  la dispense de la vérification ; elle se comporte exactement comme avant.
  Retirer cette ligne, c'est la faire entrer dans le nouveau modèle — voir le
  commentaire de `cacheComponents` dans next.config.ts.
*/
export const instant = false

/**
 * Fiche produit — `reference-site/product.html` du dossier de référence.
 *
 * Refonte LEDVROOM (novembre 2026), d'après la maquette validée par
 * l'exploitant : galerie carrée et promesses à gauche, titre et achat compacts
 * à droite (prix et bouton visibles sans défiler), puis « Le pack en bref »
 * (description et rendu), le contenu du pack, les compléments et les
 * questions. La section Installation n'existe plus sur la fiche. La bascule
 * en colonne unique reste à 800 px (préfixe `fiche:`).
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

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const apercu = (await searchParams).apercu !== undefined && (await getStaffUser()) !== null
  const product = await getProduct(slug, null, { brouillon: apercu })
  if (!product) return { title: 'Produit introuvable' }

  // Un aperçu est une page de travail : jamais indexée, jamais canonique.
  if (apercu) {
    return { title: `Aperçu — ${product.name}`, robots: { index: false, follow: false } }
  }

  /*
    Titre et description : voir `lib/seo-fiche.ts`. Ceux écrits au
    back-office passent en premier ; ceux posés par l'import sont remplacés
    par une version qui porte les années du véhicule et les conditions de
    livraison et de retour réellement configurées.
  */
  const [vehicule, shippingOffers] = await Promise.all([
    getVehiculeDeLaFiche(product.slug),
    getShippingOffers(),
  ])
  const title = titreSeo(product, vehicule)
  const description = descriptionSeo(product, vehicule, {
    garantie: dureeGarantie(),
    seuilFranchiseCents: seuilDeFranchise(shippingOffers),
    retourJours: commercialTerms.satisfaitDays ?? commercialTerms.returnWindowDays,
  })

  return {
    title,
    description,
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: {
      title,
      description,
      url: `/p/${product.slug}`,
      images: product.gallery[0]
        ? [{ url: product.gallery[0].url, alt: product.gallery[0].alt }]
        : undefined,
    },
  }
}

/** Le plus bas des seuils de livraison offerte configurés, ou null. */
function seuilDeFranchise(offres: Array<{ freeFromCents: number | null }>): number | null {
  const seuils = offres
    .map((offre) => offre.freeFromCents)
    .filter((seuil): seuil is number => seuil !== null)
  return seuils.length > 0 ? Math.min(...seuils) : null
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const vehicle = await getSelectedVehicle()

  /*
    Aperçu avant publication.

    Le back-office ne savait pas montrer une fiche en brouillon : il affichait
    « Aucune page publique », et l'administrateur publiait sans avoir vu. Le
    paramètre ouvre la vraie fiche, avec le vrai gabarit — une seconde version
    dans l'administration aurait fini par diverger, et l'aperçu aurait cessé de
    valoir preuve.

    Il n'ouvre rien à personne d'autre : seul un membre de l'équipe connecté
    obtient le brouillon, et la page reste désindexée dans ce mode.
  */
  const parametres = await searchParams
  const apercuDemande = parametres.apercu !== undefined
  const staff = apercuDemande ? await getStaffUser() : null
  const apercu = apercuDemande && staff !== null

  const product = await getProduct(slug, vehicle?.configurationId ?? null, { brouillon: apercu })

  if (!product) {
    // Fiche retirée de la vente (pas encore de photos, archivée…) : le
    // visiteur venu de Google arrive sur la page de son véhicule plutôt que
    // sur « Page introuvable ». Redirection temporaire : la fiche reviendra.
    // Adresse renommée (« -photo-manquante » retiré) ou doublon archivé :
    // renvoi permanent.
    const renommee = apercu ? null : ((await ficheRenommee(slug)) ?? (await ficheJumelle(slug)))
    if (renommee) permanentRedirect(renommee)
    const repli = apercu ? null : await pageDeRepliFiche(slug)
    if (repli) redirect(repli)
    notFound()
  }

  const [shippingOffers, complementaires, vehiculeDeLaFiche, modelesReferences] = await Promise.all([
    getShippingOffers(),
    getPacksComplementaires(product.slug, vehicle?.configurationId ?? null),
    getVehiculeDeLaFiche(product.slug),
    getModelesReferences(),
  ])

  /* Pour le coup de pouce « livraison offerte » de la section Complétez. */
  const prixDuPackCents =
    (product.variants.find((variant) => variant.id === product.recommendedVariantId) ??
      product.variants[0])?.priceCents ?? 0
  const seuilFranchiseCents = seuilDeFranchise(shippingOffers)

  /* Même description que la balise meta, pour les données structurées. */
  // « Toyota Hilux 8 (2015–2025) » : le véhicule pour lequel le pack est composé.
  const concuPour = vehiculeDeLaFiche
    ? `${nomDuVehicule(vehiculeDeLaFiche)} (${anneesCourtes(
        vehiculeDeLaFiche.generation.anneeDebut,
        vehiculeDeLaFiche.generation.anneeFin,
      )})`
    : null
  const descriptionDeLaFiche = descriptionSeo(product, vehiculeDeLaFiche, {
    garantie: dureeGarantie(),
    seuilFranchiseCents,
    retourJours: commercialTerms.satisfaitDays ?? commercialTerms.returnWindowDays,
  })

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
  //
  // Une fiche composée pour un véhicule se range sous lui : Accueil › Audi ›
  // A1 (2010–2018) › la fiche. C'est ce que le client cherche (« LED Audi
  // A1 »), c'est ce que Google affiche sous le lien, et chaque fiche renvoie
  // ainsi vers la page du véhicule. Les autres gardent leur catégorie.
  const breadcrumbItems =
    vehiculeDeLaFiche?.chemin && vehiculeDeLaFiche.cheminMarque
      ? [
          { label: 'Accueil', href: '/' },
          { label: vehiculeDeLaFiche.marque.nom, href: vehiculeDeLaFiche.cheminMarque },
          {
            label: `${enChiffres(vehiculeDeLaFiche.generation.nom)} (${anneesCourtes(
              vehiculeDeLaFiche.generation.anneeDebut,
              vehiculeDeLaFiche.generation.anneeFin,
            )})`,
            href: vehiculeDeLaFiche.chemin,
          },
          { label: product.name },
        ]
      : [
          { label: 'Accueil', href: '/' },
          { label: 'Catégories', href: '/c' },
          ...(product.category
            ? [{ label: product.category.name, href: `/c/${product.category.slug}` }]
            : []),
          { label: product.name },
        ]

  // Le curseur avant / après découpe le comparatif fabriqué pour la fiche
  // (01-avant-apres). Sans comparatif, pas de curseur : on ne fabrique pas un
  // avant/après à partir d'une autre photo.
  const comparatif = product.gallery.find(estComparatifAvantApres)
  /*
    Ampoules halogènes effet xénon, pas des LED (lib/effet-xenon.ts) : le
    comparatif dit « Effet xénon », et l'argumentaire LED n'est pas montré.
  */
  const effetXenon = estEffetXenon(product.name)
  /** Feux additionnels, centrale, clignotants complets… (lib/types-produit.ts). */
  const typeSpecial = typeHorsAmpoules(product.name)
  /*
    « Le pack en bref » ne vaut que pour un pack composé pour un véhicule.
    Une ampoule H7, un ballast ou une barre LED du rayon au détail n'est pas
    un pack : « En bref ».
  */
  const enBref = typeSpecial || !vehiculeDeLaFiche ? 'En bref' : 'Le pack en bref'
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
  /*
    Sans questions publiées en back-office, la fiche reçoit les questions
    par défaut (compatibilité, câblage, garantie, livraison, retours) : un
    client qui hésite trouve la réponse ici plutôt qu'ailleurs.
  */
  const questions = product.faq.length > 0 ? product.faq : await faqFicheParDefaut(concuPour, product.name, product.vehicleType === 'MOTORCYCLE')
  const aContenuQuestions = questions.length > 0 || product.reviews.length > 0

  /*
    Le rédactionnel long existait en base sans être rendu nulle part : les
    fiches portaient leur description et n'en montraient rien. Une section lui
    est donc rendue, et elle n'apparaît que s'il y a du texte.
  */
  const aDescription = (product.body ?? '').trim().length > 0

  /*
    Aucun visuel : la galerie disparaît au lieu d'afficher un cadre vide, et le
    hero passe sur une colonne. C'est fréquent sur les accessoires, dont la
    fiche n'a parfois qu'un prix et trois caractéristiques à donner.
  */
  const aVisuel = product.gallery.length > 0

  /*
    L'ordre est celui de la V2, et il suit la décision d'achat : ce qu'on
    reçoit, puis ce que ça change, puis ce que ça suppose, puis comment on le
    monte. Le rédactionnel long n'a pas de section dans la maquette ; il reste
    avec les caractéristiques, dont il est le développement, plutôt que
    d'ouvrir la page sur un pavé de texte.
  */
  /*
    Refonte LEDVROOM — l'ordre suit la décision d'achat : ce que fait le pack
    (et son rendu), ce qu'on reçoit, puis les questions.

    La section Installation est retirée de la fiche, à la demande de
    l'exploitant. Ce qu'elle portait d'indispensable — ce que le
    conditionnement choisi ne fournit pas, et ses restrictions de montage —
    passe avec le contenu du pack, où il se lit au moment de choisir.
  */
  const aEnBref = aDescription || Boolean(comparatif)
  const aRestrictions = product.variants.some(
    (variant) => variant.missingAccessories.length > 0 || Boolean(variant.fitment.restrictions),
  )
  const aSectionContenu = aContenuKit || aRestrictions

  const sections = [
    ...(aEnBref ? [{ href: '#en-bref', label: enBref }] : []),
    ...(complementaires
      ? [{ href: '#titre-options-vehicule', label: product.vehicleType === 'MOTORCYCLE' ? 'Toute la moto' : 'Toute la voiture' }]
      : []),
    ...(aSectionContenu
      ? [{ href: '#dans-votre-kit', label: kitVariant ? 'Dans la boîte' : 'Caractéristiques' }]
      : []),
    ...(product.optionalAddons.length > 0 ? [{ href: '#complements', label: 'Compléments' }] : []),
    ...(aContenuQuestions ? [{ href: '#questions', label: 'Vos questions' }] : []),
  ]

  /*
    Les promesses de la fiche, posées sous la photo.

    Elles valent pour toute référence du catalogue. « Tout est dans la boîte »
    n'est dit que d'un produit vendu en kit : sur un conditionnement sans
    composition, la promesse serait fausse, et la place revient au délai de
    retour.
  */
  const promesses: Promesse[] = [
    {
      Icon: IconCar,
      titre: 'Pensé pour votre véhicule',
      texte: 'Compatibilité indiquée par emplacement',
    },
    // La garantie prend la place de « Sans modifier le câblage » : c'est
    // l'argument qui rassure le plus avant d'acheter, et il vaut pour tout.
    ...(dureeGarantie()
      ? [
          {
            Icon: IconShield,
            titre: `Garantie ${dureeGarantie()}`,
            texte: 'Sur tous nos produits',
          },
        ]
      : [
          {
            Icon: IconWrench,
            titre: 'Sans modifier le câblage',
            texte: 'Adaptateurs nécessaires signalés',
          },
        ]),
    ...(kitVariant
      ? [
          {
            Icon: IconPack,
            titre: 'Tout est dans la boîte',
            texte: 'Ampoules et accessoires nécessaires',
          },
        ]
      : commercialTerms.returnWindowDays
        ? [
            {
              Icon: IconReturn,
              titre: promesseRetour() ?? '',
              texte: commercialTerms.satisfaitDays
                ? 'Le temps d’essayer, sinon on rembourse'
                : 'Le temps de changer d’avis',
            },
          ]
        : []),
    {
      Icon: IconHeadset,
      titre: 'Un humain vous aide',
      texte: 'Du choix jusqu’au montage',
    },
  ]

  return (
    <ProductConfigurationProvider
      variants={product.variants}
      recommendedVariantId={product.recommendedVariantId}
    >
      {/*
        La barre d'achat fixe occupe le bas de l'écran : on lui réserve sa
        hauteur, plus la zone de sécurité des téléphones à encoche — sous le
        pied de page (repère `data-barre-achat`, lu par Footer), pour ne pas
        laisser une bande blanche entre la dernière section et le pied.
      */}
      <div data-barre-achat>
        {/*
          Données structurées : voir StructuredData.tsx — rien n'y est émis en
          préproduction, ni en aperçu.
        */}
        {apercu ? null : (
          <>
            <ProductStructuredData
              product={product}
              description={descriptionDeLaFiche}
              shippingOffers={shippingOffers}
              returnWindowDays={commercialTerms.returnWindowDays}
            />
            <BreadcrumbStructuredData items={breadcrumbItems} />
            <FaqStructuredData items={product.faq} />
          </>
        )}

        {/* Bandeau d'aperçu : une fiche en brouillon ne se confond pas avec une fiche en ligne. */}
        {apercu ? (
          <div className="border-b border-warn-border bg-warn-soft">
            <div className="container-page flex flex-wrap items-center gap-3 py-2.5 text-[13px] text-warn">
              <strong className="font-bold">Aperçu — fiche non publiée</strong>
              <span>Cette page n’est visible que par l’équipe, et n’est pas indexée.</span>
              <Link
                href={`/admin/catalogue`}
                className="ml-auto font-semibold underline underline-offset-4"
              >
                Retour au catalogue
              </Link>
            </div>
          </div>
        ) : null}

        <div className="container-page">
          <Breadcrumb
            items={breadcrumbItems}
            retourMobile={
              concuPour && vehiculeDeLaFiche?.chemin ? { label: concuPour, href: vehiculeDeLaFiche.chemin } : null
            }
          />
          {/* Fiche d'un véhicule précis : le header mobile n'affiche pas la
              barre « Votre véhicule », le titre porte déjà le véhicule. */}
          {vehiculeDeLaFiche ? <span data-fiche-vehicule hidden /> : null}

          {/* Masqué sur téléphone : le header mobile porte déjà le véhicule.
              Masqué aussi sans véhicule choisi sur une fiche de véhicule :
              l'encadré « Prévu pour… » du bloc d'achat dit la même chose.
              Masqué enfin quand la compatibilité est confirmée : l'encadré
              vert « Compatible avec votre … · Changer » du bloc d'achat le
              dit déjà, et la voiture était nommée trois fois en haut de page. */}
          {(vehicle && !product.variants.some((variant) => variant.fitment.status === 'CONFIRMED')) ||
          (!vehicle && !concuPour) ? (
          <VehicleBar
            vehicle={vehicle}
            concuPour={concuPour}
            intitule={typeSpecial ? 'Prévu pour' : 'Pack composé pour'}
            className="mb-6 max-fiche:hidden"
          />
          ) : null}

          {/*
            .product-hero — refonte LEDVROOM.

            Galerie carrée à gauche, avec les promesses dessous ; titre et achat
            à droite, prix et bouton visibles sans défiler. Sur téléphone : le
            titre, puis la photo, puis l'achat — les promesses passent après le
            bouton.
          */}
          <section
            aria-label={product.name}
            className={cn(
              'flex flex-col pt-1.5 pb-8 fiche:items-start fiche:pt-2 fiche:pb-14',
              aVisuel
                ? 'fiche:grid fiche:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] fiche:gap-x-10 min-[1101px]:gap-x-14 min-[1450px]:gap-x-16'
                : 'fiche:max-w-[620px]',
            )}
          >
            {aVisuel ? (
              <div className="order-2 mt-4 fiche:order-none fiche:mt-0 fiche:self-start fiche:top-[calc(var(--hauteur-header,108px)+16px)] [@media(min-width:801px)_and_(min-height:760px)]:sticky">
                <ProductGallery items={product.gallery} productName={product.name} />
                <ListePromesses promesses={promesses} className="mt-6 hidden fiche:grid" />
              </div>
            ) : null}

            {/*
              Un seul enfant de grille sur grand écran ; sous le basculement,
              `display:contents` le dissout et le titre passe avant la galerie.

              Sur grand écran, c'est la galerie (à gauche) qui reste à l'écran
              pendant qu'on fait défiler la colonne d'achat, plus longue depuis
              le configurateur et « Complétez votre véhicule » — comme chez les
              concurrents (demande de l'exploitant, 9 novembre 2026).
            */}
            <div className="contents fiche:block">
              <ProductTitle
                eyebrow={eyebrow}
                name={product.name}
                secondLine={
                  product.colorTemperature
                    ? `Blanc ${product.colorTemperature.toLocaleString('fr-FR')} K`
                    : null
                }
                tagline={accrocheSousLeTitre(product.tagline, vehiculeDeLaFiche)}
                // Téléphone : « Pour les Audi A1 produites de 2010 à 2018 » redit
                // le titre ; le véhicule et ses années passent dans le surtitre.
                vehiculeMobile={
                  concuPour && accrocheSousLeTitre(product.tagline, vehiculeDeLaFiche) !== product.tagline
                    ? concuPour
                    : null
                }
              />

              {/* Plus de « Réf. LV-… » sous le titre (exploitant, 9 novembre 2026) :
                  la référence interne ne dit rien au client. Elle reste dans les
                  données structurées pour Google, et dans le panier. */}
              <ResumeFiche
                reference={null}
                resume={aEnBref ? resumeCourt(product.description ?? product.tagline ?? null) : null}
              />

              <div className="order-3 mt-5 fiche:mt-6">
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
                  garantie={dureeGarantie()}
                  concuPour={concuPour}
                  moto={product.vehicleType === 'MOTORCYCLE'}
                  vehiculeDesComplements={
                    complementaires && complementaires.packs.length > 0
                      ? complementaires.vehicule
                      : null
                  }
                />
              </div>

              {complementaires && complementaires.packs.length > 0 ? (
                <OptionsDuVehicule vehicule={complementaires.vehicule} packs={complementaires.packs} />
              ) : null}
            </div>
          </section>
        </div>

        {/* Fiche sans visuel : les promesses après le bouton. Sur téléphone,
            plus de cartes : la ligne sous le bouton d'achat les dit déjà. */}
        {aVisuel ? null : (
          <div className="container-page pb-10 max-fiche:hidden">
            <ListePromesses promesses={promesses} className="grid" />
          </div>
        )}

        {/* ---------------- .section-nav ---------------- */}
        {/* Une seule ancre ne sert à rien : la barre n'apparaît qu'à partir de deux sections. */}
        {sections.length > 1 ? <SectionNav items={sections} /> : null}

        {/* ---------------- #en-bref : la description, et l'avant / après ---------------- */}
        {aEnBref ? (
          <section
            id="en-bref"
            aria-labelledby="titre-en-bref"
            className="on-dark scroll-mt-32 bg-[#111214] text-white"
          >
            <div className="container-page flex flex-col gap-14 py-12 fiche:py-20">
              <div
                className={cn(
                  'flex flex-col gap-10',
                  comparatif && 'fiche:grid fiche:grid-cols-2 fiche:items-center fiche:gap-14',
                )}
              >
                <div className={cn(!comparatif && 'max-w-[760px]')}>
                  <p className="mb-3 text-[12px] font-bold tracking-[1.4px] text-brand-on-dark uppercase">
                    {enBref}
                  </p>
                  <h2
                    id="titre-en-bref"
                    className="text-[28px] leading-[1.12] font-bold tracking-[-0.8px] fiche:text-[38px] fiche:tracking-[-1.2px]"
                  >
                    {product.tagline ?? product.name}
                  </h2>
                  {/*
                    Le rédactionnel long de la fiche. Sans lui, l'accroche
                    courte du rendu prend sa place.
                  */}
                  {aDescription ? (
                    <Prose sombre className="mt-6">
                      {corrigerRedactionnelDImport(product.body ?? '')}
                    </Prose>
                  ) : product.description ? (
                    <p className="mt-5 text-[16px] leading-[1.7] text-[#c9ccd1] fiche:text-[17px]">
                      {sansMiseEnGardeDImport(product.description)}
                    </p>
                  ) : null}

                  {/*
                    Le rédactionnel renvoie à « la page du véhicule » : le lien
                    est là. C'est aussi le lien interne qui relie chaque fiche
                    à la page qui regroupe tous les packs de ce véhicule.
                  */}
                  {vehiculeDeLaFiche?.chemin ? (
                    <Link
                      href={vehiculeDeLaFiche.chemin}
                      className="mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-white underline underline-offset-4 hover:text-brand-on-dark"
                    >
                      {`Tous les éclairages de votre ${nomDuVehicule(vehiculeDeLaFiche)} (${anneesCourtes(
                        vehiculeDeLaFiche.generation.anneeDebut,
                        vehiculeDeLaFiche.generation.anneeFin,
                      )})`}
                      <IconArrowRight className="size-4 shrink-0" />
                    </Link>
                  ) : null}
                </div>

                {/* Sur téléphone, l'avant / après passe en premier : c'est lui
                    qui donne envie de lire la suite. */}
                {comparatif ? (
                  <div className="max-fiche:order-first">
                    <ToneSlider
                      image={comparatif.url}
                      imageAlt={comparatif.alt}
                      apresLabel={effetXenon ? 'Effet xénon' : 'LED'}
                    />
                  </div>
                ) : null}
              </div>

              {/*
                Pourquoi un pack plutôt que des ampoules « universelles ».
                Chaque ligne dit ce que la boutique fait réellement pour toute
                référence montée sur un véhicule — rien de plus. Montré
                seulement pour un produit lié à un emplacement d'éclairage, et
                jamais pour un pack d'ampoules halogènes : il parle de LED.
              */}
              {position && !effetXenon && !typeSpecial ? (
                <div className="flex flex-col gap-8 border-t border-[#2a2d32] pt-12 fiche:grid fiche:grid-cols-[0.8fr_1.2fr] fiche:items-start fiche:gap-14">
                  <div>
                    <p className="mb-3 text-[12px] font-bold tracking-[1.4px] text-brand-on-dark uppercase">
                      Pourquoi un pack {identity.name}
                    </p>
                    <h3 className="text-[24px] leading-[1.15] font-bold tracking-[-0.6px] fiche:text-[30px]">
                      Des LED qui vont vraiment sur votre{' '}
                      {product.vehicleType === 'MOTORCYCLE' ? 'moto' : 'voiture'}.
                    </h3>
                    <p className="mt-4 text-[16px] leading-[1.7] text-[#c9ccd1]">
                      Des ampoules LED, on en trouve partout. Savoir lesquelles rentrent dans
                      votre phare, sans erreur au tableau de bord, c’est notre métier.
                    </p>
                    {/* Un chiffre lu dans la base (modèles avec au moins un produit en ligne). */}
                    {modelesReferences && plusDe(modelesReferences) ? (
                      <p className="mt-7 flex items-baseline gap-3">
                        {/* « Plus de » reste écrit : le chiffre est arrondi vers le bas. */}
                        <strong className="flex items-baseline gap-2 text-[34px] leading-none font-extrabold tracking-[-1px] text-white fiche:text-[40px]">
                          <span className="text-[15px] font-semibold tracking-normal text-[#c9ccd1]">Plus de</span>
                          {plusDe(modelesReferences)?.replace(/^Plus de /, '')}
                        </strong>
                        <span className="text-[15px] leading-snug text-[#c9ccd1]">
                          modèles de véhicules référencés,
                          <br />
                          emplacement par emplacement.
                        </span>
                      </p>
                    ) : null}
                    <a
                      href="/contact"
                      className="mt-7 inline-flex min-h-12 items-center gap-2.5 rounded-xl border border-white/20 px-5 text-[15px] font-bold text-white transition-colors hover:border-white/50 hover:bg-white/5"
                    >
                      <IconHeadset className="size-5 text-brand-on-dark" />
                      Une question ? Demander conseil
                    </a>
                  </div>

                  <table className="w-full border-collapse text-[14px] fiche:text-[15px]">
                    <thead>
                      <tr>
                        <th scope="col" className="py-3 text-left">
                          <span className="sr-only">Critère</span>
                        </th>
                        <th
                          scope="col"
                          className="w-[30%] px-2 py-3 text-center font-semibold text-[#a9adb4]"
                        >
                          LED « universelles »
                        </th>
                        <th scope="col" className="w-[30%] rounded-t-xl bg-white/[0.06] px-2 py-3 text-center font-bold">
                          Pack {identity.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/*
                        Comparaison loyale : chaque ligne est vérifiable. Les
                        trois dernières disent nos conditions réelles (garantie,
                        satisfait ou remboursé, livraison) ; en face, ce qu'on
                        peut affirmer de tout vendeur — le minimum légal de 14
                        jours, ou « selon le vendeur ».
                      */}
                      {(
                        [
                        { critere: 'Compatibilité vérifiée pour votre véhicule', ailleurs: 'À vérifier vous-même', non: true },
                        { critere: 'Équipement d’origine pris en compte (halogène, xénon, LED)', ailleurs: 'À vérifier vous-même', non: true },
                        { critere: 'Adaptateurs nécessaires signalés', ailleurs: 'À trouver ailleurs', non: true },
                        { critere: 'Un conseiller avant et après l’achat', ailleurs: 'Rarement', non: true },
                        dureeGarantie()
                          ? { critere: 'Garantie', ailleurs: 'Selon le vendeur', nous: dureeGarantie() as string }
                          : null,
                        commercialTerms.satisfaitDays
                          ? { critere: 'Satisfait ou remboursé', ailleurs: '14 jours (minimum légal)', nous: `${commercialTerms.satisfaitDays} jours` }
                          : null,
                        seuilFranchiseCents
                          ? { critere: 'Livraison', ailleurs: 'Selon le vendeur', nous: `Offerte dès ${formatPrice(seuilFranchiseCents)}` }
                          : null,
                        ] as Array<{ critere: string; ailleurs: string; non?: boolean; nous?: string } | null>
                      )
                        .filter((l): l is { critere: string; ailleurs: string; non?: boolean; nous?: string } => l !== null)
                        .map((ligne, i, toutes) => (
                        <tr key={ligne.critere} className="border-t border-[#2a2d32]">
                          <th scope="row" className="py-3.5 pr-3 text-left font-medium text-[#e7e8ea]">
                            {ligne.critere}
                          </th>
                          <td className="px-2 py-3.5 text-center text-[#a9adb4]">
                            <span className="inline-flex items-center gap-1.5">
                              {ligne.non ? <IconClose className="size-4 shrink-0 text-[#6b7078] max-fiche:hidden" /> : null}
                              {ligne.ailleurs}
                            </span>
                          </td>
                          <td className={cn('bg-white/[0.06] px-2 py-3.5 text-center', i === toutes.length - 1 && 'rounded-b-xl')}>
                            {ligne.nous ? (
                              <strong className="text-[15px] font-extrabold text-white fiche:text-[16px]">{ligne.nous}</strong>
                            ) : (
                              <>
                                <span className="inline-grid size-7 place-items-center rounded-full bg-ok text-white">
                                  <IconCheck className="size-4" strokeWidth={2.5} />
                                </span>
                                <span className="sr-only">Oui</span>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/*
          ---------------- #completer ----------------
          Les autres packs confirmés pour ce véhicule. Placée juste après « Le
          pack en bref » : le client vient de voir l'avant / après, c'est là
          qu'il a envie d'équiper toute la voiture.
        */}
        {/* Remplacée par « Complétez l'éclairage » dans la colonne d'achat
            (cartes avec photo et « tout ajouter ») : la garder faisait doublon. */}
        {/* « Complétez l'éclairage » est dans la colonne d'achat (OptionsDuVehicule). */}

        {/* ---------------- #dans-votre-kit ---------------- */}
        {aSectionContenu ? (
          /*
            La référence nomme cette section `#contenu` ; cet identifiant est
            pris par le lien d'évitement du gabarit (`<main id="contenu">`),
            d'où ce nom distinct.
          */
          <section
            id="dans-votre-kit"
            aria-labelledby="titre-contenu"
            className="container-page scroll-mt-32 py-12 fiche:py-20"
          >
            <div className="mb-6 fiche:mb-8 fiche:flex fiche:items-end fiche:justify-between fiche:gap-8">
              <div>
                <p className="mb-2 text-[12px] font-bold tracking-[1.4px] text-brand uppercase">
                  Tout est prévu
                </p>
                <h2
                  id="titre-contenu"
                  className="text-[26px] leading-[1.2] font-bold tracking-[-0.6px] fiche:text-[32px]"
                >
                  {kitVariant ? 'Dans la boîte' : 'Caractéristiques'}
                </h2>
              </div>
              <p className="mt-2 text-[14px] text-[#5f6266] fiche:mt-0 fiche:text-right">
                Ce que réunit le conditionnement retenu dans le bloc d&apos;achat.
              </p>
            </div>

            {aContenuKit ? (
              <KitContents
                image={visuelKit?.url ?? null}
                imageAlt={visuelKit?.alt ?? `${product.name} — contenu`}
              />
            ) : null}

            {/* Ce que le conditionnement choisi ne fournit pas, et ses restrictions. */}
            <ConfigurationContents />

            {product.specs.length > 0 ? (
              <div className={cn(kitVariant && 'mt-12')}>
                {kitVariant ? <h3 className="text-[18px] font-bold">Caractéristiques</h3> : null}
                <dl
                  className={cn(
                    'grid gap-x-12 border-t border-line fiche:grid-cols-2',
                    kitVariant && 'mt-4',
                  )}
                >
                  {product.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="flex justify-between gap-6 border-b border-line py-3.5 text-[15px]"
                    >
                      <dt className="text-[#5f6266]">{spec.label}</dt>
                      <dd className="text-right font-semibold">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ---------------- #complements ---------------- */}
        {product.optionalAddons.length > 0 ? (
          <section
            id="complements"
            aria-labelledby="titre-complements"
            className="container-page scroll-mt-32 border-t border-line py-12 fiche:py-20"
          >
            <div className="mb-6 fiche:mb-8 fiche:flex fiche:items-end fiche:justify-between fiche:gap-8">
              <div>
                <p className="mb-2 text-[12px] font-bold tracking-[1.4px] text-brand uppercase">
                  Pour aller plus loin
                </p>
                <h2
                  id="titre-complements"
                  className="text-[26px] leading-[1.2] font-bold tracking-[-0.6px] fiche:text-[32px]"
                >
                  Le blanc, jusque dans les détails.
                </h2>
              </div>
              <p className="mt-2 text-[14px] text-[#5f6266] fiche:mt-0 fiche:text-right">
                Des compléments facultatifs. Votre kit principal reste complet.
              </p>
            </div>

            <OptionalAddons addons={product.optionalAddons} vehicleSelected={Boolean(vehicle)} />

            <p className="mt-4 text-[13px] leading-[1.6] text-[#6b6d70]">
              Les adaptateurs et décodeurs exigés par votre kit ne sont pas ici : ils figurent dans
              le bloc d&apos;achat, avec le conditionnement qui les contient.
            </p>
          </section>
        ) : null}

        {/* ---------------- #montage : guides rédigés dans le back-office ---------------- */}
        {product.guides.length > 0 ? (
          <section id="montage" aria-labelledby="titre-montage" className="scroll-mt-32 border-t border-line">
            <div className="container-page py-10">
              <h2 id="titre-montage" className="text-[22px] font-bold tracking-[-0.4px]">
                Guide de montage
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {product.guides.map((guide) => (
                  <li key={guide.slug}>
                    <Link href={`/guides/${guide.slug}`} className="font-semibold underline underline-offset-4 hover:text-brand">
                      {guide.title}
                    </Link>
                    {guide.durationMinutes ? (
                      <span className="text-[14px] text-[#6b6d70]"> · environ {guide.durationMinutes} min</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ---------------- #questions : questions, avis, et un humain ---------------- */}
        {aContenuQuestions ? (
          <section
            id="questions"
            aria-labelledby="titre-questions"
            className="scroll-mt-32 border-t border-line"
          >
            <div className="container-page pt-12 pb-10 fiche:grid fiche:grid-cols-[0.75fr_1.25fr] fiche:gap-14 fiche:py-20">
              <div>
                <p className="mb-2 text-[12px] font-bold tracking-[1.4px] text-brand uppercase">
                  On vous répond
                </p>
                <h2
                  id="titre-questions"
                  className="text-[26px] leading-[1.15] font-bold tracking-[-0.6px] fiche:text-[32px]"
                >
                  Vos questions
                </h2>
                <p className="mt-3 text-[15px] leading-[1.6] text-[#5f6266]">
                  Les réponses aux questions qu’on nous pose le plus.
                </p>
                <CarteConseil className="mt-6 hidden fiche:flex" />
              </div>

              <div className="mt-6 fiche:mt-0">
                {questions.length > 0 ? (
                  <ul className="border-t border-line">
                    {questions.map((item) => (
                      <li key={item.question} className="border-b border-line">
                        <details className="group">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-bold [&::-webkit-details-marker]:hidden">
                            {item.question}
                            <span
                              aria-hidden="true"
                              className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f5f6f7] text-[18px] font-normal transition-transform group-open:rotate-45"
                            >
                              +
                            </span>
                          </summary>
                          <p className="max-w-[640px] pb-5 text-[15px] leading-[1.7] text-[#3c4047]">
                            {item.answer}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/*
                  Les avis ne s'affichent que s'il y en a : aucun avis n'est
                  fabriqué pour remplir le bloc.
                */}
                {product.reviews.length > 0 ? (
                  <>
                    <h3 className={cn('text-[18px] font-bold', questions.length > 0 && 'mt-12')}>
                      Avis clients
                    </h3>
                    <ul className="mt-4 grid gap-3 fiche:grid-cols-2">
                      {product.reviews.map((review, index) => (
                        <li key={index}>
                          <Card className="h-full p-5">
                            <p className="text-[15px] font-bold">
                              {review.title ?? review.authorName}
                            </p>
                            <p className="mt-1.5 text-[14px] leading-[1.6] text-[#3c4047]">
                              {review.body}
                            </p>
                            <p className="mt-3 text-[13px] text-[#6b6d70]">
                              {review.authorName}
                              {review.verifiedPurchase ? ' · achat vérifié' : null}
                            </p>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <CarteConseil className="mt-8 flex fiche:hidden" />
              </div>
            </div>
          </section>
        ) : (
          /* Sans questions ni avis, l'assistance reste joignable en bas de page. */
          <section id="assistance" aria-label="Assistance" className="container-page py-12">
            <CarteConseil bandeau className="flex" />
          </section>
        )}

        {siteConfig.demoBanner ? (
          <p className="container-page pb-6 text-[12px] leading-[1.6] text-[#6b6d70]">
            {siteConfig.demoBannerLabel} — visuels illustratifs, prix et compatibilités à remplacer
            avant ouverture.
          </p>
        ) : null}
      </div>
    </ProductConfigurationProvider>
  )
}

type Promesse = {
  Icon: typeof IconCar
  titre: string
  texte: string
}

/** Les promesses de la fiche, en cartes de deux colonnes. */
function ListePromesses({ promesses, className }: { promesses: Promesse[]; className?: string }) {
  return (
    <ul aria-label="Nos engagements" className={cn('grid-cols-2 gap-2.5 fiche:gap-3', className)}>
      {promesses.map(({ Icon, titre, texte }) => (
        <li
          key={titre}
          className="flex flex-col items-start gap-2.5 rounded-xl bg-[#f5f6f7] p-3.5 min-[480px]:flex-row min-[480px]:gap-3 fiche:p-4"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-[13px] leading-[1.3] fiche:text-[14px]">{titre}</strong>
            <span className="mt-0.5 block text-[12px] leading-[1.4] text-[#5f6266] fiche:text-[13px]">
              {texte}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * « Un humain à vos côtés » — la carte sombre qui mène au conseil.
 * En `bandeau`, elle s'étale sur une ligne sur grand écran : texte à gauche,
 * bouton à droite.
 */
function CarteConseil({ className, bandeau = false }: { className?: string; bandeau?: boolean }) {
  return (
    <div
      className={cn(
        'on-dark flex-col gap-3 rounded-2xl bg-[#111214] p-6 text-white',
        bandeau && 'fiche:flex-row fiche:items-center fiche:gap-6 fiche:px-8',
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#2a1617] text-brand-on-dark">
        <IconHeadset className="size-5" />
      </span>
      <div className={cn('flex flex-col gap-2', bandeau && 'fiche:flex-1')}>
        {/* « vos phares » s'affichait aussi sur les packs plaque, recul ou habitacle. */}
        <strong className="text-[18px]">Un doute avant de commander ?</strong>
        <p className="text-[14px] leading-[1.6] text-[#c9ccd1]">
          Décrivez-nous votre véhicule : un conseiller vous dit quel pack prendre, et vous aide
          jusqu’au montage.
        </p>
      </div>
      <Link
        href="/contact"
        className={cn(
          'mt-1 flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-[15px] font-bold text-ink transition-colors hover:bg-[#e7e8ea]',
          bandeau && 'fiche:mt-0 fiche:shrink-0',
        )}
      >
        Demander conseil
      </Link>
    </div>
  )
}

/** Le début de la description, coupé proprement vers 220 caractères. */
function resumeCourt(texte: string | null): string | null {
  if (!texte) return null
  const t = sansMiseEnGardeDImport(texte.replace(/\s+/g, ' ').trim())
  if (!t) return null
  if (t.length <= 230) return t
  const coupe = t.slice(0, 220)
  return coupe.slice(0, coupe.lastIndexOf(' ')) + '…'
}
