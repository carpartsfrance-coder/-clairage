import 'server-only'
import { prisma } from '../db'
import { recommendPackaging } from '../recommendation'
import { availabilityForKit, availabilityForVariant, isPurchasable } from '../stock'
import type { FitmentStatus } from '../fitment'

/**
 * Parcours « packs par véhicule » : marque → modèle → génération → éclairages.
 *
 * Ce parcours ne confirme rien de lui-même. Consulter la page d'une
 * génération dit ce qui est **documenté** pour elle, pas ce qui conviendra au
 * véhicule du client : une génération vendue en halogène et en xénon n'accepte
 * pas les mêmes pièces, et c'est la configuration — génération + équipement
 * d'origine — qui tranche. La page le dit, et renvoie vers l'étape
 * d'équipement quand la génération en compte plusieurs.
 *
 * Le type de véhicule n'est pas une liste fermée : `vehicleTypePath` traduit
 * les deux chemins publics aujourd'hui servis, et la lecture reste valable
 * pour tout type que le catalogue viendrait à proposer.
 */

export type PackVehicleType = 'CAR' | 'MOTORCYCLE'

/** `auto` et `moto` dans les URL ; `CAR` et `MOTORCYCLE` en base. */
export const TYPE_PAR_CHEMIN: Record<string, PackVehicleType> = {
  auto: 'CAR',
  moto: 'MOTORCYCLE',
}

export const CHEMIN_PAR_TYPE: Record<PackVehicleType, string> = {
  CAR: 'auto',
  MOTORCYCLE: 'moto',
}

export const LIBELLE_PAR_CHEMIN: Record<string, { court: string; long: string }> = {
  auto: { court: 'Auto & Utilitaires', long: 'Packs Auto & Utilitaires' },
  moto: { court: 'Moto & Scooter', long: 'Packs Moto & Scooter' },
}

export type PackMake = {
  slug: string
  name: string
  /** Modèles actifs : ce que la page de la marque ouvrira. */
  modelCount: number
  /**
   * Logo rattaché à la marque, s'il y en a un.
   *
   * Aucun n'est livré avec le projet : un logo de constructeur est une marque
   * déposée, et c'est à l'exploitant de téléverser ceux qu'il peut afficher.
   * Sans logo, l'affichage pose un monogramme.
   */
  logo: { url: string; alt: string } | null
}

export type PackModel = {
  slug: string
  name: string
  generations: Array<{
    slug: string
    name: string
    /** « 2012–2016 » ou « depuis 2020 ». */
    years: string
    phase: string | null
    /** Configurations documentées (équipements d'origine distincts). */
    configurationCount: number
    /** Vrai dès qu'au moins une compatibilité est enregistrée. */
    hasFitments: boolean
  }>
}

/** « 2012–2016 » ou « depuis 2020 » — même formulation partout. */
export function yearsLabel(yearFrom: number, yearTo: number | null): string {
  return yearTo ? `${yearFrom}–${yearTo}` : `depuis ${yearFrom}`
}

/* -------------------------------------------------------------------------- */

/** Marques d'un type donné, avec au moins un modèle actif. */
export async function listPackMakes(type: PackVehicleType): Promise<PackMake[]> {
  try {
    const makes = await prisma.vehicleMake.findMany({
      where: { type, active: true, models: { some: { active: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { models: { where: { active: true } } } } },
    })

    /*
      Les logos sont relus séparément : `logoMediaId` porte un identifiant de
      média sans relation déclarée côté schéma. Ajouter la relation demande
      une migration sur `VehicleMake` — à faire quand la table n'est plus en
      cours de modification ailleurs. L'appelant ne verra pas la différence.
    */
    const logoIds = [
      ...new Set(makes.map((make) => make.logoMediaId).filter((id): id is string => Boolean(id))),
    ]
    const medias = logoIds.length
      ? await prisma.media.findMany({
          where: { id: { in: logoIds } },
          select: { id: true, url: true, alt: true },
        })
      : []
    const parId = new Map(medias.map((media) => [media.id, media]))

    return makes.map((make) => {
      const media = make.logoMediaId ? parId.get(make.logoMediaId) : undefined
      return {
        slug: make.slug,
        name: make.name,
        modelCount: make._count.models,
        logo: media ? { url: media.url, alt: media.alt ?? make.name } : null,
      }
    })
  } catch (error) {
    console.error('[packs] marques indisponibles', error)
    return []
  }
}

/** Une marque et ses modèles, avec les générations de chacun. */
export async function getPackMake(
  type: PackVehicleType,
  slug: string,
): Promise<{ name: string; models: PackModel[] } | null> {
  try {
    const make = await prisma.vehicleMake.findFirst({
      where: { slug, type, active: true },
      include: {
        models: {
          where: { active: true },
          orderBy: { name: 'asc' },
          include: {
            generations: {
              where: { active: true },
              orderBy: { yearFrom: 'asc' },
              include: {
                _count: { select: { configurations: { where: { active: true } } } },
                configurations: {
                  where: { active: true },
                  select: { _count: { select: { fitments: true } } },
                },
              },
            },
          },
        },
      },
    })
    if (!make) return null

    return {
      name: make.name,
      models: make.models
        .map((model) => ({
          slug: model.slug,
          name: model.name,
          generations: model.generations.map((generation) => ({
            slug: generation.slug,
            name: generation.name,
            years: yearsLabel(generation.yearFrom, generation.yearTo),
            phase: generation.phase,
            configurationCount: generation._count.configurations,
            hasFitments: generation.configurations.some((config) => config._count.fitments > 0),
          })),
        }))
        // Un modèle sans génération active n'ouvre sur rien.
        .filter((model) => model.generations.length > 0),
    }
  } catch (error) {
    console.error('[packs] marque indisponible', error)
    return null
  }
}

/* -------------------------------------------------------------------------- */

export type PackProduct = {
  productSlug: string
  productName: string
  tagline: string | null
  image: { url: string; alt: string } | null
  /** Statut le plus favorable parmi les conditionnements documentés. */
  status: FitmentStatus
  /** Conditionnement conseillé, selon la règle partagée. `null` si aucun. */
  recommended: { name: string; priceCents: number } | null
  /** Prix d'entrée, quel que soit le conditionnement conseillé. */
  fromPriceCents: number
  /** Composition du conditionnement conseillé, pour dire ce que le pack contient. */
  contents: string[]
}

export type PackPositionGroup = {
  code: string
  label: string
  products: PackProduct[]
}

export type PackGeneration = {
  makeName: string
  modelName: string
  generationName: string
  years: string
  phase: string | null
  /** Équipements d'origine documentés pour cette génération. */
  equipments: Array<{ configurationId: string; code: string; label: string; hint: string | null }>
  /** Produits groupés par emplacement, toutes configurations confondues. */
  groups: PackPositionGroup[]
}

/**
 * Éclairages documentés pour une génération.
 *
 * **Toutes configurations confondues**, et c'est délibéré : à ce niveau le
 * client n'a pas encore dit son équipement d'origine. Le statut affiché est le
 * plus favorable parmi les configurations, et la page doit signaler que le
 * choix de l'équipement reste à faire quand il y en a plusieurs. Afficher
 * « compatible » ici sans cette réserve ferait passer une documentation pour
 * une confirmation.
 */
export async function getPackGeneration(
  type: PackVehicleType,
  makeSlug: string,
  modelSlug: string,
  generationSlug: string,
): Promise<PackGeneration | null> {
  try {
    const generation = await prisma.vehicleGeneration.findFirst({
      where: {
        slug: generationSlug,
        active: true,
        model: { slug: modelSlug, active: true, make: { slug: makeSlug, type, active: true } },
      },
      include: {
        model: { include: { make: true } },
        configurations: {
          where: { active: true },
          include: {
            equipment: true,
            fitments: {
              include: {
                position: true,
                accessories: { select: { variantId: true, required: true } },
                variant: {
                  include: {
                    components: { include: { component: true } },
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
            },
          },
        },
      },
    })
    if (!generation) return null

    /*
      Un produit peut être documenté sur plusieurs configurations et plusieurs
      conditionnements. On l'agrège par emplacement puis par produit : une
      carte par produit, jamais une par ligne de compatibilité — sans quoi le
      même kit apparaîtrait deux fois dès qu'il convient à l'halogène et au
      xénon.
    */
    /** Conditionnement documenté, avant d'avoir choisi lequel conseiller. */
    type Candidat = {
      id: string
      name: string
      priceCents: number
      status: FitmentStatus
      purchasable: boolean
      missingRequired: number
      contents: string[]
    }

    /** Produit en cours d'agrégation : la carte, plus ses conditionnements. */
    type ProduitAgrege = Omit<PackProduct, 'status' | 'recommended' | 'fromPriceCents' | 'contents'> & {
      candidats: Candidat[]
    }

    const parEmplacement = new Map<
      string,
      { code: string; label: string; ordre: number; produits: Map<string, ProduitAgrege> }
    >()

    for (const configuration of generation.configurations) {
      for (const fitment of configuration.fitments) {
        if (
          !fitment.variant.active ||
          fitment.variant.product.status !== 'PUBLISHED'
        ) {
          continue
        }

        const groupe =
          parEmplacement.get(fitment.position.code) ??
          {
            code: fitment.position.code,
            label: fitment.position.label,
            ordre: fitment.position.position,
            produits: new Map<string, ProduitAgrege>(),
          }

        const slug = fitment.variant.product.slug
        const fournis = new Set(fitment.variant.components.map((entry) => entry.componentId))
        const candidat: Candidat = {
          id: fitment.variant.id,
          name: fitment.variant.name,
          priceCents: fitment.variant.priceCents,
          status: fitment.status,
          purchasable: isPurchasable(
            fitment.variant.components.length > 0
              ? availabilityForKit(
                  fitment.variant.components.map((entry) => ({
                    quantity: entry.quantity,
                    required: entry.required,
                    component: entry.component,
                  })),
                )
              : availabilityForVariant(fitment.variant),
          ),
          missingRequired: fitment.accessories.filter(
            (accessoire) => accessoire.required && !fournis.has(accessoire.variantId),
          ).length,
          contents: fitment.variant.components.map(
            (entry) => `${entry.quantity} × ${entry.component.name}`,
          ),
        }

        const existant = groupe.produits.get(slug)
        if (existant) {
          existant.candidats.push(candidat)
        } else {
          const cover = fitment.variant.product.media[0]?.media
          groupe.produits.set(slug, {
            productSlug: slug,
            productName: fitment.variant.product.name,
            tagline: fitment.variant.product.tagline,
            image: cover
              ? { url: cover.url, alt: cover.alt ?? fitment.variant.product.name }
              : null,
            candidats: [candidat],
          })
        }

        parEmplacement.set(groupe.code, groupe)
      }
    }

    // Poids de statut : CONFIRMED l'emporte, INCOMPATIBLE ferme la marche.
    const poids: Record<FitmentStatus, number> = {
      CONFIRMED: 0,
      UNKNOWN: 1,
      INCOMPATIBLE: 2,
    }

    const groups: PackPositionGroup[] = [...parEmplacement.values()]
      .sort((a, b) => a.ordre - b.ordre)
      .map((groupe) => ({
        code: groupe.code,
        label: groupe.label,
        products: [...groupe.produits.values()]
          .map((produit) => {
            const candidats = produit.candidats
            const retenu = recommendPackaging(candidats)
            const meilleurStatut = candidats.reduce<FitmentStatus>(
              (meilleur, candidat) =>
                poids[candidat.status] < poids[meilleur] ? candidat.status : meilleur,
              'INCOMPATIBLE',
            )

            return {
              productSlug: produit.productSlug,
              productName: produit.productName,
              tagline: produit.tagline,
              image: produit.image,
              status: meilleurStatut,
              recommended: retenu ? { name: retenu.name, priceCents: retenu.priceCents } : null,
              fromPriceCents: Math.min(...candidats.map((candidat) => candidat.priceCents)),
              contents: candidats.find((candidat) => candidat.id === retenu?.id)?.contents ?? [],
            }
          })
          .sort((a, b) => poids[a.status] - poids[b.status] || a.fromPriceCents - b.fromPriceCents),
      }))

    return {
      makeName: generation.model.make.name,
      modelName: generation.model.name,
      generationName: generation.name,
      years: yearsLabel(generation.yearFrom, generation.yearTo),
      phase: generation.phase,
      equipments: generation.configurations.map((configuration) => ({
        configurationId: configuration.id,
        code: configuration.equipment.code,
        label: configuration.equipment.label,
        hint: configuration.equipment.hint,
      })),
      groups,
    }
  } catch (error) {
    console.error('[packs] génération indisponible', error)
    return null
  }
}
