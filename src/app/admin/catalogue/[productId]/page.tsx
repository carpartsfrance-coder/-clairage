import { Fragment, type ReactNode } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { getAdminProduct } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Surface'
import { releverManques, type Manque } from '@/lib/admin/completeness'

/**
 * Fiche produit du back-office — lecture seule.
 *
 * Tout ce qui manque est dit « non renseigné » : une fiche d'administration
 * sert à repérer les trous (texte alternatif absent, compatibilité non
 * documentée, TVA manquante), pas à les masquer.
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

const PACKAGING_LABELS: Record<string, string> = {
  UNIT: "À l'unité",
  PAIR: 'La paire',
  PACK: 'Pack',
  KIT: 'Kit complet',
}

const FITMENT_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  CONFIRMED: { label: 'Confirmée', tone: 'ok' },
  UNKNOWN: { label: 'À vérifier', tone: 'warn' },
  INCOMPATIBLE: { label: 'Incompatible', tone: 'danger' },
}

const MEDIA_ROLE_LABELS: Record<string, string> = {
  PRODUCT: 'Produit',
  RESULT: 'Rendu',
  KIT_CONTENT: 'Contenu du kit',
  INSTALL: 'Montage',
}

const MEDIA_NATURE_LABELS: Record<string, string> = {
  UNSPECIFIED: 'Non précisée',
  PRODUCT_PHOTO: 'Photo du produit',
  ILLUSTRATION: 'Illustration',
  TEST_PHOTO: "Photo d'essai",
  DIAGRAM: 'Schéma',
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
  await requireStaff('catalog.view')
  const { productId } = await params
  const product = await getAdminProduct(productId)
  if (!product) notFound()

  const manques = releverManques(product)
  const categoryNames = product.categories.map((entry) => entry.category.name)
  const missingAltCount = product.media.filter((entry) => !entry.media.alt).length

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

      {/* --- Variantes ---------------------------------------------------- */}
      <section aria-labelledby="produit-variantes" className="mt-6">
        <h2 id="produit-variantes" className="text-base font-bold">
          Variantes
        </h2>
        {product.variants.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">
            Aucune variante : ce produit n&apos;est pas achetable en l&apos;état.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[68rem] border-collapse text-sm">
              <thead className="bg-surface-soft text-xs text-muted-strong">
                <tr>
                  <th scope="col" className={TH}>SKU</th>
                  <th scope="col" className={TH}>Nom</th>
                  <th scope="col" className={TH}>Conditionnement</th>
                  <th scope="col" className={TH_NUM}>Prix</th>
                  <th scope="col" className={TH}>TVA</th>
                  <th scope="col" className={TH_NUM}>Stock détenu</th>
                  <th scope="col" className={TH_NUM}>Réservé</th>
                  <th scope="col" className={TH_NUM}>Vendable</th>
                  <th scope="col" className={TH_NUM}>Seuil</th>
                  <th scope="col" className={TH}>Actif</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => {
                  const isKit = variant.components.length > 0
                  const sellable = Math.max(0, variant.stockOnHand - variant.stockReserved)

                  return (
                    <Fragment key={variant.id}>
                      <tr className="border-t border-line">
                        <td className="px-3 py-2 font-mono text-xs">{variant.sku}</td>
                        <td className="px-3 py-2 font-medium">{variant.name}</td>
                        <td className="px-3 py-2">
                          {PACKAGING_LABELS[variant.packaging] ?? variant.packaging}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPrice(variant.priceCents)}
                        </td>
                        <td className="px-3 py-2">{variant.vatRate?.label ?? <Unset />}</td>
                        {isKit ? (
                          <td colSpan={4} className="px-3 py-2 text-xs text-muted-strong">
                            Stock calculé depuis les composants
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{variant.stockOnHand}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{variant.stockReserved}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{sellable}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {variant.lowStockThreshold}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          {variant.active ? (
                            <Badge tone="ok">Actif</Badge>
                          ) : (
                            <Badge tone="neutral">Inactif</Badge>
                          )}
                        </td>
                      </tr>
                      {isKit ? (
                        <tr className="border-t border-line bg-surface-soft">
                          <td colSpan={10} className="px-3 py-2">
                            <p className="text-xs font-semibold text-muted-strong">Composants</p>
                            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                              {variant.components.map((entry) => (
                                <li key={entry.id}>
                                  {entry.quantity} × {entry.component.product.name} ·{' '}
                                  {entry.component.name}
                                  <span className="text-xs text-muted">
                                    {' '}
                                    ({entry.component.sku}
                                    {entry.required ? '' : ', facultatif'})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
        {product.media.length === 0 ? (
          <p className="mt-2 text-sm text-muted-strong">Aucun visuel associé à ce produit.</p>
        ) : (
          <>
            {missingAltCount > 0 ? (
              <p className="mt-2 text-sm font-medium text-warn">
                {missingAltCount} visuel{missingAltCount === 1 ? '' : 's'} sans texte alternatif.
              </p>
            ) : null}
            <ul className="mt-2 flex flex-col divide-y divide-line rounded-md border border-line">
              {product.media.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                  <Image
                    src={entry.media.url}
                    alt=""
                    width={64}
                    height={64}
                    className="size-16 shrink-0 rounded-sm border border-line bg-surface-muted object-contain"
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {MEDIA_ROLE_LABELS[entry.role] ?? entry.role}
                      <span className="text-xs font-normal text-muted">
                        {' '}
                        · {MEDIA_NATURE_LABELS[entry.media.nature] ?? entry.media.nature}
                      </span>
                    </p>
                    {entry.media.alt ? (
                      <p className="text-xs text-muted-strong break-words">{entry.media.alt}</p>
                    ) : (
                      <p className="text-xs font-medium text-warn">Texte alternatif manquant</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
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
