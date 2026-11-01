import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import {
  getAdminProduct,
  listAttachableMedia,
  listCategoryOptions,
  listVatRates,
} from '@/lib/queries/admin'
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
 * Les compatibilités et les caractéristiques restent en lecture ici — les
 * premières s'éditent depuis l'écran Véhicules, où l'on travaille génération
 * par génération.
 */

type PageProps = { params: Promise<{ productId: string }> }

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

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  CAR: 'Voiture',
  MOTORCYCLE: 'Moto',
  BOTH: 'Voiture et moto',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: 'Montage simple',
  MEDIUM: 'Montage intermédiaire',
  HARD: 'Montage difficile',
}

const FITMENT_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  CONFIRMED: { label: 'Confirmée', tone: 'ok' },
  UNKNOWN: { label: 'À vérifier', tone: 'warn' },
  INCOMPATIBLE: { label: 'Incompatible', tone: 'danger' },
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

const TH = 'px-3 py-2 text-left font-semibold'
const TH_NUM = 'px-3 py-2 text-right font-semibold'

export default async function AdminProductPage({ params }: PageProps) {
  const staff = await requireStaff('catalog.view')
  const { productId } = await params
  const product = await getAdminProduct(productId)
  if (!product) notFound()

  // La lecture suffit pour consulter la fiche ; poser un visuel demande le
  // droit d'écriture. On masque ce qui serait refusé plutôt que d'offrir un
  // formulaire qui échouera — la garde reste dans l'action.
  const mayEdit = can(staff.role, 'catalog.edit')

  const manques = releverManques(product)
  const bloquants = manques
    .filter((manque) => manque.niveau === 'bloquant')
    .map((manque) => manque.champ)
  const categoryNames = product.categories.map((entry) => entry.category.name)

  // Rubriques proposées à l'édition, et taux de TVA disponibles. Les deux
  // listes servent aussi à l'écran de création : elles vivent dans les
  // requêtes, pas ici.
  const [categoriesOptions, tauxTva] = await Promise.all([listCategoryOptions(), listVatRates()])

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

      {/* --- Informations ------------------------------------------------- */}
      <section aria-labelledby="produit-infos" className="mt-5">
        <h2 id="produit-infos" className="text-base font-bold">
          Informations
        </h2>
        <dl className="mt-2 rounded-md border border-line border-t-0 bg-white">
          <InfoRow label="Identifiant interne">
            <span className="font-mono text-xs">{product.id}</span>
          </InfoRow>
          <InfoRow label="Slug">
            <span className="font-mono text-xs">{product.slug}</span>
          </InfoRow>
          <InfoRow label="Marque">{product.brand ?? <Unset />}</InfoRow>
          <InfoRow label="Culot">{product.bulbBase ?? <Unset />}</InfoRow>
          <InfoRow label="Température de couleur">
            {product.colorTemperature ? `${product.colorTemperature} K` : <Unset />}
          </InfoRow>
          <InfoRow label="Type de véhicule">
            {VEHICLE_TYPE_LABELS[product.vehicleType] ?? <Unset />}
          </InfoRow>
          <InfoRow label="Difficulté de montage">
            {DIFFICULTY_LABELS[product.difficulty] ?? <Unset />}
          </InfoRow>
          <InfoRow label="Catégories">
            {categoryNames.length > 0 ? categoryNames.join(', ') : <Unset />}
          </InfoRow>
          <InfoRow label="Titre SEO">{product.metaTitle ?? <Unset />}</InfoRow>
          <InfoRow label="Description SEO">{product.metaDescription ?? <Unset />}</InfoRow>
          <InfoRow label="Modifié le">{dateFormatter.format(product.updatedAt)}</InfoRow>
        </dl>
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

      {/* --- Compatibilités ----------------------------------------------- */}
      <section aria-labelledby="produit-compatibilites" className="mt-6">
        <h2 id="produit-compatibilites" className="text-base font-bold">
          Compatibilités
        </h2>
        {product.variants.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">
            Aucune variante : il n&apos;y a donc aucune compatibilité à documenter.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            {product.variants.map((variant) => (
              <div key={`fit-${variant.id}`}>
                <h3 className="text-sm font-semibold">
                  {variant.name} <span className="font-mono text-xs text-muted">{variant.sku}</span>
                </h3>
                {variant.fitments.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-strong">
                    Aucune compatibilité documentée pour cette référence.
                  </p>
                ) : (
                  <div className="mt-1 overflow-x-auto rounded-md border border-line">
                    <table className="w-full min-w-[72rem] border-collapse text-sm">
                      <thead className="bg-surface-soft text-xs text-muted-strong">
                        <tr>
                          <th scope="col" className={TH}>Véhicule</th>
                          <th scope="col" className={TH}>Emplacement</th>
                          <th scope="col" className={TH}>Statut</th>
                          <th scope="col" className={TH_NUM}>Quantité</th>
                          <th scope="col" className={TH}>Restrictions</th>
                          <th scope="col" className={TH}>Homologation</th>
                          <th scope="col" className={TH}>Source</th>
                          <th scope="col" className={TH}>Vérifié le</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variant.fitments.map((fitment) => {
                          const status =
                            FITMENT_LABELS[fitment.status] ?? FITMENT_LABELS.UNKNOWN
                          const generation = fitment.configuration.generation
                          const approval =
                            fitment.roadApproval === 'APPROVED'
                              ? `Homologué (${fitment.approvalMarket})`
                              : fitment.roadApproval === 'NOT_APPROVED'
                                ? `Non homologué (${fitment.approvalMarket})`
                                : `À confirmer (${fitment.approvalMarket})`

                          return (
                            <tr key={fitment.id} className="border-t border-line align-top">
                              <td className="px-3 py-2">
                                <span className="font-medium">
                                  {generation.model.make.name} {generation.name}
                                </span>
                                <span className="block text-xs text-muted">
                                  {fitment.configuration.equipment.label}
                                  {fitment.configuration.headlampRef
                                    ? ` · ${fitment.configuration.headlampRef}`
                                    : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2">{fitment.position.label}</td>
                              <td className="px-3 py-2">
                                <Badge tone={status.tone}>{status.label}</Badge>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {fitment.quantity}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {fitment.restrictions ?? <span className="text-muted">aucune</span>}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {approval}
                                {fitment.approvalNote ? (
                                  <span className="block text-muted">{fitment.approvalNote}</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {fitment.source ?? <Unset />}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-strong">
                                {fitment.verifiedAt ? (
                                  dateFormatter.format(fitment.verifiedAt)
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
        {product.specs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">Aucune caractéristique renseignée.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-soft text-xs text-muted-strong">
                <tr>
                  <th scope="col" className={TH}>Caractéristique</th>
                  <th scope="col" className={TH}>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {product.specs.map((spec) => (
                  <tr key={spec.id} className="border-t border-line">
                    <td className="px-3 py-2 text-muted-strong sm:w-72">{spec.label}</td>
                    <td className="px-3 py-2">{spec.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
