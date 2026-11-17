import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  LIBELLE_PAR_CHEMIN,
  TYPE_PAR_CHEMIN,
  getPackMake,
  type PackModel,
} from '@/lib/queries/packs'
import { dureeGarantie } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { BreadcrumbStructuredData } from '@/components/seo/StructuredData'
import { MakeSearch } from '@/components/packs/MakeSearch'
import { PackReadFailure } from '@/components/packs/PackReadFailure'
import { IconChevronRight } from '@/components/ui/icons'
import { GenerationThumb } from '@/components/packs/GenerationThumb'
import { resumeDeGeneration } from '@/lib/packs-vue'

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
  // « Introuvable » est une affirmation : elle demande de l'avoir constaté.
  // Une lecture en échec s'en tient au titre du niveau au-dessus.
  if (make.state !== 'found') {
  /*
    `noindex` sur l'absence, et sur elle seule.

    Le 404 suffirait à tenir Google à l'écart, mais il n'est pas toujours lu
    comme tel par les outils tiers, et le `noindex` global vient aujourd'hui du
    mode préproduction : le jour où il s'éteindra, cette page le perdrait.
    Deux mécanismes valent mieux qu'un sur une adresse qu'un véhicule
    redeviendra peut-être.

    Rien de tel sur `unavailable` : une base injoignable n'est pas une page
    absente, et demander à Google de désindexer une page qui existe à cause
    d'un incident de lecture coûterait des mois à rattraper.
  */
    return make.state === 'absent'
      ? { title: 'Marque introuvable', robots: { index: false, follow: false } }
      : { title: 'Packs par véhicule' }
  }

  /*
    « Les éclairages documentés pour les modèles Renault » ne disait pas ce
    que la page offre (audit du 16 novembre 2026). Le titre nomme la
    recherche du client, la description la promesse et le nombre de modèles,
    tirés du catalogue — rien qui ne soit sur la page.
  */
  const nombreDeModeles = make.data.models.length
  return {
    title: `Éclairage LED ${make.data.name} : packs par modèle`,
    description: [
      `Choisissez votre ${make.data.name} et sa génération : packs LED et effet xénon composés pour votre véhicule, emplacement par emplacement.`,
      nombreDeModeles > 1 ? `${nombreDeModeles} modèles proposés.` : '',
      dureeGarantie() ? `Garantie ${dureeGarantie()}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    alternates: { canonical: `/packs/${type}/${marque}` },
  }
}

/**
 * Où mène le nom d'un modèle.
 *
 * Avec une seule génération, la page du modèle n'aurait qu'une ligne à
 * proposer : le lien saute cette étape et ouvre la génération.
 */
function lienDuModele(type: string, marque: string, model: PackModel): string {
  const [seule] = model.generations
  return model.generations.length === 1 && seule
    ? `/packs/${type}/${marque}/${model.slug}/${seule.slug}`
    : `/packs/${type}/${marque}/${model.slug}`
}

export default async function PacksMarquePage({ params }: PageProps) {
  const { type, marque } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!vehicleType || !libelle) notFound()

  /*
    Trois issues, trois réponses. Une marque absente du référentiel reste un
    404 — c'est une absence constatée. Une lecture en échec rendait le même
    404, qui affirmait au client que sa marque n'était pas référencée alors
    que rien ne permettait de le dire.
  */
  const make = await getPackMake(vehicleType, marque)
  if (make.state === 'unavailable') return <PackReadFailure type={type} libelle={libelle} />
  if (make.state === 'absent') notFound()

  const { name: makeName, models } = make.data

  // Le même fil pour l'affichage et pour Google (BreadcrumbList) : deux
  // listes finiraient par diverger, et c'est le balisage qu'on ne relit pas.
  const filDAriane = [
    { label: 'Accueil', href: '/' },
    { label: libelle.long, href: `/packs/${type}` },
    { label: makeName },
  ]

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb items={filDAriane} />
      <BreadcrumbStructuredData items={filDAriane} />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Éclairage {makeName}
      </h1>
      <p className="mt-2 max-w-[580px] text-[11px] leading-[1.8] text-[#7a7a7a]">
        Choisissez votre modèle et sa période de fabrication. Les années indiquées sont celles de
        la génération, pas celles de la première immatriculation.
      </p>

      <MakeSearch
        makes={models.map((model) => ({
          slug: model.slug,
          name: model.name,
          href: lienDuModele(type, marque, model),
          hint:
            model.generations.length > 1
              ? `${model.generations.length} générations`
              : model.generations[0]?.years,
        }))}
        label="Rechercher un modèle"
      />

      {/*
        Deux colonnes dès 768 px, et une seule ligne par modèle à génération
        unique.

        La page Renault faisait près de 8 000 px sur téléphone pour 57 modèles
        (audit du 16 novembre 2026) : chaque modèle à une génération y prenait
        deux étages — « Arkana · 1 génération », puis « Arkana 2021–2025 » —
        qui disaient deux fois la même chose. Il n'en prend plus qu'un, qui
        mène tout droit à la génération.
      */}
      <ul className="mt-5 grid items-start gap-3 md:grid-cols-2">
        {models.map((model) =>
          model.generations.length === 1 && model.generations[0] ? (
            <li key={model.slug} className="rounded-[9px] border border-[#e1e1e1]">
              <Link
                href={`/packs/${type}/${marque}/${model.slug}/${model.generations[0].slug}`}
                className="flex min-h-14 items-center justify-between gap-4 rounded-[9px] px-4 py-2.5 transition-colors hover:bg-surface-soft"
              >
                <GenerationThumb photo={model.generations[0].photo} className="h-[38px] w-[56px]" />
                <span className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-bold">
                    {model.name}
                    <span className="ml-2 text-[12px] font-normal text-[#686c67]">
                      {model.generations[0].years}
                    </span>
                  </h2>
                  <span className="mt-0.5 block text-[9px] text-[#828282]">
                    {model.generations[0].phase ? `${model.generations[0].phase} · ` : null}
                    {resumeDeGeneration(model.generations[0])}
                  </span>
                </span>
                <IconChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          ) : (
            <li key={model.slug} className="rounded-[9px] border border-[#e1e1e1]">
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                <h2 className="text-[14px] font-bold">
                  <Link
                    href={lienDuModele(type, marque, model)}
                    className="underline-offset-[3px] hover:underline"
                  >
                    {model.name}
                  </Link>
                </h2>
                <span className="shrink-0 text-[9px] text-[#828282]">
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
                      <GenerationThumb photo={generation.photo} className="h-[38px] w-[56px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold">
                          {generation.name}
                          <span className="ml-2 font-normal text-[#686c67]">
                            {generation.years}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[9px] text-[#828282]">
                          {generation.phase ? `${generation.phase} · ` : null}
                          {resumeDeGeneration(generation)}
                        </span>
                      </span>
                      <IconChevronRight className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
