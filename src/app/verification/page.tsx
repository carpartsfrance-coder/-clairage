import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { getSelectedVehicle } from '@/lib/session'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { EmptyState } from '@/components/ui/Surface'
import { FitmentCheckForm } from '@/components/product/FitmentCheckForm'

export const metadata: Metadata = {
  title: 'Faire vérifier mon véhicule',
  robots: { index: false, follow: false },
}

type PageProps = { searchParams: Promise<{ variante?: string; generation?: string }> }

/**
 * Faire vérifier une compatibilité qui n'est pas établie.
 *
 * La fiche produit renvoyait ici vers une page de contact non construite :
 * l'invitation à « demander une vérification » ne menait à rien, et le seul
 * bouton réellement actif restait l'ajout au panier. Cette page ouvre une
 * vraie demande SAV.
 *
 * Elle ne redemande rien de ce qui est déjà connu. Le produit, le
 * conditionnement, le véhicule et l'équipement d'origine sont affichés tels
 * qu'ils seront transmis — le client voit ce qu'il envoie — et ne circulent
 * que par identifiant : l'action les relit en base avant d'écrire.
 */
export default async function VerificationPage({ searchParams }: PageProps) {
  const { variante, generation: generationParam } = await searchParams
  const [vehicle, user] = await Promise.all([getSelectedVehicle(), getCurrentUser()])

  const [variant, generation] = await Promise.all([
    variante
      ? prisma.productVariant.findUnique({
          where: { id: variante },
          include: { product: { select: { name: true, slug: true, status: true } } },
        })
      : null,
    generationParam
      ? prisma.vehicleGeneration.findUnique({
          where: { id: generationParam },
          include: { model: { include: { make: true } } },
        })
      : null,
  ])

  const referenceValide = Boolean(
    variant && variant.active && variant.product.status === 'PUBLISHED',
  )
  // Une demande a un objet dès qu'on sait de quelle pièce OU de quel véhicule
  // il s'agit. Sans ni l'un ni l'autre, il n'y a rien à vérifier.
  const objet = referenceValide || Boolean(generation) || Boolean(vehicle)

  const breadcrumb = [
    { label: 'Accueil', href: '/' },
    ...(variant ? [{ label: variant.product.name, href: `/p/${variant.product.slug}` }] : []),
    { label: 'Faire vérifier mon véhicule' },
  ]

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb items={breadcrumb} />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Faire vérifier mon véhicule
      </h1>

      {!objet ? (
        <EmptyState
          className="mt-6"
          title="Aucune référence à vérifier."
          description="Ouvrez la fiche du produit concerné, puis relancez la vérification depuis le bloc d'achat : le contexte sera repris automatiquement."
          action={{ label: 'Voir le catalogue', href: '/c' }}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-8 fiche:flex-row fiche:items-start fiche:gap-[49px]">
          <section aria-labelledby="verification-formulaire" className="min-w-0 flex-1">
            <h2 id="verification-formulaire" className="text-[14px] font-bold">
              Ce qu&apos;il nous manque
            </h2>
            <p className="mt-2 mb-5 max-w-[580px] text-[11px] leading-[1.8] text-[#7a7a7a]">
              {referenceValide
                ? "Nous n'avons pas l'information nécessaire pour confirmer que cette référence convient à votre véhicule. Nous la vérifions et vous répondons — rien n'est commandé en attendant."
                : "Dites-nous ce que vous avez sous le capot, et nous identifions l'équipement d'origine de votre véhicule. Aucun choix n'est enregistré en attendant."}
            </p>

            <FitmentCheckForm
              variantId={referenceValide ? variant!.id : null}
              generationId={generation?.id ?? null}
              configurationId={vehicle?.configurationId ?? null}
              defaultEmail={user?.email ?? null}
              submitLabel={
                referenceValide ? 'Demander la vérification' : "Demander l'identification"
              }
            />
          </section>

          {/* Ce qui part avec la demande, affiché tel quel. */}
          <section
            aria-labelledby="verification-contexte"
            className="fiche:w-[370px] fiche:shrink-0"
          >
            <div className="rounded-[9px] border border-[#e0e0e0] p-5">
              <h2 id="verification-contexte" className="text-[14px] font-bold">
                Ce que nous transmettons
              </h2>

              <dl className="mt-3 text-[12px]">
                {referenceValide ? (
                  <>
                    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                      <dt className="text-[#7e7e7e]">Produit</dt>
                      <dd className="min-w-0 text-right font-semibold">
                        <Link
                          href={`/p/${variant!.product.slug}`}
                          className="underline-offset-[3px] hover:underline"
                        >
                          {variant!.product.name}
                        </Link>
                      </dd>
                    </div>

                    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                      <dt className="text-[#7e7e7e]">Conditionnement</dt>
                      <dd className="text-right font-semibold">
                        {variant!.name}
                        <span className="block text-[10px] font-normal text-[#7e7e7e]">
                          réf. {variant!.sku} · {formatPrice(variant!.priceCents)}
                        </span>
                      </dd>
                    </div>
                  </>
                ) : null}

                <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                  <dt className="text-[#7e7e7e]">Véhicule</dt>
                  <dd className="text-right font-semibold">
                    {vehicle
                      ? vehicle.label
                      : generation
                        ? `${generation.model.make.name} ${generation.name}`
                        : 'Non précisé'}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[#7e7e7e]">Équipement d&apos;origine</dt>
                  <dd className="text-right font-semibold">
                    {vehicle?.equipmentLabel ?? 'Non précisé'}
                  </dd>
                </div>
              </dl>

              {vehicle ? null : (
                <p className="mt-2 text-[10px] leading-[1.7] text-[#8c8c8c]">
                  Aucun véhicule n&apos;est sélectionné.{' '}
                  <Link href="/vehicule" className="font-semibold underline underline-offset-2">
                    L&apos;indiquer
                  </Link>{' '}
                  nous évitera un aller-retour.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
