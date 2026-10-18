import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getSelectedVehicle } from '@/lib/session'
import { fitmentSortWeight, type FitmentStatus } from '@/lib/fitment'
import { cn } from '@/lib/cn'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { VehicleBar } from '@/components/vehicle/VehicleBar'
import { FitmentBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { formatPrice } from '@/lib/identity'
import { Alert, EmptyState } from '@/components/ui/Surface'
import { IconCar } from '@/components/ui/icons'

export const metadata: Metadata = {
  title: 'Les éclairages pour votre véhicule',
  robots: { index: false, follow: false },
}

/**
 * Résultats par emplacement pour le véhicule sélectionné.
 *
 * La page n'est pas une liste de produits : c'est une lecture de compatibilités.
 * C'est pourquoi elle n'emploie pas ProductCard — ici, le statut structure la
 * lecture, et les lignes incompatibles restent visibles parce que savoir ce qui
 * ne convient pas fait partie de la réponse.
 */

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

type ResultLine = {
  id: string
  status: FitmentStatus
  quantity: number
  restrictions: string | null
  source: string | null
  verifiedAt: Date | null
  variantName: string
  priceCents: number
  /** Vrai quand ce conditionnement contient d'autres références (kit). */
  isKit: boolean
}

/**
 * Un produit, et les conditionnements qui conviennent à cet emplacement.
 *
 * Le regroupement est le point important : un même produit proposé en
 * « ampoules seules » et en « kit complet » occupait deux lignes identiques à
 * la photo et au nom près, et il fallait les comparer de l'œil pour voir ce qui
 * les distinguait. Une carte par produit, les conditionnements à l'intérieur.
 */
type ResultProduct = {
  productSlug: string
  productName: string
  imageUrl: string | null
  /** Le meilleur statut parmi les conditionnements : il mène la carte. */
  status: FitmentStatus
  lines: ResultLine[]
}

type PositionGroup = {
  code: string
  label: string
  products: ResultProduct[]
}

/**
 * Lecture directe des compatibilités, groupées par emplacement.
 *
 * Exception assumée au passage par src/lib/queries/ : cette lecture ne sert
 * qu'à cette page, et son regroupement par emplacement n'a pas d'autre usage.
 *
 * `null` en retour signifie « lecture impossible », ce qui n'est pas la même
 * chose qu'un tableau vide (« rien de documenté ») : confondre les deux
 * afficherait une absence de données là où il y a une panne.
 */
async function getByPosition(configurationId: string): Promise<PositionGroup[] | null> {
  try {
    const rows = await prisma.fitment.findMany({
      where: { configurationId, variant: { active: true, product: { status: 'PUBLISHED' } } },
      include: {
        position: true,
        variant: {
          include: {
            components: { select: { id: true } },
            product: {
              include: {
                media: {
                  where: { role: 'PRODUCT' },
                  orderBy: { position: 'asc' },
                  take: 1,
                  include: { media: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ position: { position: 'asc' } }],
    })

    // Map plutôt qu'un objet : elle conserve l'ordre d'insertion, donc l'ordre
    // des emplacements voulu par la requête.
    const groups = new Map<string, PositionGroup>()

    for (const row of rows) {
      const group = groups.get(row.position.code) ?? {
        code: row.position.code,
        label: row.position.label,
        products: [],
      }

      const slug = row.variant.product.slug
      let product = group.products.find((entry) => entry.productSlug === slug)
      if (!product) {
        product = {
          productSlug: slug,
          productName: row.variant.product.name,
          imageUrl: row.variant.product.media[0]?.media.url ?? null,
          status: row.status,
          lines: [],
        }
        group.products.push(product)
      }

      product.lines.push({
        id: row.id,
        status: row.status,
        quantity: row.quantity,
        restrictions: row.restrictions,
        source: row.source,
        verifiedAt: row.verifiedAt,
        variantName: row.variant.name,
        priceCents: row.variant.priceCents,
        isKit: row.variant.components.length > 0,
      })

      // Le statut de la carte est le MEILLEUR de ses conditionnements : si un
      // kit convient, le produit convient — c'est le conditionnement qui ne
      // convient pas, et on le dit sur sa ligne.
      if (fitmentSortWeight[row.status] < fitmentSortWeight[product.status]) {
        product.status = row.status
      }

      groups.set(row.position.code, group)
    }

    for (const group of groups.values()) {
      for (const product of group.products) {
        product.lines.sort(
          (a, b) =>
            fitmentSortWeight[a.status] - fitmentSortWeight[b.status] ||
            a.priceCents - b.priceCents,
        )
      }
      group.products.sort(
        (a, b) =>
          fitmentSortWeight[a.status] - fitmentSortWeight[b.status] ||
          a.productName.localeCompare(b.productName, 'fr'),
      )
    }

    return [...groups.values()]
  } catch (error) {
    console.error('[vehicule/resultats]', error)
    return null
  }
}

export default async function Page() {
  const vehicle = await getSelectedVehicle()

  if (!vehicle) {
    return (
      <div className="container-page flex flex-col gap-6 py-10">
        <Breadcrumb
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Mon véhicule', href: '/vehicule' },
            { label: 'Mes éclairages' },
          ]}
        />
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          Les éclairages pour votre véhicule
        </h1>
        <EmptyState
          icon={<IconCar className="size-8" />}
          title="Aucun véhicule sélectionné."
          description="Cette page montre les compatibilités d'un véhicule précis. Sans lui, rien ne peut être affirmé : indiquez votre marque, votre modèle et votre année pour obtenir les éclairages qui lui correspondent."
          action={{ label: 'Indiquer mon véhicule', href: '/vehicule' }}
        />
      </div>
    )
  }

  const groups = await getByPosition(vehicle.configurationId)

  return (
    <div className="container-page flex flex-col gap-6 py-10">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon véhicule', href: '/vehicule' },
          { label: 'Mes éclairages' },
        ]}
      />

      <h1 className="text-3xl font-extrabold sm:text-4xl">
        Les éclairages pour votre {vehicle.label}
      </h1>

      <VehicleBar vehicle={vehicle} variant="compact" />

      {/*
        L'explication des statuts est repliée.

        Dépliée, elle occupait le haut de la page et repoussait les produits
        sous la ligne de flottaison : on lisait un mode d'emploi avant de voir
        une seule ampoule. Elle reste à un clic, et les trois statuts sont de
        toute façon nommés en toutes lettres sur chaque carte.

        `<details>` plutôt qu'un composant : le pliage, le clavier et la
        restitution aux lecteurs d'écran sont natifs, et cela fonctionne sans
        JavaScript.
      */}
      <details className="max-w-3xl rounded-md border border-line bg-surface-soft">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none">
          <span className="underline decoration-line-strong underline-offset-4">
            Comment lire les statuts de compatibilité
          </span>
        </summary>
        <div className="border-t border-line px-4 py-3 text-sm text-muted-strong">
          <p>
            <strong className="text-slate-ink">Compatibilité confirmée</strong> : le montage a été
            vérifié pour cette configuration précise.{' '}
            <strong className="text-slate-ink">Informations insuffisantes</strong> : nous
            n&apos;avons pas de quoi trancher — ce n&apos;est pas une confirmation, et ce n&apos;est
            pas un refus. <strong className="text-slate-ink">Incompatible</strong> : le produit ne
            convient pas à cette configuration.
          </p>
          <p className="mt-2">
            La compatibilité de montage ne préjuge pas de l&apos;homologation routière : elle est
            indiquée séparément sur chaque fiche produit.
          </p>
        </div>
      </details>

      {groups === null ? (
        <Alert tone="danger" title="Compatibilités momentanément illisibles" live="polite">
          Les compatibilités de ce véhicule n&apos;ont pas pu être lues. Rien n&apos;est affiché
          plutôt qu&apos;une liste incomplète qui pourrait passer pour complète. Réessayez dans un
          instant, ou <Link href="/contact" className="underline underline-offset-4">contactez-nous</Link>.
        </Alert>
      ) : groups.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            title="Aucune compatibilité documentée pour cette configuration."
            description="Cela ne veut pas dire qu'aucun produit ne convient : cela veut dire que nous ne l'avons pas encore vérifié pour ce véhicule. Tant que ce n'est pas vérifié, nous ne l'affirmons pas."
            action={{ label: 'Parcourir le catalogue', href: '/c' }}
          />
          <p className="text-center text-sm text-muted-strong">
            Besoin d&apos;une réponse pour ce véhicule ?{' '}
            <Link href="/contact" className="font-semibold text-brand underline underline-offset-4">
              Écrivez-nous
            </Link>{' '}
            : nous vérifions et nous documentons la configuration.
          </p>
        </div>
      ) : (
        groups.map((group) => {
          const headingId = `emplacement-${group.code.toLowerCase()}`
          return (
            <section key={group.code} aria-labelledby={headingId} className="flex flex-col gap-3">
              <h2 id={headingId} className="text-xl font-bold sm:text-2xl">
                {group.label}
              </h2>

              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.products.map((product) => {
                  // Conditionnement mis en avant : le moins cher parmi ceux
                  // dont la compatibilité est CONFIRMÉE. Sans confirmation,
                  // aucune recommandation — les lignes restent présentées à
                  // égalité, ce qui est la seule chose honnête à faire quand on
                  // ne sait pas.
                  const recommande =
                    product.lines.find((line) => line.status === 'CONFIRMED') ?? null

                  return (
                    <li
                      key={product.productSlug}
                      className={cn(
                        'flex flex-col rounded-md border border-line bg-white',
                        product.status === 'INCOMPATIBLE' && 'opacity-75',
                      )}
                    >
                      <Link
                        href={`/p/${product.productSlug}`}
                        className="flex flex-1 flex-col rounded-t-md transition-colors hover:bg-surface-soft"
                      >
                        <span className="flex items-start gap-4 p-4">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt=""
                              width={80}
                              height={80}
                              className="size-20 shrink-0 rounded-sm bg-surface-muted object-contain"
                            />
                          ) : (
                            <span aria-hidden className="size-20 shrink-0 rounded-sm bg-surface-muted" />
                          )}

                          <span className="min-w-0 flex-1">
                            {/* Le statut en tête : c'est ce qui décide si la
                                suite mérite d'être lue. */}
                            <FitmentBadge status={product.status} short className="w-fit" />
                            <span className="mt-1.5 block font-semibold leading-snug">
                              {product.productName}
                            </span>
                            {product.lines[0]?.quantity > 1 ? (
                              <span className="mt-1 block text-sm text-muted-strong">
                                {product.lines[0].quantity} nécessaires pour cet emplacement
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Link>

                      {/* Les conditionnements : prix réel, et ce qu'ils
                          contiennent. Sur une seule ligne chacun. */}
                      <ul className="flex flex-col gap-1.5 border-t border-line px-4 py-3 text-sm">
                        {product.lines.map((line) => (
                          <li key={line.id}>
                            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <span className="min-w-0">
                                <span className="font-medium">{line.variantName}</span>
                                {line.isKit ? (
                                  <span className="text-muted"> · tout compris</span>
                                ) : null}
                                {recommande?.id === line.id && product.lines.length > 1 ? (
                                  <span className="ml-2 rounded-xs bg-ok-soft px-1.5 py-0.5 text-xs font-semibold text-ok">
                                    conseillé
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 font-bold">
                                {formatPrice(line.priceCents)}
                              </span>
                            </span>

                            {/*
                              La restriction appartient à SON conditionnement.

                              Mises en commun sous la carte, « Adaptateurs et
                              décodeurs nécessaires, non inclus » (vrai des
                              ampoules seules) se lisait comme valant aussi
                              pour le kit complet, qui les contient. C'est
                              exactement la contradiction corrigée sur la fiche
                              produit : elle n'a pas à réapparaître ici.
                            */}
                            {line.restrictions ? (
                              <span className="mt-0.5 block text-xs text-muted-strong">
                                {line.restrictions}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                        {product.lines[0]?.verifiedAt ? (
                          <span className="text-xs text-muted">
                            {product.status === 'UNKNOWN' ? 'Information datée du' : 'Vérifié le'}{' '}
                            {dateFormatter.format(product.lines[0].verifiedAt)}
                            {product.lines[0].source ? ` · ${product.lines[0].source}` : null}
                          </span>
                        ) : (
                          <span />
                        )}

                        <ButtonLink
                          href={`/p/${product.productSlug}`}
                          size="sm"
                          variant={product.status === 'INCOMPATIBLE' ? 'secondary' : 'primary'}
                          className="shrink-0"
                        >
                          {product.status === 'INCOMPATIBLE' ? 'Voir pourquoi' : 'Choisir'}
                        </ButtonLink>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
