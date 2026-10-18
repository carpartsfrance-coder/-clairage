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
  productSlug: string
  productName: string
  variantName: string
  imageUrl: string | null
}

type PositionGroup = {
  code: string
  label: string
  lines: ResultLine[]
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
        lines: [],
      }

      group.lines.push({
        id: row.id,
        status: row.status,
        quantity: row.quantity,
        restrictions: row.restrictions,
        source: row.source,
        verifiedAt: row.verifiedAt,
        productSlug: row.variant.product.slug,
        productName: row.variant.product.name,
        variantName: row.variant.name,
        imageUrl: row.variant.product.media[0]?.media.url ?? null,
      })

      groups.set(row.position.code, group)
    }

    for (const group of groups.values()) {
      group.lines.sort(
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

      <VehicleBar vehicle={vehicle} />

      <Alert tone="info" title="Comment lire les statuts" className="max-w-3xl">
        <p>
          <strong>Compatibilité confirmée</strong> : le montage a été vérifié pour cette
          configuration précise. <strong>Informations insuffisantes</strong> : nous n&apos;avons pas
          de quoi trancher — ce n&apos;est pas une confirmation, et ce n&apos;est pas un refus.{' '}
          <strong>Incompatible</strong> : le produit ne convient pas à cette configuration.
        </p>
        <p className="mt-2">
          La compatibilité de montage ne préjuge pas de l&apos;homologation routière : elle est
          indiquée séparément sur chaque fiche produit.
        </p>
      </Alert>

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

              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
                {group.lines.map((line) => (
                  <li key={line.id} className={cn(line.status === 'INCOMPATIBLE' && 'opacity-75')}>
                    <Link
                      href={`/p/${line.productSlug}`}
                      className="flex items-start gap-4 p-3 transition-colors hover:bg-surface-soft sm:p-4"
                    >
                      {line.imageUrl ? (
                        <Image
                          src={line.imageUrl}
                          alt=""
                          width={64}
                          height={64}
                          className="size-16 shrink-0 rounded-sm bg-surface-muted object-contain"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="size-16 shrink-0 rounded-sm bg-surface-muted"
                        />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <span className="min-w-0">
                            <span className="block font-semibold leading-snug">
                              {line.productName}
                            </span>
                            <span className="block text-sm text-muted">{line.variantName}</span>
                          </span>
                          <FitmentBadge status={line.status} className="shrink-0" />
                        </span>

                        {line.quantity > 1 ? (
                          <span className="mt-1.5 block text-sm font-semibold text-slate-ink">
                            {line.quantity} nécessaires
                          </span>
                        ) : null}

                        {line.restrictions ? (
                          <span className="mt-1.5 block text-sm text-muted-strong">
                            {line.restrictions}
                          </span>
                        ) : null}

                        {/* Pas de date de vérification = rien d'affiché : une
                            compatibilité non datée ne doit pas en exhiber une.
                            Et sur une ligne « informations insuffisantes », le mot
                            « vérifié » se lirait comme une confirmation : la date
                            dit alors quand nous avons cherché, pas que nous avons
                            tranché. */}
                        {line.verifiedAt ? (
                          <span className="mt-1.5 block text-xs text-muted">
                            {line.status === 'UNKNOWN' ? 'Information datée du' : 'Vérifié le'}{' '}
                            {dateFormatter.format(line.verifiedAt)}
                            {line.source ? ` · ${line.source}` : null}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
