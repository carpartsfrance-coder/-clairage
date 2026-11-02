import 'server-only'
import { revalidatePath } from 'next/cache'
import type { VehicleType } from '@prisma/client'
import { prisma } from '../db'
import { CHEMIN_PAR_TYPE } from '../queries/packs'
import { vehiclePackPath } from './vehicles'

/**
 * Ce que le site public doit oublier quand un véhicule ou une compatibilité
 * change.
 *
 * Deux écrans écrivent désormais dans `Fitment` : l'écran Véhicules, qui
 * travaille génération par génération, et la fiche produit, qui travaille
 * référence par référence. La règle d'invalidation est donc ici, une seule
 * fois. Recopiée dans les deux fichiers d'actions, elle aurait fini par
 * n'être tenue à jour que d'un côté — et le symptôme d'une invalidation
 * oubliée est une page de packs qui reste périmée, sans erreur, sans trace et
 * sans que personne ne la relie au changement fait la semaine précédente.
 */

/**
 * Invalide ce que le site public sert sur ce véhicule.
 *
 * Le menu est rendu dans le gabarit : sans `revalidatePath('/', 'layout')`,
 * une marque nouvellement créée n'apparaîtrait nulle part tant qu'un autre
 * changement ne l'aurait pas forcé. Les pages de packs sont invalidées du plus
 * général au plus précis, parce qu'une génération ajoutée change aussi la
 * liste des modèles et celle des marques.
 *
 * La fiche produit n'est pas listée : elle lit le véhicule choisi dans le
 * cookie, donc elle est rendue à chaque requête et n'a rien à invalider.
 */
export function revalidateVehicle(scope: {
  type: VehicleType
  makeSlug?: string | null
  modelSlug?: string | null
  generationSlug?: string | null
}): void {
  revalidatePath('/admin/vehicules')
  revalidatePath('/', 'layout')

  // `BOTH` n'est listé par aucun des deux parcours ; on invalide les deux
  // quand même, pour le cas où le type vient de changer dans un sens ou l'autre.
  const chemins =
    scope.type === 'BOTH' ? ['auto', 'moto'] : [CHEMIN_PAR_TYPE[scope.type as 'CAR' | 'MOTORCYCLE']]

  for (const chemin of chemins) {
    revalidatePath(`/packs/${chemin}`)
    if (!scope.makeSlug) continue
    revalidatePath(vehiclePackPath(chemin, scope.makeSlug))
    if (!scope.modelSlug) continue
    revalidatePath(vehiclePackPath(chemin, scope.makeSlug, scope.modelSlug))
    if (!scope.generationSlug) continue
    revalidatePath(vehiclePackPath(chemin, scope.makeSlug, scope.modelSlug, scope.generationSlug))
  }
}

/** Contexte d'une génération : ce qu'il faut pour invalider et pour afficher. */
export async function contexteGeneration(generationId: string) {
  return prisma.vehicleGeneration.findUnique({
    where: { id: generationId },
    select: {
      id: true,
      slug: true,
      name: true,
      model: { select: { slug: true, make: { select: { slug: true, type: true } } } },
    },
  })
}

/** Invalide la page publique de la génération qui porte cette configuration. */
export async function revalidateDepuisConfiguration(configurationId: string): Promise<void> {
  const configuration = await prisma.vehicleConfiguration.findUnique({
    where: { id: configurationId },
    select: { generationId: true },
  })
  if (!configuration) return

  const generation = await contexteGeneration(configuration.generationId)
  if (generation) {
    revalidateVehicle({
      type: generation.model.make.type,
      makeSlug: generation.model.make.slug,
      modelSlug: generation.model.slug,
      generationSlug: generation.slug,
    })
  }
  revalidatePath(`/admin/vehicules/${configuration.generationId}`)
}
