import 'server-only'
import { prisma } from '../db'
import { getPackGeneration } from './packs'
import { cartesDesPacks, sousTitreDeLEmplacement } from '../packs-vue'

/**
 * Les autres packs du même véhicule, pour « Complétez l'éclairage » sur la
 * fiche produit.
 *
 * **Le véhicule est celui de la fiche**, pas celui du client : on regarde la
 * génération sur laquelle le produit est documenté. Une fiche documentée sur
 * plusieurs générations (une ampoule générique) n'en propose aucune — sauf si
 * le client a choisi un véhicule auquel elle s'applique, qui tranche.
 *
 * **Seuls les packs confirmés sont proposés.** La section dit « vérifiés pour
 * ce véhicule » et permet l'achat en un clic : un statut « à vérifier » n'y a
 * pas sa place. Quand le client a indiqué son équipement d'origine, c'est la
 * compatibilité de SA configuration qui compte, et non la plus favorable de la
 * génération : un pack confirmé en halogène ne sera pas proposé à un xénon.
 *
 * Le calcul des cartes est celui de la page d'une génération (`cartesDesPacks`,
 * même conditionnement conseillé, même prix) : la section ne peut pas
 * annoncer un autre prix que la page « Mes éclairages ».
 *
 * Une lecture en échec renvoie `null` : la fiche s'affiche sans la section.
 */

export type PackComplementaire = {
  slug: string
  variantId: string
  titre: string
  sousTitre: string | null
  image: { url: string; alt: string } | null
  prixCents: number
}

export type PacksComplementaires = {
  /** « Audi A1 » — la marque et la génération, telles que le client les lit. */
  vehicule: string
  packs: PackComplementaire[]
}

/** La bande « tout ajouter » achète au plus 12 packs d'un coup (`addPacksToCart`). */
const MAXIMUM = 12

export async function getPacksComplementaires(
  productSlug: string,
  configurationChoisie: string | null,
): Promise<PacksComplementaires | null> {
  try {
    const lignes = await prisma.fitment.findMany({
      where: { variant: { product: { slug: productSlug } } },
      select: {
        configurationId: true,
        configuration: {
          select: {
            generation: {
              select: {
                id: true,
                slug: true,
                name: true,
                model: {
                  select: {
                    slug: true,
                    name: true,
                    make: { select: { slug: true, name: true, type: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (lignes.length === 0) return null

    const generations = new Map(lignes.map((l) => [l.configuration.generation.id, l.configuration.generation]))
    const choisie = configurationChoisie
      ? lignes.find((l) => l.configurationId === configurationChoisie)
      : undefined

    const generation = choisie
      ? choisie.configuration.generation
      : generations.size === 1
        ? [...generations.values()][0]
        : null
    if (!generation) return null

    const { make, slug: modelSlug } = generation.model
    const lecture = await getPackGeneration(
      make.type === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR',
      make.slug,
      modelSlug,
      generation.slug,
    )
    if (lecture.state !== 'found') return null

    // Avec un équipement d'origine connu : les produits confirmés pour CETTE configuration.
    let confirmesPourLeClient: Set<string> | null = null
    if (choisie) {
      const confirmes = await prisma.fitment.findMany({
        where: { configurationId: choisie.configurationId, status: 'CONFIRMED' },
        select: { variant: { select: { product: { select: { slug: true } } } } },
      })
      confirmesPourLeClient = new Set(confirmes.map((f) => f.variant.product.slug))
    }

    const packs = cartesDesPacks(lecture.data.groups)
      .filter(
        (carte) =>
          carte.slug !== productSlug &&
          carte.status === 'CONFIRMED' &&
          carte.variantId !== null &&
          (confirmesPourLeClient === null || confirmesPourLeClient.has(carte.slug)),
      )
      .slice(0, MAXIMUM)
      .map((carte) => {
        const premier = carte.emplacements[0]
        return {
          slug: carte.slug,
          variantId: carte.variantId as string,
          titre: carte.emplacements.map((e) => e.label).join(' et '),
          // « Ampoules halogènes effet xénon » quand c'en est (packs-vue).
          sousTitre: carte.conditionnement ?? (premier ? sousTitreDeLEmplacement(premier.code) : null),
          image: carte.image,
          prixCents: carte.prixCents,
        }
      })

    if (packs.length === 0) return null
    return { vehicule: `${make.name} ${generation.model.name}`, packs }
  } catch (error) {
    console.error('[fiche] packs complémentaires', error)
    return null
  }
}
