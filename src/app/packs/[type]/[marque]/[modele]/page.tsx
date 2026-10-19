import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  LIBELLE_PAR_CHEMIN,
  TYPE_PAR_CHEMIN,
  getPackMake,
  type PackLookup,
  type PackModel,
} from '@/lib/queries/packs'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { PackReadFailure } from '@/components/packs/PackReadFailure'
import { IconChevronRight } from '@/components/ui/icons'
import { GenerationThumb } from '@/components/packs/GenerationThumb'

type PageProps = { params: Promise<{ type: string; marque: string; modele: string }> }

/**
 * Générations d'un modèle.
 *
 * Troisième niveau, accessible par clic depuis la page de la marque comme le
 * demande l'arborescence — même si la marque liste déjà les générations. Cette
 * page existe pour qu'une adresse désigne le modèle : elle se partage, se met
 * en favori et sert de point d'entrée depuis un moteur de recherche.
 */
async function lireModele(
  type: string,
  marqueSlug: string,
  modeleSlug: string,
): Promise<PackLookup<{ makeName: string; model: PackModel }>> {
  const vehicleType = TYPE_PAR_CHEMIN[type]
  if (!vehicleType) return { state: 'absent' }

  // L'échec de lecture de la marque remonte tel quel : le modèle se lit dans
  // la marque, et ne pas avoir lu la marque ne dit rien du modèle.
  const make = await getPackMake(vehicleType, marqueSlug)
  if (make.state !== 'found') return make

  const model = make.data.models.find((entry) => entry.slug === modeleSlug)
  return model
    ? { state: 'found', data: { makeName: make.data.name, model } }
    : { state: 'absent' }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, marque, modele } = await params
  const read = await lireModele(type, marque, modele)
  // Une lecture en échec ne titre pas « introuvable » : on ne l'a pas constaté.
  if (read.state !== 'found') {
    return { title: read.state === 'absent' ? 'Modèle introuvable' : 'Packs par véhicule' }
  }

  return {
    title: `Éclairage ${read.data.makeName} ${read.data.model.name}`,
    description: `Les générations de ${read.data.makeName} ${read.data.model.name} et leurs éclairages documentés.`,
    alternates: { canonical: `/packs/${type}/${marque}/${modele}` },
  }
}

export default async function PacksModelePage({ params }: PageProps) {
  const { type, marque, modele } = await params
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!libelle) notFound()

  /*
    Un modèle absent du référentiel reste un 404. Une lecture en échec, non :
    elle rendait le même 404, qui affirmait au client que son modèle n'était
    pas référencé sans que personne ait pu le vérifier.
  */
  const read = await lireModele(type, marque, modele)
  if (read.state === 'unavailable') return <PackReadFailure type={type} libelle={libelle} />
  if (read.state === 'absent') notFound()

  const { makeName, model } = read.data

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: libelle.long, href: `/packs/${type}` },
          { label: makeName, href: `/packs/${type}/${marque}` },
          { label: model.name },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Éclairage {makeName} {model.name}
      </h1>
      <p className="mt-2 max-w-[580px] text-[11px] leading-[1.8] text-[#7b8074]">
        Choisissez la période de fabrication qui correspond à votre véhicule. Un restylage change
        souvent le bloc optique : deux périodes du même modèle n&apos;acceptent pas forcément les
        mêmes pièces.
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {model.generations.map((generation) => (
          <li key={generation.slug}>
            <Link
              href={`/packs/${type}/${marque}/${modele}/${generation.slug}`}
              className="flex min-h-[72px] items-center justify-between gap-4 rounded-[9px] border border-[#e3e6dc] px-4 py-3 transition-colors hover:border-slate-ink"
            >
              <GenerationThumb photo={generation.photo} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">
                  {generation.name}
                  <span className="ml-2 font-normal text-[#686c67]">{generation.years}</span>
                </span>
                <span className="mt-0.5 block text-[9px] text-[#838c77]">
                  {generation.phase ? `${generation.phase} · ` : null}
                  {generation.hasFitments
                    ? generation.configurationCount > 1
                      ? `${generation.configurationCount} équipements d'origine documentés`
                      : "1 équipement d'origine documenté"
                    : 'Compatibilités non encore relevées'}
                </span>
              </span>
              <IconChevronRight className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
