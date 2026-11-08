import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getSelectedVehicle } from '@/lib/session'
import { fitmentSortWeight } from '@/lib/fitment'
import { availabilityForKit, availabilityForVariant, isPurchasable } from '@/lib/stock'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { ButtonLink } from '@/components/ui/Button'
import { Alert, EmptyState } from '@/components/ui/Surface'
import {
  IconArrowRight,
  IconCar,
  IconCheckCircle,
  IconChevronDown,
  IconHeadset,
} from '@/components/ui/icons'
import { ARGS_COUVERTURE, couverture } from '@/lib/media-couverture'
import { couvertureType } from '@/lib/images-types'
import { cartesDesResultats, phaseUtile, type GroupeResultat } from '@/lib/resultats-vue'
import { totalDesCartes } from '@/lib/packs-vue'
import { BandeauVehicule } from '@/components/vehicule/BandeauVehicule'
import { BarreVehicule } from '@/components/vehicule/BarreVehicule'
import { EclairagesParZone } from '@/components/vehicule/EclairagesParZone'
import { TotalEclairage } from '@/components/vehicule/TotalEclairage'

export const metadata: Metadata = {
  title: 'Les éclairages pour votre véhicule',
  robots: { index: false, follow: false },
}

/**
 * Résultats pour le véhicule sélectionné.
 *
 * La page n'est pas une liste de produits : c'est une lecture de
 * compatibilités. Les lignes incompatibles y restent visibles, parce que
 * savoir ce qui ne convient pas fait partie de la réponse.
 *
 * **Elle se dessine comme la page d'une génération**, dont elle montre les
 * mêmes pièces au même client — bandeau véhicule, total, une seule grille de
 * cartes titrées par l'emplacement. Elle en diffère sur un point, et c'est son
 * objet : ici l'équipement d'origine est connu, donc les statuts valent pour
 * LE véhicule du client et non pour la génération. Le reste n'était pas une
 * différence de fond, seulement deux dessins pour une même chose.
 *
 * Ce qu'elle a de propre — la réserve de montage, la provenance de la
 * vérification, un deuxième conditionnement, une quantité supérieure à un —
 * reste sur la carte qui le porte. Le relevé dit pourquoi cela ne mérite plus
 * un bloc permanent : cinq compatibilités sur 10 295 portent une réserve,
 * cinq une date, une seule un deuxième conditionnement, aucune une quantité
 * supérieure à un.
 */

/** De quoi montrer la voiture dont la page parle, et pas seulement la nommer. */
type VehiculeAffiche = {
  makeName: string
  generationName: string
  years: string
  phase: string | null
  equipmentLabel: string | null
  /**
   * Le code de l'équipement, et non son seul intitulé.
   *
   * « Équipement d'origine non précisé » EST un intitulé du référentiel :
   * composé dans une phrase, il donnait « Compatibilités vérifiées pour
   * Équipement d'origine non précisé ». C'est le code `NON_PRECISE` qui
   * distingue une absence d'un équipement, pas la lecture de son libellé.
   */
  equipmentCode: string | null
  /** Logo du constructeur, s'il a été téléversé. */
  logo: { url: string; alt: string } | null
}

async function getVehiculeAffiche(configurationId: string): Promise<VehiculeAffiche | null> {
  try {
    const config = await prisma.vehicleConfiguration.findUnique({
      where: { id: configurationId },
      include: {
        equipment: true,
        generation: {
          include: {
            model: {
              include: { make: { include: { logo: { select: { url: true, alt: true } } } } },
            },
          },
        },
      },
    })
    if (!config) return null

    const { generation } = config
    return {
      makeName: generation.model.make.name,
      generationName: generation.name,
      years: generation.yearTo
        ? `${generation.yearFrom}–${generation.yearTo}`
        : `depuis ${generation.yearFrom}`,
      phase: phaseUtile(generation.phase, generation.name),
      equipmentLabel: config.equipment.label,
      equipmentCode: config.equipment.code,
      logo: generation.model.make.logo
        ? {
            url: generation.model.make.logo.url,
            alt: generation.model.make.logo.alt ?? `Logo ${generation.model.make.name}`,
          }
        : null,
    }
  } catch (error) {
    // La page sait se passer de la photo : elle ne se passe pas des produits.
    console.error('[vehicule/resultats] véhicule', error)
    return null
  }
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
async function getByPosition(configurationId: string): Promise<GroupeResultat[] | null> {
  try {
    const rows = await prisma.fitment.findMany({
      where: { configurationId, variant: { active: true, product: { status: 'PUBLISHED' } } },
      include: {
        position: true,
        accessories: { select: { variantId: true, required: true } },
        variant: {
          include: {
            // La composition sert deux fois : savoir ce que le conditionnement
            // fournit déjà, et calculer sa disponibilité réelle.
            components: { include: { component: true } },
            product: {
              include: {
                media: {
                  ...ARGS_COUVERTURE,
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
    const groups = new Map<string, GroupeResultat>()

    for (const row of rows) {
      const group = groups.get(row.position.code) ?? {
        code: row.position.code,
        label: row.position.label,
        products: [],
      }

      const slug = row.variant.product.slug
      let product = group.products.find((entry) => entry.productSlug === slug)
      if (!product) {
        const visuel = couverture(row.variant.product.media)
        product = {
          productSlug: slug,
          productName: row.variant.product.name,
          image: visuel
            ? { url: visuel.media.url, alt: visuel.media.alt ?? row.variant.product.name }
            : couvertureType(row.variant.product),
          status: row.status,
          lines: [],
        }
        group.products.push(product)
      }

      product.lines.push({
        id: row.id,
        variantId: row.variantId,
        status: row.status,
        quantity: row.quantity,
        restrictions: row.restrictions,
        source: row.source,
        verifiedAt: row.verifiedAt,
        variantName: row.variant.name,
        priceCents: row.variant.priceCents,
        isKit: row.variant.components.length > 0,
        missingRequired: (() => {
          // Ce que le conditionnement fournit lui-même ne lui manque pas.
          const fournis = new Set(row.variant.components.map((entry) => entry.componentId))
          return row.accessories.filter(
            (accessoire) => accessoire.required && !fournis.has(accessoire.variantId),
          ).length
        })(),
        // Même calcul de disponibilité que la fiche produit : sans lui, cette
        // page pourrait conseiller un conditionnement que la fiche écarte.
        purchasable: isPurchasable(
          row.variant.components.length > 0
            ? availabilityForKit(
                row.variant.components.map((entry) => ({
                  quantity: entry.quantity,
                  required: entry.required,
                  component: entry.component,
                })),
              )
            : availabilityForVariant(row.variant),
        ),
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

  const [groups, affiche] = await Promise.all([
    getByPosition(vehicle.configurationId),
    getVehiculeAffiche(vehicle.configurationId),
  ])

  const cartes = groups ? cartesDesResultats(groups) : []
  const total = totalDesCartes(cartes)
  const titre = affiche
    ? `${affiche.makeName} ${affiche.generationName}`
    : vehicle.label

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon véhicule', href: '/vehicule' },
          { label: 'Mes éclairages' },
        ]}
      />

      {/*
        Le bandeau et la barre véhicule, les mêmes que sur la page d'une
        génération : les deux pages montrent la même voiture au même client,
        et les dessiner autrement ne lui apprenait rien.

        La différence est dans ce qu'elles affirment, et elle se lit à la
        barre : ici l'équipement d'origine est connu, donc les statuts valent
        pour CE véhicule. C'est ce que la page apporte, et c'est écrit.
      */}
      <BandeauVehicule
        surtitre={affiche ? `${titre} · ${affiche.years}` : titre}
        titre="Éclairage LED"
        sousTitre={`pour ${titre}`}
        description={
          cartes.length > 0
            ? 'Les compatibilités ci-dessous valent pour ce véhicule précis.'
            : 'Aucune compatibilité n’est encore documentée pour ce véhicule.'
        }
        marque={affiche?.makeName ?? vehicle.label}
        logo={affiche?.logo ?? null}
        action={
          cartes.length > 0 ? (
            <ButtonLink
              href="#packs"
              className="min-h-[43px] gap-2.5 rounded-lg px-[15px] text-[12px]"
              iconRight={<IconArrowRight className="size-4 rotate-90" />}
            >
              Voir les {cartes.length} pack{cartes.length > 1 ? 's' : ''}
            </ButtonLink>
          ) : null
        }
      />

      <BarreVehicule
        nom={titre}
        annees={affiche?.years ?? ''}
        nombreDePacks={cartes.length}
        moto={vehicle.type === 'MOTORCYCLE'}
        action={
          <ButtonLink
            href="/vehicule"
            variant="secondary"
            className="min-h-10 gap-2 rounded-lg px-3 text-[12px]"
          >
            Changer de véhicule
          </ButtonLink>
        }
      />

      {affiche?.equipmentCode && affiche.equipmentCode !== 'NON_PRECISE' ? (
        <p className="mt-2 text-[12px] text-muted-strong">
          <IconCheckCircle className="mr-1.5 inline size-3.5 align-[-2px] text-ok" />
          Compatibilités vérifiées pour{' '}
          <span className="font-bold text-slate-ink">{affiche.equipmentLabel}</span>
          {affiche.phase ? ` · ${affiche.phase}` : null}
        </p>
      ) : (
        <p className="mt-2 text-[12px] text-muted-strong">
          <span className="font-bold text-slate-ink">Équipement d’origine non précisé.</span>{' '}
          Un phare halogène et un xénon n’acceptent pas les mêmes pièces :{' '}
          <Link
            href="/vehicule"
            className="font-bold text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand"
          >
            précisez-le
          </Link>{' '}
          pour affiner les compatibilités.
        </p>
      )}

      {groups === null ? (
        <Alert
          tone="danger"
          title="Compatibilités momentanément illisibles"
          live="polite"
          className="mt-6"
        >
          Les compatibilités de ce véhicule n&apos;ont pas pu être lues. Rien n&apos;est affiché
          plutôt qu&apos;une liste incomplète qui pourrait passer pour complète. Réessayez dans un
          instant, ou <Link href="/contact" className="underline underline-offset-4">contactez-nous</Link>.
        </Alert>
      ) : cartes.length === 0 ? (
        <div className="mt-6 flex flex-col gap-3">
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
        <>
          <section id="packs" className="mt-[25px] scroll-mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3.5">
              <h2 className="text-[clamp(24px,2.9vw,34px)] leading-[1.15] font-extrabold tracking-[-0.048em]">
                Choisissez votre éclairage
              </h2>
              <p className="text-[13px] whitespace-nowrap text-muted-strong">
                {cartes.length} pack{cartes.length > 1 ? 's' : ''}
              </p>
            </div>

            <EclairagesParZone cartes={cartes} />

            {total.produits > 1 ? (
              <TotalEclairage
                titre={titre}
                produits={total.produits}
                emplacements={total.emplacements}
                totalCents={total.totalCents}
                variantIds={total.variantIds}
              />
            ) : null}

            <div className="mt-[29px] grid gap-5 border-t border-line pt-[22px] pb-[26px] fiche:grid-cols-[1fr_1.3fr] fiche:gap-x-8">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-[-0.035em]">
                  Un doute sur votre éclairage ?
                </h2>
                <p className="mt-1 text-[13px] text-muted-strong">
                  Retrouvez les repères pour choisir le bon pack.
                </p>
                <Link
                  href="/contact"
                  className="mt-3 inline-flex items-center gap-2 text-[12px] font-bold text-slate-ink underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand"
                >
                  <IconHeadset className="size-4 shrink-0" strokeWidth={1.5} />
                  Contacter un conseiller
                </Link>
              </div>

              <div>
                <details className="border-b border-line">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-bold marker:content-none">
                    Quel emplacement choisir ?
                    <IconChevronDown className="size-4 shrink-0" />
                  </summary>
                  <p className="pr-2.5 pb-3 text-[13px] text-muted-strong">
                    Chaque pack correspond à une lumière précise de la voiture : les feux de
                    croisement éclairent la route, les veilleuses signalent votre présence, le
                    plafonnier éclaire l&apos;habitacle. Le nom de l&apos;emplacement et ce
                    qu&apos;il éclaire sont écrits sur chaque vignette.
                  </p>
                </details>

                {/*
                  L'explication des statuts, repliée.

                  Dépliée en tête de page, elle repoussait les produits sous la
                  ligne de flottaison : on lisait un mode d'emploi avant de voir
                  une seule ampoule. Les statuts qui alertent sont de toute
                  façon nommés en toutes lettres sur la vignette concernée.
                */}
                <details className="border-b border-line">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-bold marker:content-none">
                    Comment lire les statuts de compatibilité ?
                    <IconChevronDown className="size-4 shrink-0" />
                  </summary>
                  <div className="pr-2.5 pb-3 text-[13px] leading-[1.6] text-muted-strong">
                    <p>
                      <strong className="text-slate-ink">Compatibilité confirmée</strong> : le
                      montage a été vérifié pour cette configuration précise — c&apos;est le cas
                      de la quasi-totalité des éclairages ci-dessus, et la pastille
                      n&apos;apparaît donc que lorsqu&apos;elle alerte.{' '}
                      <strong className="text-slate-ink">Informations insuffisantes</strong> :
                      nous n&apos;avons pas de quoi trancher — ce n&apos;est pas une
                      confirmation, et ce n&apos;est pas un refus.{' '}
                      <strong className="text-slate-ink">Incompatible</strong> : le produit ne
                      convient pas à cette configuration.
                    </p>
                    <p className="mt-2">
                      La compatibilité de montage ne préjuge pas de l&apos;homologation routière :
                      elle est indiquée séparément sur chaque fiche produit.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
