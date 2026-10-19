import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  LIBELLE_PAR_CHEMIN,
  TYPE_PAR_CHEMIN,
  getPackMake,
} from '@/lib/queries/packs'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { MakeSearch } from '@/components/packs/MakeSearch'
import { IconChevronRight } from '@/components/ui/icons'

type PageProps = { params: Promise<{ type: string; marque: string }> }

/**
 * Modèles d'une marque, et les générations de chacun.
 *
 * Deuxième niveau du parcours. Les générations sont nommées avec leurs
 * années — « Golf VII · 2012–2016 » — parce que c'est la seule chose qui
 * permette au client de reconnaître la sienne. Une génération sans
 * compatibilité enregistrée reste affichée, mais le dit : c'est une
 * information utile, et la masquer donnerait à croire que le modèle n'existe
 * pas au catalogue.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, marque } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  if (!vehicleType) return { title: 'Packs par véhicule' }

  const make = await getPackMake(vehicleType, marque)
  if (!make) return { title: 'Marque introuvable' }

  return {
    title: `Éclairage ${make.name}`,
    description: `Les éclairages documentés pour les modèles ${make.name}.`,
    alternates: { canonical: `/packs/${type}/${marque}` },
  }
}

export default async function PacksMarquePage({ params }: PageProps) {
  const { type, marque } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!vehicleType || !libelle) notFound()

  const make = await getPackMake(vehicleType, marque)
  if (!make) notFound()

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: libelle.long, href: `/packs/${type}` },
          { label: make.name },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Éclairage {make.name}
      </h1>
      <p className="mt-2 max-w-[580px] text-[11px] leading-[1.8] text-[#7b8074]">
        Choisissez votre modèle et sa période de fabrication. Les années indiquées sont celles de
        la génération, pas celles de la première immatriculation.
      </p>

      <MakeSearch
        makes={make.models.map((model) => ({
          slug: model.slug,
          name: model.name,
          href: `/packs/${type}/${marque}/${model.slug}`,
          hint:
            model.generations.length > 1
              ? `${model.generations.length} générations`
              : model.generations[0]?.years,
        }))}
        label="Rechercher un modèle"
      />

      <ul className="mt-5 flex flex-col gap-3">
        {make.models.map((model) => (
          <li key={model.slug} className="rounded-[9px] border border-[#e3e6dc]">
            <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-bold">
                <Link
                  href={`/packs/${type}/${marque}/${model.slug}`}
                  className="underline-offset-[3px] hover:underline"
                >
                  {model.name}
                </Link>
              </h2>
              <span className="shrink-0 text-[9px] text-[#838c77]">
                {model.generations.length > 1
                  ? `${model.generations.length} générations`
                  : '1 génération'}
              </span>
            </div>

            {/*
              Les générations sont listées directement : avec une ou deux par
              modèle, ouvrir une page intermédiaire pour choisir entre deux
              liens coûterait un clic pour rien. La page du modèle existe tout
              de même, et le titre y mène.
            */}
            <ul className="divide-y divide-line">
              {model.generations.map((generation) => (
                <li key={generation.slug}>
                  <Link
                    href={`/packs/${type}/${marque}/${model.slug}/${generation.slug}`}
                    className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-surface-soft"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold">
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
          </li>
        ))}
      </ul>
    </div>
  )
}
