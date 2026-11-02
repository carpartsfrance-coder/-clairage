import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import {
  chercherComplements,
  chercherConfigurations,
  chercherVariantes,
  getAdminProduct,
  listAttachableMedia,
  listCategoryOptions,
  listGuideOptions,
  listLightPositions,
  listVatRates,
} from '@/lib/queries/admin'
import { availabilityForKit } from '@/lib/stock'
import { libelleVehicule } from '@/lib/admin/produit-liens'
import { MAX_UPLOAD_BYTES, storageStatus } from '@/lib/storage'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Surface'
import { releverManques, type Manque } from '@/lib/admin/completeness'
import { ordreAffichage } from '@/lib/admin/media-order'
import { ProductInfoForm, ProductStatusForm } from '@/components/admin/ProductEditor'
import { ProductMediaManager, type VisuelFiche } from '@/components/admin/ProductMediaManager'
import {
  ProductVariantsManager,
  type VarianteFiche,
} from '@/components/admin/ProductVariantsManager'
import {
  AdresseForm,
  IdentiteForm,
  RedactionnelForm,
} from '@/components/admin/ProductContentForms'
import { ProductSpecsManager, type SpecFiche } from '@/components/admin/ProductSpecsManager'
import { ProductFaqManager, type FaqFiche } from '@/components/admin/ProductFaqManager'
import {
  ProductGuidesManager,
  type GuideFiche,
  type GuideOption,
} from '@/components/admin/ProductGuidesManager'
import {
  ProductAddonsManager,
  type ComplementCandidat,
  type ComplementFiche,
} from '@/components/admin/ProductAddonsManager'
import {
  ProductKitManager,
  type ComposantCandidat,
  type ConditionnementComposable,
} from '@/components/admin/ProductKitManager'
import {
  ProductFitmentsManager,
  type CompatibiliteFiche,
  type ConditionnementCompatible,
  type ConfigurationCandidate,
} from '@/components/admin/ProductFitmentsManager'

/**
 * Fiche produit du back-office.
 *
 * Tout ce qui manque est dit « non renseigné » : une fiche d'administration
 * sert à repérer les trous (texte alternatif absent, compatibilité non
 * documentée, TVA manquante), pas à les masquer.
 *
 * Chaque bloc a son propre enregistrement, et ce n'est pas un détail de mise
 * en page : un seul gros « Enregistrer » obligerait à renvoyer le prix pour
 * corriger une accroche, et ferait de chaque correction de détail une
 * réécriture complète de la fiche.
 *
 * Les liens vers le reste de la boutique — compléments, composition d'un kit,
 * compatibilités véhicule — se choisissent par une recherche, et non dans une
 * liste déroulante : le catalogue compte près de dix mille produits et le
 * référentiel véhicule 2 180 configurations. Le terme cherché vit dans
 * l'adresse, ce qui le rend rechargeable et partageable, et dit aussi de quel
 * conditionnement il s'agit — sans quoi un même terme proposerait les mêmes
 * candidats sous les trois conditionnements de la fiche.
 *
 * Les compatibilités s'écrivent aussi depuis l'écran Véhicules, et avec les
 * mêmes règles (`parseFitment`) : là on documente un véhicule, ici une
 * référence qui en équipe quarante.
 */

type PageProps = {
  params: Promise<{ productId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Un paramètre d'adresse, réduit à sa première valeur. */
function unSeul(params: Record<string, string | string[] | undefined>, cle: string): string {
  const valeur = params[cle]
  if (Array.isArray(valeur)) return valeur[0] ?? ''
  return valeur ?? ''
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { productId } = await params
  const product = await getAdminProduct(productId)
  return {
    title: product?.name ?? 'Produit introuvable',
    robots: { index: false, follow: false },
  }
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
}

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'warn',
  PUBLISHED: 'ok',
  ARCHIVED: 'neutral',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })

/** Valeur absente : on l'écrit, on ne la devine pas. */
function Unset() {
  return <span className="text-muted">non renseigné</span>
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2 sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold text-muted-strong sm:w-56 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

export default async function AdminProductPage({ params, searchParams }: PageProps) {
  const staff = await requireStaff('catalog.view')
  const { productId } = await params
  const product = await getAdminProduct(productId)
  if (!product) notFound()

  /*
    Les recherches de liens vivent dans l'adresse : `complement` cherche un
    produit, `composant` une référence pour le kit désigné par `kit`,
    `vehicule` une configuration pour le conditionnement désigné par `compat`.
    Un identifiant inconnu ne casse rien — le bloc correspondant ne reconnaît
    simplement aucun de ses conditionnements.
  */
  const requete = await searchParams
  const termeComplement = unSeul(requete, 'complement')
  const termeComposant = unSeul(requete, 'composant')
  const kitCible = unSeul(requete, 'kit') || null
  const termeVehicule = unSeul(requete, 'vehicule')
  const compatCible = unSeul(requete, 'compat') || null

  // La lecture suffit pour consulter la fiche ; poser un visuel demande le
  // droit d'écriture. On masque ce qui serait refusé plutôt que d'offrir un
  // formulaire qui échouera — la garde reste dans l'action.
  const mayEdit = can(staff.role, 'catalog.edit')

  const manques = releverManques(product)
  const bloquants = manques
    .filter((manque) => manque.niveau === 'bloquant')
    .map((manque) => manque.champ)
  const categoryNames = product.categories.map((entry) => entry.category.name)

  // Rubriques proposées à l'édition, taux de TVA et guides disponibles. Les
  // deux premières listes servent aussi à l'écran de création : elles vivent
  // dans les requêtes, pas ici.
  const [categoriesOptions, tauxTva, tousLesGuides, emplacements] = await Promise.all([
    listCategoryOptions(),
    listVatRates(),
    listGuideOptions(),
    listLightPositions(),
  ])

  const specs: SpecFiche[] = product.specs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    value: spec.value,
  }))

  const questions: FaqFiche[] = product.faqItems.map((item) => ({
    id: item.id,
    question: item.question,
    answer: item.answer,
  }))

  /*
    Les guides rattachés portent leur date de publication : la fiche publique
    ne montre que les guides publiés, et l'écran doit pouvoir dire qu'un
    rattachement ne se voit pas encore.
  */
  const guidesRattaches: GuideFiche[] = product.guides.map((lien) => ({
    id: lien.guide.id,
    title: lien.guide.title,
    slug: lien.guide.slug,
    publie: lien.guide.publishedAt !== null,
  }))
  const dejaRattaches = new Set(guidesRattaches.map((guide) => guide.id))
  const guidesDisponibles: GuideOption[] = tousLesGuides
    .filter((guide) => !dejaRattaches.has(guide.id))
    .map((guide) => ({ id: guide.id, title: guide.title, publie: guide.publishedAt !== null }))

  /*
    Les conditionnements, avec ce qu'il faut pour décider : le taux lisible, le
    stock réservé, la composition d'un kit, et ce qui s'y rattache ailleurs
    dans la boutique.
  */
  const variantes: VarianteFiche[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    packaging: variant.packaging,
    priceCents: variant.priceCents,
    compareAtCents: variant.compareAtCents,
    vatRateId: variant.vatRateId,
    vatRateLabel: variant.vatRate?.label ?? null,
    stockOnHand: variant.stockOnHand,
    stockReserved: variant.stockReserved,
    lowStockThreshold: variant.lowStockThreshold,
    weightGrams: variant.weightGrams,
    backorder: variant.backorder,
    active: variant.active,
    composants: variant.components.map((entry) => ({
      id: entry.id,
      quantite: entry.quantity,
      requis: entry.required,
      libelle: `${entry.component.product.name} · ${entry.component.name}`,
      sku: entry.component.sku,
    })),
    attaches: {
      commandes: variant._count.orderLines,
      paniers: variant._count.cartLines,
      kits: variant._count.partOfKits,
      compatibilites: variant.fitments.length,
    },
  }))
  /*
    Les compléments facultatifs, dans l'ordre où la fiche les propose. Chacun
    porte de quoi dire s'il se voit : seuls les produits publiés ayant une
    référence active sont affichés par la fiche.
  */
  const complements: ComplementFiche[] = product.relatedFrom.map((lien) => ({
    relationId: lien.id,
    produitId: lien.target.id,
    name: lien.target.name,
    slug: lien.target.slug,
    statut: lien.target.status,
    referencesActives: lien.target._count.variants,
  }))

  /*
    La composition de chaque conditionnement, avec ce qu'elle décide : le
    nombre de kits montables et le composant qui le limite. C'est le seul
    endroit où l'on voit qu'une quantité vient de diviser par deux ce qu'on
    peut vendre — la fiche publique, elle, n'affiche que le résultat.
  */
  const conditionnementsComposables: ConditionnementComposable[] = product.variants.map(
    (variant) => {
      const disponibilite =
        variant.components.length > 0
          ? availabilityForKit(
              variant.components.map((entry) => ({
                quantity: entry.quantity,
                required: entry.required,
                component: entry.component,
              })),
            )
          : null

      return {
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        dansDesKits: variant._count.partOfKits,
        montables: disponibilite?.sellable ?? null,
        composantLimitant: disponibilite?.limitingComponent?.sku ?? null,
        composants: variant.components.map((entry) => ({
          ligneId: entry.id,
          componentId: entry.componentId,
          sku: entry.component.sku,
          libelle: `${entry.component.product.name} · ${entry.component.name}`,
          quantite: entry.quantity,
          requis: entry.required,
          vendable: Math.max(0, entry.component.stockOnHand - entry.component.stockReserved),
        })),
      }
    },
  )

  /*
    Les compatibilités, par conditionnement. La date de vérification est
    rendue au format du champ `date` (AAAA-MM-JJ) et au format français :
    l'une se remplit, l'autre se lit.
  */
  const conditionnementsCompatibles: ConditionnementCompatible[] = product.variants.map(
    (variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      compatibilites: variant.fitments.map((fitment): CompatibiliteFiche => {
        const generation = fitment.configuration.generation
        return {
          id: fitment.id,
          vehicule: libelleVehicule({
            marque: generation.model.make.name,
            modele: generation.model.name,
            generation: generation.name,
          }),
          equipement: fitment.configuration.headlampRef
            ? `${fitment.configuration.equipment.label} · ${fitment.configuration.headlampRef}`
            : fitment.configuration.equipment.label,
          emplacement: fitment.position.label,
          statut: fitment.status,
          quantite: fitment.quantity,
          restrictions: fitment.restrictions,
          homologation: fitment.roadApproval,
          marche: fitment.approvalMarket,
          noteHomologation: fitment.approvalNote,
          source: fitment.source,
          verifieLe: fitment.verifiedAt ? fitment.verifiedAt.toISOString().slice(0, 10) : '',
          verifieLeAffiche: fitment.verifiedAt ? dateFormatter.format(fitment.verifiedAt) : null,
          configurationActive: fitment.configuration.active,
          accessoires: fitment._count.accessories,
        }
      }),
    }),
  )

  /*
    Les trois recherches, lancées ensemble et seulement quand elles ont un
    terme : sans cela, chaque affichage de la fiche irait interroger le
    catalogue pour rien. Les produits et références déjà liés sont exclus en
    base plutôt que barrés à l'écran — une proposition qu'on ne peut pas
    accepter n'est pas une proposition.
  */
  const composantsDuKitCible =
    conditionnementsComposables.find((bloc) => bloc.id === kitCible)?.composants ?? []

  const [candidatsComplement, candidatsComposant, candidatesVehicule] = await Promise.all([
    mayEdit && termeComplement
      ? chercherComplements(termeComplement, {
          produitId: product.id,
          exclureIds: complements.map((complement) => complement.produitId),
        })
      : Promise.resolve([]),
    mayEdit && kitCible && termeComposant
      ? chercherVariantes(termeComposant, {
          varianteId: kitCible,
          exclureIds: composantsDuKitCible.map((composant) => composant.componentId),
        })
      : Promise.resolve([]),
    mayEdit && compatCible && termeVehicule
      ? chercherConfigurations(termeVehicule)
      : Promise.resolve([]),
  ])

  const candidatsDeComplement: ComplementCandidat[] = candidatsComplement.map((produit) => ({
    id: produit.id,
    name: produit.name,
    slug: produit.slug,
    statut: produit.status,
    referencesActives: produit._count.variants,
  }))

  const candidatsDeComposant: ComposantCandidat[] = candidatsComposant.map((variante) => ({
    id: variante.id,
    sku: variante.sku,
    libelle: `${variante.product.name} · ${variante.name}`,
    estKit: variante._count.components > 0,
    vendable: Math.max(0, variante.stockOnHand - variante.stockReserved),
    statutProduit: variante.product.status,
  }))

  const candidatesDeVehicule: ConfigurationCandidate[] = candidatesVehicule.map(
    (configuration) => ({
      id: configuration.id,
      vehicule: libelleVehicule({
        marque: configuration.generation.model.make.name,
        modele: configuration.generation.model.name,
        generation: configuration.generation.name,
      }),
      equipement: [
        configuration.equipment.label,
        configuration.headlampRef,
        configuration.label,
      ]
        .filter(Boolean)
        .join(' · '),
      active: configuration.active,
    }),
  )

  /*
    Les visuels, dans l'ordre où la boutique les montrera : par groupe de rôle,
    puis par position. Les trier ici — et non « par position » comme le faisait
    cet écran — est ce qui donne un sens aux flèches de déplacement. Tant que
    l'administration classait autrement que la galerie, « monter » une image ne
    disait rien de précis.
  */
  const visuels: VisuelFiche[] = ordreAffichage(
    product.media.map((entry) => ({
      id: entry.id,
      role: entry.role,
      position: entry.position,
      entry,
    })),
  ).map(({ entry }) => ({
    attachmentId: entry.id,
    mediaId: entry.media.id,
    url: entry.media.url,
    alt: entry.media.alt,
    caption: entry.media.caption,
    nature: entry.media.nature,
    mimeType: entry.media.mimeType,
    role: entry.role,
    /*
      Emplacements où le fichier sert ailleurs qu'ici — ce rattachement est
      retiré du compte. C'est ce nombre qui autorise l'écran à proposer la
      suppression du fichier en même temps que son retrait ; le serveur
      revérifie, parce qu'entre l'affichage et le clic une autre fiche a pu le
      reprendre.
    */
    autresUsages:
      entry.media._count.products -
      1 +
      entry.media._count.categoryHeroes +
      entry.media._count.vehicleMakeLogos +
      entry.media._count.equipmentIllustrations +
      entry.media._count.vehicleGenerationPhotos,
  }))

  // Le dépôt de fichier n'est proposé que si le stockage tient debout : écrire
  // sur un disque éphémère ferait disparaître la photo au déploiement suivant,
  // sans erreur et sans trace.
  const stockage = storageStatus()
  const mediatheque = mayEdit ? await listAttachableMedia(product.id) : []

  return (
    <div className="container-page py-6">
      <Breadcrumb
        items={[
          { label: 'Administration', href: '/admin' },
          { label: 'Catalogue', href: '/admin/catalogue' },
          { label: product.name },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[1.5rem] leading-tight font-extrabold">{product.name}</h1>
        <Badge tone={STATUS_TONES[product.status] ?? 'neutral'}>
          {STATUS_LABELS[product.status] ?? product.status}
        </Badge>
        {product.isDemo ? <Badge tone="warn">démo</Badge> : null}
        {/*
          La fiche publique n'existe que pour un produit publié : `getProduct`
          filtre sur PUBLISHED et la route /p/[slug] répond 404 sinon. On ne
          propose donc pas un lien qui mènerait à une page d'erreur.
        */}
        {product.status === 'PUBLISHED' ? (
          <Link
            href={`/p/${product.slug}`}
            className="inline-flex min-h-9 items-center text-sm font-semibold text-brand underline underline-offset-4"
          >
            Voir sur la boutique
          </Link>
        ) : product.status === 'DRAFT' ? (
          /*
            Un brouillon n'a pas de page publique, mais il a désormais un
            aperçu : la vraie fiche, avec le vrai gabarit, réservée à l'équipe.
            On publiait jusqu'ici sans avoir vu.
          */
          <Link
            href={`/p/${product.slug}?apercu=1`}
            className="inline-flex min-h-9 items-center text-sm font-semibold text-brand underline underline-offset-4"
          >
            Aperçu avant publication
          </Link>
        ) : (
          <span className="text-sm text-muted">
            Produit archivé : la boutique ne le sert plus.
          </span>
        )}
      </header>

      {/* --- Ce qui manque ------------------------------------------------ */}
      <ReleveDesManques manques={manques} status={product.status} />

      {/* --- Édition ------------------------------------------------------ */}
      <section aria-labelledby="produit-edition" className="mt-6">
        <h2 id="produit-edition" className="text-base font-bold">
          Modifier
        </h2>
        <ProductStatusForm productId={product.id} status={product.status} bloquants={bloquants} />
        <ProductInfoForm
          productId={product.id}
          tagline={product.tagline}
          metaTitle={product.metaTitle}
          metaDescription={product.metaDescription}
          categories={categoriesOptions}
          selectedCategoryIds={product.categories.map((entry) => entry.categoryId)}
          featured={product.featured}
        />
      </section>

      {/* --- Identité ------------------------------------------------------ */}
      <section aria-labelledby="produit-identite" className="mt-6">
        <h2 id="produit-identite" className="text-base font-bold">
          Identité
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Ces champs décrivent le produit, et quatre d&apos;entre eux décident d&apos;où il
          apparaît : le culot alimente le menu et la recherche par culot, la teinte une facette,
          le type de véhicule les parcours auto et moto, le niveau de montage la section
          «&nbsp;Montage&nbsp;».
        </p>
        <IdentiteForm
          productId={product.id}
          valeurs={{
            name: product.name,
            brand: product.brand ?? '',
            bulbBase: product.bulbBase ?? '',
            temperature: product.colorTemperature === null ? '' : String(product.colorTemperature),
            difficulty: product.difficulty,
            vehicleType: product.vehicleType,
          }}
          mayEdit={mayEdit}
        />
        <AdresseForm
          productId={product.id}
          slug={product.slug}
          statut={product.status}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Textes -------------------------------------------------------- */}
      <section aria-labelledby="produit-textes" className="mt-6">
        <h2 id="produit-textes" className="text-base font-bold">
          Textes
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          La description courte sous-titre le bloc de comparaison des teintes ; le rédactionnel
          long est la section «&nbsp;La référence&nbsp;». Sans l&apos;un ni l&apos;autre, la fiche
          n&apos;a aucun texte à lire.
        </p>
        <RedactionnelForm
          productId={product.id}
          description={product.description ?? ''}
          body={product.body ?? ''}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Conditionnements ---------------------------------------------- */}
      <section aria-labelledby="produit-variantes" className="mt-6">
        <h2 id="produit-variantes" className="text-base font-bold">
          Conditionnements
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          C&apos;est ce bloc qui fait vendre la fiche : le prix, le taux de TVA et le stock. Le
          stock d&apos;un kit n&apos;est pas saisi, il se calcule depuis ses composants.
        </p>
        <ProductVariantsManager
          productId={product.id}
          variantes={variantes}
          tauxTva={tauxTva}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Composition des kits ------------------------------------------ */}
      <section aria-labelledby="produit-composition" className="mt-6">
        <h2 id="produit-composition" className="text-base font-bold">
          Composition des kits
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Dès qu&apos;un conditionnement a un composant, la boutique cesse de lire le stock saisi
          sur lui : elle calcule combien de kits ses composants indispensables permettent de
          monter, réserve les composants à la commande, et liste les pièces à prendre en rayon.
          Une quantité fausse ici ne fait pas un affichage faux, elle fait une vente qu&apos;on ne
          peut pas honorer.
        </p>
        <ProductKitManager
          conditionnements={conditionnementsComposables}
          kitCible={kitCible}
          terme={termeComposant}
          candidats={candidatsDeComposant}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Compléments facultatifs --------------------------------------- */}
      <section aria-labelledby="produit-complements" className="mt-6">
        <h2 id="produit-complements" className="text-base font-bold">
          Compléments facultatifs
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Le bloc «&nbsp;Complétez votre commande&nbsp;» de la fiche, sous l&apos;achat : c&apos;est
          là que se vendent l&apos;adaptateur et le décodeur dont le montage a besoin. Un
          complément déjà fourni par le pack retenu disparaît de lui-même.
        </p>
        <ProductAddonsManager
          productId={product.id}
          complements={complements}
          terme={termeComplement}
          candidats={candidatsDeComplement}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Compatibilités ----------------------------------------------- */}
      <section aria-labelledby="produit-compatibilites" className="mt-6">
        <h2 id="produit-compatibilites" className="text-base font-bold">
          Compatibilités
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Sans compatibilité documentée, le parcours véhicule ne proposera jamais cette
          référence. Les mêmes règles qu&apos;à l&apos;écran Véhicules s&apos;appliquent :
          «&nbsp;confirmée&nbsp;» demande une source et une date, et l&apos;absence de ligne vaut
          «&nbsp;à vérifier&nbsp;», jamais «&nbsp;incompatible&nbsp;».
        </p>
        <ProductFitmentsManager
          conditionnements={conditionnementsCompatibles}
          emplacements={emplacements.map((emplacement) => ({
            id: emplacement.id,
            label: emplacement.label,
          }))}
          compatCible={compatCible}
          terme={termeVehicule}
          candidates={candidatesDeVehicule}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Visuels ------------------------------------------------------ */}
      <section aria-labelledby="produit-visuels" className="mt-6">
        <h2 id="produit-visuels" className="text-base font-bold">
          Visuels
        </h2>
        {/*
          Ajouter, ordonner, décrire et retirer se font ici, à l'endroit où
          l'absence est constatée. Le texte alternatif aussi : le voir manquer
          dans un écran et le corriger dans un autre, c'est ce qui fait qu'on ne
          le corrige jamais.
        */}
        <ProductMediaManager
          productId={product.id}
          visuels={visuels}
          mediatheque={mediatheque}
          maxBytes={MAX_UPLOAD_BYTES}
          stockageOk={stockage.ok}
          stockageProbleme={stockage.problem}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Caractéristiques --------------------------------------------- */}
      <section aria-labelledby="produit-specs" className="mt-6">
        <h2 id="produit-specs" className="text-base font-bold">
          Caractéristiques
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Ce que le client vérifie avant d&apos;acheter. Elles s&apos;affichent sur la fiche dans
          cet ordre, et un libellé ne peut pas y figurer deux fois.
        </p>
        <ProductSpecsManager productId={product.id} specs={specs} mayEdit={mayEdit} />
      </section>

      {/* --- Questions fréquentes ------------------------------------------ */}
      <section aria-labelledby="produit-faq" className="mt-6">
        <h2 id="produit-faq" className="text-base font-bold">
          Questions fréquentes
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Elles s&apos;affichent sur la fiche et partent dans les données structurées que les
          moteurs peuvent reprendre : une question posée deux fois y serait reprise deux fois.
        </p>
        <ProductFaqManager productId={product.id} questions={questions} mayEdit={mayEdit} />
      </section>

      {/* --- Guides de montage -------------------------------------------- */}
      <section aria-labelledby="produit-guides" className="mt-6">
        <h2 id="produit-guides" className="text-base font-bold">
          Guides de montage
        </h2>
        <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">
          Un guide est rédigé une fois et sert à plusieurs produits : on le rattache ici, on ne
          l&apos;écrit pas.
        </p>
        <ProductGuidesManager
          productId={product.id}
          rattaches={guidesRattaches}
          disponibles={guidesDisponibles}
          mayEdit={mayEdit}
        />
      </section>

      {/* --- Informations techniques --------------------------------------- */}
      <section aria-labelledby="produit-infos" className="mt-6">
        <h2 id="produit-infos" className="text-base font-bold">
          Informations
        </h2>
        {/*
          Ce qui reste ici ne s'édite pas, par nature : un identifiant de base
          et une date de modification. Tout le reste a rejoint le formulaire
          qui l'écrit — voir un champ « non renseigné » dans un écran et le
          corriger dans un autre, c'est ce qui fait qu'on ne le corrige jamais.
        */}
        <dl className="mt-2 rounded-md border border-line border-t-0 bg-white">
          <InfoRow label="Identifiant interne">
            <span className="font-mono text-xs">{product.id}</span>
          </InfoRow>
          <InfoRow label="Rubriques">
            {categoryNames.length > 0 ? categoryNames.join(', ') : <Unset />}
          </InfoRow>
          <InfoRow label="Modifié le">{dateFormatter.format(product.updatedAt)}</InfoRow>
        </dl>
      </section>
    </div>
  )
}

/**
 * Ce qui manque à la fiche, et ce qui interdit de la publier.
 *
 * L'écran disait déjà « non renseigné » champ par champ — utile quand on lit
 * une fiche en entier, inutile quand il faut savoir laquelle est prête. Le
 * relevé répond à la question de la publication : ce qui bloque d'abord, ce
 * qui dessert ensuite, le confort en dernier.
 *
 * Il ne corrige rien et ne publie rien : c'est une liste de travail.
 */
function ReleveDesManques({ manques, status }: { manques: Manque[]; status: string }) {
  if (manques.length === 0) {
    return (
      <Alert tone="ok" title="Rien ne manque" className="mt-5">
        Prix, TVA, rubrique, visuels, caractéristiques et textes sont renseignés.
      </Alert>
    )
  }

  const bloquants = manques.filter((manque) => manque.niveau === 'bloquant')
  const importants = manques.filter((manque) => manque.niveau === 'important')
  const conforts = manques.filter((manque) => manque.niveau === 'confort')

  const groupes = [
    {
      cle: 'bloquant',
      titre:
        status === 'PUBLISHED'
          ? `${bloquants.length} problème${bloquants.length > 1 ? 's' : ''} à corriger — la fiche est en ligne`
          : `${bloquants.length} point${bloquants.length > 1 ? 's' : ''} à régler avant publication`,
      items: bloquants,
      ton: 'danger' as const,
    },
    {
      cle: 'important',
      titre: `${importants.length} manque${importants.length > 1 ? 's' : ''} qui dessert${importants.length > 1 ? 'ent' : ''} la fiche`,
      items: importants,
      ton: 'warn' as const,
    },
    {
      cle: 'confort',
      titre: 'À compléter quand vous aurez le temps',
      items: conforts,
      ton: 'info' as const,
    },
  ].filter((groupe) => groupe.items.length > 0)

  return (
    <div className="mt-5 space-y-3">
      {groupes.map((groupe) => (
        <Alert key={groupe.cle} tone={groupe.ton} title={groupe.titre}>
          <ul className="mt-1 space-y-1">
            {groupe.items.map((manque) => (
              <li key={manque.champ}>
                <strong className="font-semibold">{manque.champ}</strong> — {manque.consequence}
              </li>
            ))}
          </ul>
        </Alert>
      ))}
    </div>
  )
}
