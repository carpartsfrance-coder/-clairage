import 'server-only'
import { cache } from 'react'
import { prisma } from '../db'
import { CHEMIN_PAR_TYPE } from './packs'
import type { VehiculeDeLaFiche } from '../seo-fiche'

/**
 * La génération pour laquelle une fiche est composée.
 *
 * Un pack par véhicule est documenté sur une seule génération : c'est elle
 * qui donne les années du titre, le fil d'Ariane (marque › génération) et le
 * lien vers la page « Éclairage » du véhicule. Une fiche documentée sur
 * plusieurs générations — une ampoule générique — n'a pas de véhicule à elle :
 * `null`, et la fiche garde son fil d'Ariane par catégorie.
 *
 * Seules les compatibilités qui ne sont pas « incompatibles » comptent, et
 * seulement sur des véhicules actifs. Les liens ne sont posés que si la page
 * existe : une marque « auto et moto » (`BOTH`) n'a pas de page de packs.
 *
 * `cache` partage la lecture entre `generateMetadata` et la page. Une lecture
 * en échec renvoie `null` : la fiche s'affiche comme avant.
 */
export const getVehiculeDeLaFiche = cache(
  async (productSlug: string): Promise<VehiculeDeLaFiche | null> => {
    try {
      const lignes = await prisma.fitment.findMany({
        where: {
          status: { not: 'INCOMPATIBLE' },
          variant: { product: { slug: productSlug } },
          configuration: {
            active: true,
            generation: { active: true, model: { active: true, make: { active: true } } },
          },
        },
        select: {
          configuration: {
            select: {
              generation: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  phase: true,
                  yearFrom: true,
                  yearTo: true,
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

      const generations = new Map(
        lignes.map((ligne) => [ligne.configuration.generation.id, ligne.configuration.generation]),
      )
      if (generations.size !== 1) return null

      const generation = [...generations.values()][0]
      const { model } = generation
      const { make } = model
      const type = make.type === 'BOTH' ? null : CHEMIN_PAR_TYPE[make.type]

      return {
        marque: { nom: make.name, slug: make.slug },
        modele: { nom: model.name, slug: model.slug },
        generation: {
          nom: generation.name,
          slug: generation.slug,
          phase: generation.phase,
          anneeDebut: generation.yearFrom,
          anneeFin: generation.yearTo,
        },
        chemin: type ? `/packs/${type}/${make.slug}/${model.slug}/${generation.slug}` : null,
        cheminMarque: type ? `/packs/${type}/${make.slug}` : null,
      }
    } catch (error) {
      console.error('[fiche] véhicule de la fiche illisible', error)
      return null
    }
  },
)
