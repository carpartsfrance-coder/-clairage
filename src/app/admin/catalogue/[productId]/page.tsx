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
import { ButtonLink } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Surface'
import { ProductTabs } from '@/components/admin/ProductTabs'
import {
  cibleDuManque,
  ongletDemande,
  ongletsAvecManque,
  type OngletValue,
} from '@/lib/admin/onglets-produit'
import { releverManques, type Manque } from '@/lib/admin/completeness'
import { ordreAffichage } from '@/lib/admin/media-order'
import { ProductStatusForm, PublicationForm, SeoForm } from '@/components/admin/ProductEditor'
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
  const onglet = ongletDemande(unSeul(requete, 'onglet'))

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

  const compteurs: Partial<Record<OngletValue, number>> = {
    medias: product.media.length,
    prix: product.variants.length,
    compat: conditionnementsCompatibles.reduce(
      (somme, bloc) => somme + bloc.compatibilites.length,
      0,
    ),
    carac: specs.length,
  }

  const vignette = visuels[0] ?? null

  return (
    <div className="container-page py-6">
      <Breadcrumb
        items={[
          { label: 'Administration', href: '/admin' },
          { label: 'Catalogue', href: '/admin/catalogue' },
          { label: product.name },
        ]}
      />

      {/* --- En-tête ------------------------------------------------------- */}
      <header className="mt-4 flex flex-wrap items-start gap-4">
        {/*
          La vignette est celle que le catalogue affiche : c'est le repère le
          plus rapide quand on travaille sur plusieurs fiches ouvertes, et son
          absence est en soi une information.
        */}
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface-soft">
          {vignette ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={vignette.url}
              alt=""
              className="size-full object-contain"
              width={64}
              height={64}
            />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-muted">
              Aucun visuel
            </span>
          )}
        </div>

        {/*
          `basis-60` plutôt que `flex-1` seul : sans largeur de base, le titre
          se laisse comprimer par le bouton voisin et un nom de produit un peu
          long se casse en un mot par ligne sous 420 px. Avec elle, le bouton
          passe à la ligne suivante, ce qui est le bon arbitrage — le titre dit
          sur quoi on travaille.
        */}
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.5rem] leading-tight font-extrabold">{product.name}</h1>
            <Badge tone={STATUS_TONES[product.status] ?? 'neutral'}>
              {STATUS_LABELS[product.status] ?? product.status}
            </Badge>
            {product.isDemo ? <Badge tone="warn">démo</Badge> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-strong">
            <span className="font-mono">{product.variants[0]?.sku ?? 'Sans référence'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {product.variants.length} conditionnement{product.variants.length > 1 ? 's' : ''}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/*
            La fiche publique n'existe que pour un produit publié : `getProduct`
            filtre sur PUBLISHED et la route /p/[slug] répond 404 sinon. Un
            brouillon a son aperçu, réservé à l'équipe.
          */}
          {product.status === 'PUBLISHED' ? (
            <ButtonLink href={`/p/${product.slug}`} size="sm" variant="secondary">
              Voir sur la boutique
            </ButtonLink>
          ) : product.status === 'DRAFT' ? (
            <ButtonLink href={`/p/${product.slug}?apercu=1`} size="sm" variant="secondary">
              Aperçu avant publication
            </ButtonLink>
          ) : (
            <span className="text-xs text-muted">Archivé : la boutique ne le sert plus.</span>
          )}
        </div>
      </header>

      <ProductTabs
        productId={product.id}
        actif={onglet}
        compteurs={compteurs}
        marques={ongletsAvecManque(manques)}
      />

      {/*
        Deux colonnes : le travail à gauche, ce qu'on vérifie en travaillant à
        droite. La colonne de droite ne dépend pas de l'onglet — statut,
        rubriques et identifiants se consultent pendant qu'on remplit autre
        chose, et le relevé des manques doit rester visible depuis l'onglet
        qu'il désigne.
      */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {onglet === 'fiche' ? (
            <>
              <Bloc
                titre="Identité du produit"
                description="Ces champs décrivent le produit, et quatre d’entre eux décident d’où il apparaît : le culot alimente le menu et la recherche par culot, la teinte une facette, le type de véhicule les parcours auto et moto, le niveau de montage la section « Montage »."
              >
                <IdentiteForm
                  productId={product.id}
                  valeurs={{
                    name: product.name,
                    tagline: product.tagline ?? '',
                    brand: product.brand ?? '',
                    bulbBase: product.bulbBase ?? '',
                    temperature:
                      product.colorTemperature === null ? '' : String(product.colorTemperature),
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
              </Bloc>

              <Bloc
                titre="Contenu commercial"
                description="La description courte sous-titre le bloc de comparaison des teintes ; le rédactionnel long est la section « La référence ». Sans l’un ni l’autre, la fiche n’a aucun texte à lire."
              >
                <RedactionnelForm
                  productId={product.id}
                  description={product.description ?? ''}
                  body={product.body ?? ''}
                  mayEdit={mayEdit}
                />
              </Bloc>

              <Bloc
                titre="Questions et montage"
                description="Les questions s’affichent sur la fiche et partent dans les données structurées que les moteurs peuvent reprendre. Un guide est rédigé une fois et sert à plusieurs produits : on le rattache ici, on ne l’écrit pas."
              >
                <h3 className="text-sm font-semibold">Questions fréquentes</h3>
                <ProductFaqManager
                  productId={product.id}
                  questions={questions}
                  mayEdit={mayEdit}
                />
                <h3 className="mt-5 border-t border-line pt-4 text-sm font-semibold">
                  Guides de montage
                </h3>
                <ProductGuidesManager
                  productId={product.id}
                  rattaches={guidesRattaches}
                  disponibles={guidesDisponibles}
                  mayEdit={mayEdit}
                />
              </Bloc>

              <Bloc
                titre="Compléments facultatifs"
                description="Le bloc « Complétez votre commande » de la fiche, sous l’achat : c’est là que se vendent l’adaptateur et le décodeur dont le montage a besoin. Un complément déjà fourni par le pack retenu disparaît de lui-même."
              >
                <ProductAddonsManager
                  productId={product.id}
                  complements={complements}
                  terme={termeComplement}
                  candidats={candidatsDeComplement}
                  mayEdit={mayEdit}
                />
              </Bloc>
            </>
          ) : null}

          {onglet === 'medias' ? (
            <Bloc
              titre="Visuels"
              description="Ajouter, ordonner, décrire et retirer se font ici, à l’endroit où l’absence est constatée. Le texte alternatif aussi : le voir manquer dans un écran et le corriger dans un autre, c’est ce qui fait qu’on ne le corrige jamais."
            >
              <ProductMediaManager
                productId={product.id}
                visuels={visuels}
                mediatheque={mediatheque}
                maxBytes={MAX_UPLOAD_BYTES}
                stockageOk={stockage.ok}
                stockageProbleme={stockage.problem}
                mayEdit={mayEdit}
              />
            </Bloc>
          ) : null}

          {onglet === 'prix' ? (
            <>
              <Bloc
                titre="Conditionnements"
                description="C’est ce bloc qui fait vendre la fiche : le prix, le taux de TVA et le stock. Le stock d’un kit n’est pas saisi, il se calcule depuis ses composants."
              >
                <ProductVariantsManager
                  productId={product.id}
                  variantes={variantes}
                  tauxTva={tauxTva}
                  mayEdit={mayEdit}
                />
              </Bloc>

              <Bloc
                titre="Composition des kits"
                description="Dès qu’un conditionnement a un composant, la boutique cesse de lire le stock saisi sur lui : elle calcule combien de kits ses composants indispensables permettent de monter, réserve les composants à la commande, et liste les pièces à prendre en rayon. Une quantité fausse ici ne fait pas un affichage faux, elle fait une vente qu’on ne peut pas honorer."
                id="produit-composition"
              >
                <ProductKitManager
                  conditionnements={conditionnementsComposables}
                  kitCible={kitCible}
                  terme={termeComposant}
                  candidats={candidatsDeComposant}
                  mayEdit={mayEdit}
                />
              </Bloc>
            </>
          ) : null}

          {onglet === 'compat' ? (
            <Bloc
              titre="Compatibilités"
              description="Sans compatibilité documentée, le parcours véhicule ne proposera jamais cette référence. Les mêmes règles qu’à l’écran Véhicules s’appliquent : « confirmée » demande une source et une date, et l’absence de ligne vaut « à vérifier », jamais « incompatible »."
            >
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
            </Bloc>
          ) : null}

          {onglet === 'carac' ? (
            <Bloc
              titre="Caractéristiques"
              description="Ce que le client vérifie avant d’acheter. Elles s’affichent sur la fiche dans cet ordre, et un libellé ne peut pas y figurer deux fois."
            >
              <ProductSpecsManager productId={product.id} specs={specs} mayEdit={mayEdit} />
            </Bloc>
          ) : null}

          {onglet === 'seo' ? (
            <Bloc
              titre="Référencement"
              description="Ce que les moteurs affichent dans leurs résultats. Ni l’un ni l’autre n’apparaît sur la fiche elle-même : le titre de la page et son extrait se décident ici."
            >
              {mayEdit ? (
                <SeoForm
                  productId={product.id}
                  metaTitle={product.metaTitle}
                  metaDescription={product.metaDescription}
                  nomProduit={product.name}
                />
              ) : (
                <dl className="rounded-md border border-line bg-white">
                  <InfoRow label="Titre de référencement">
                    {product.metaTitle ?? <Unset />}
                  </InfoRow>
                  <InfoRow label="Description de référencement">
                    {product.metaDescription ?? <Unset />}
                  </InfoRow>
                </dl>
              )}
            </Bloc>
          ) : null}
        </div>

        {/* --- Colonne de droite --------------------------------------------- */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <ReleveDesManques manques={manques} status={product.status} productId={product.id} />

          <Card className="p-4">
            <h2 className="text-sm font-bold">Publication</h2>
            <ProductStatusForm
              productId={product.id}
              status={product.status}
              bloquants={bloquants}
            />
            {mayEdit ? (
              <div className="mt-4 border-t border-line pt-4">
                <PublicationForm
                  productId={product.id}
                  categories={categoriesOptions}
                  selectedCategoryIds={product.categories.map((entry) => entry.categoryId)}
                  featured={product.featured}
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-strong">
                Rubriques : {categoryNames.length > 0 ? categoryNames.join(', ') : 'aucune'}
              </p>
            )}
          </Card>

          {/*
            Ce qui reste ici ne s'édite pas, par nature : un identifiant de base
            et une date de modification. Tout le reste a rejoint le formulaire
            qui l'écrit.
          */}
          <Card className="p-4">
            <h2 className="text-sm font-bold">Informations techniques</h2>
            <dl className="mt-2 flex flex-col gap-2 text-xs">
              <div>
                <dt className="font-semibold text-muted-strong">Identifiant interne</dt>
                <dd className="font-mono break-all">{product.id}</dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-strong">Modifié le</dt>
                <dd>{dateFormatter.format(product.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/**
 * Une section de l'onglet courant : titre, pourquoi elle compte, contenu.
 *
 * Le même cadre pour toutes, parce que la fiche en compte neuf réparties sur
 * six onglets : une mise en page par section rendrait chaque changement
 * d'onglet illisible.
 */
function Bloc({
  titre,
  description,
  id,
  children,
}: {
  titre: string
  description: string
  id?: string
  children: ReactNode
}) {
  return (
    <Card as="section" id={id} className="p-4">
      <h2 className="text-base font-bold">{titre}</h2>
      <p className="mt-1 max-w-[70ch] text-xs text-muted-strong">{description}</p>
      {children}
    </Card>
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
 * Depuis le passage aux onglets, chaque ligne porte le lien qui ouvre
 * l'onglet où elle se corrige. C'est devenu nécessaire : le relevé est dans
 * la colonne de droite, et ce qu'il reproche peut être à trois onglets de là.
 * Les manques qui se corrigent dans cette même colonne — la rubrique — n'ont
 * pas de lien : il n'y a nulle part où aller.
 *
 * Il ne corrige rien et ne publie rien : c'est une liste de travail.
 */
function ReleveDesManques({
  manques,
  status,
  productId,
}: {
  manques: Manque[]
  status: string
  productId: string
}) {
  if (manques.length === 0) {
    return (
      <Alert tone="ok" title="Rien ne manque">
        Prix, TVA, rubrique, visuels, caractéristiques et textes sont renseignés.
      </Alert>
    )
  }

  const bloquants = manques.filter((manque) => manque.niveau === 'bloquant')
  const titre =
    bloquants.length > 0
      ? status === 'PUBLISHED'
        ? `${bloquants.length} problème${bloquants.length > 1 ? 's' : ''} à corriger — la fiche est en ligne`
        : `${bloquants.length} point${bloquants.length > 1 ? 's' : ''} à régler avant publication`
      : `${manques.length} point${manques.length > 1 ? 's' : ''} à compléter`

  const TONS: Record<Manque['niveau'], string> = {
    bloquant: 'bg-danger',
    important: 'bg-warn',
    confort: 'bg-info',
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold">{titre}</h2>
        <p className="mt-0.5 text-xs text-muted-strong">
          {bloquants.length > 0
            ? 'Le serveur refuse la publication tant qu’ils ne sont pas réglés.'
            : 'Recommandations : la fiche reste publiable.'}
        </p>
      </div>

      <ul>
        {manques.map((manque) => {
          const cible = cibleDuManque(manque.champ)
          return (
            <li key={manque.champ} className="border-b border-line px-4 py-3 last:border-b-0">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONS[manque.niveau]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold break-words">{manque.champ}</p>
                  <p className="mt-0.5 text-xs text-muted-strong">{manque.consequence}</p>
                  {cible?.onglet ? (
                    <Link
                      href={`/admin/catalogue/${productId}?onglet=${cible.onglet}`}
                      className="mt-1 inline-block text-xs font-semibold text-brand underline underline-offset-4"
                    >
                      {cible.libelle} →
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
