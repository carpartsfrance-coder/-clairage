import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  LIBELLE_PAR_CHEMIN,
  TYPE_PAR_CHEMIN,
  getPackGeneration,
} from '@/lib/queries/packs'
import { getSelectedVehicle } from '@/lib/session'
import { formatPrice } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { EmptyState } from '@/components/ui/Surface'
import { PackReadFailure } from '@/components/packs/PackReadFailure'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconCheckCircle, IconHeadset, IconInfo } from '@/components/ui/icons'
import { produitsSitues, totalVehicule } from '@/lib/packs-vue'
import { PacksParZone } from '@/components/packs/PacksParZone'

type PageProps = {
  params: Promise<{ type: string; marque: string; modele: string; generation: string }>
}

/**
 * Éclairages documentés pour une génération, groupés par emplacement.
 *
 * **Ce que cette page affirme, et ce qu'elle n'affirme pas.** Elle montre ce
 * qui est documenté pour la génération, toutes configurations confondues. Tant
 * que l'équipement d'origine n'est pas choisi, aucune compatibilité n'est
 * confirmée pour LE véhicule du client : la page le dit en tête et mène à
 * l'étape d'équipement. Consulter un modèle ne vaut pas sélection.
 *
 * Les cartes portent le prix du conditionnement conseillé par la règle
 * partagée (`lib/recommendation.ts`) : le même que la fiche produit et les
 * résultats véhicule.
 *
 * **Une seule grille, l'emplacement sur la carte.** La page donnait à chaque
 * emplacement sa section, titre et compteur compris. Sur 10 178 couples
 * (génération, emplacement), 10 068 ne portent qu'un seul produit : le titre
 * coûtait plus de hauteur que ce qu'il annonçait, et sept emplacements
 * tenaient sur trois écrans et demi de téléphone. L'emplacement se lit
 * maintenant sur la carte, ce qui le dit aussi bien et laisse les produits se
 * suivre. Un produit documenté sur deux emplacements n'apparaît qu'une fois,
 * et les nomme tous les deux.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, marque, modele, generation } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  if (!vehicleType) return { title: 'Packs par véhicule' }

  const lecture = await getPackGeneration(vehicleType, marque, modele, generation)
  // Une lecture en échec ne titre pas « introuvable » : on ne l'a pas constaté.
  if (lecture.state !== 'found') {
    return { title: lecture.state === 'absent' ? 'Véhicule introuvable' : 'Packs par véhicule' }
  }

  const data = lecture.data
  return {
    title: `Éclairage ${data.makeName} ${data.generationName} ${data.years}`,
    description: `Les éclairages documentés pour ${data.makeName} ${data.generationName} (${data.years}).`,
    alternates: { canonical: `/packs/${type}/${marque}/${modele}/${generation}` },
  }
}

export default async function PacksGenerationPage({ params }: PageProps) {
  const { type, marque, modele, generation } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!vehicleType || !libelle) notFound()

  const [lecture, vehicle] = await Promise.all([
    getPackGeneration(vehicleType, marque, modele, generation),
    getSelectedVehicle(),
  ])

  /*
    Une génération absente du référentiel reste un 404. Une lecture en échec
    sort ici, avant tout rendu : c'est ce qui l'empêche de passer pour une
    génération inconnue, puis — plus bas — pour une génération dépourvue de
    compatibilités. Rien de ce qui suit n'affirme quoi que ce soit sur un
    véhicule dont la fiche n'a pas été lue.
  */
  if (lecture.state === 'unavailable') return <PackReadFailure type={type} libelle={libelle} />
  if (lecture.state === 'absent') notFound()

  const data = lecture.data
  const situes = produitsSitues(data.groups)
  const totalProduits = situes.length
  const total = totalVehicule(data.groups)
  const plusieursEquipements = data.equipments.length > 1
  /*
    Le véhicule retenu est-il celui de cette page ? On compare la configuration
    choisie aux configurations de la génération : c'est la seule égalité sûre.
    Comparer des libellés ferait passer « A8 D2 » pour « A8 D3 » un jour de
    reformulation.
  */
  const vehiculeChoisi = Boolean(
    vehicle && data.equipments.some((e) => e.configurationId === vehicle.configurationId),
  )

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: libelle.long, href: `/packs/${type}` },
          { label: data.makeName, href: `/packs/${type}/${marque}` },
          { label: data.modelName, href: `/packs/${type}/${marque}/${modele}` },
          { label: `${data.generationName} ${data.years}` },
        ]}
      />

      {/*
        Le bandeau véhicule.

        La page parlait d'une voiture sans jamais la montrer, et annonçait en
        petits caractères gris qu'un autre véhicule était retenu — un Duster
        sur la page d'une A8. La photo dit de quelle voiture il s'agit avant
        qu'on ait lu le titre, et l'état de sélection se lit d'un coup d'œil :
        choisie, ou à choisir.
      */}
      <section className="relative mt-2 overflow-hidden rounded-xl bg-gradient-to-br from-[#f7f7f8] to-[#e9eaec] px-5 py-5 fiche:px-8 fiche:py-8">
        {/*
          Sur téléphone la photo est dans le bandeau, au-dessus du titre : la
          poser en dessous ajoutait un bloc entier à faire défiler avant
          d'atteindre le premier kit.
        */}
        {data.photo ? (
          <div className="relative mb-2 h-[112px] fiche:hidden">
            <Image
              src={data.photo.url}
              alt={data.photo.alt}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>
        ) : null}

        <div className="relative z-[1] max-w-[520px]">
          <p className="text-[10px] font-bold tracking-[1.2px] text-muted-strong uppercase">
            Votre véhicule
          </p>
          <h1 className="mt-1.5 text-[25px] leading-[1.1] font-bold tracking-[-0.9px] fiche:text-[32px] fiche:tracking-[-1.2px]">
            Éclairage {data.makeName} {data.generationName}
            <span className="block font-normal text-[#686c67]">{data.years}</span>
          </h1>
          {data.phase ? (
            <p className="mt-1 text-[11px] text-muted-strong">{data.phase}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {vehiculeChoisi ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bfe3c8] bg-[#eef8f0] px-3 py-1.5 text-[12px] font-semibold text-[#216b33]">
                  <IconCheckCircle className="size-4 shrink-0" />
                  Véhicule sélectionné
                </span>
                <Link
                  href="/vehicule"
                  className="text-[12px] font-semibold text-slate-ink underline underline-offset-4 decoration-line-strong hover:decoration-brand hover:text-brand"
                >
                  Modifier
                </Link>
              </>
            ) : (
              <ButtonLink
                href="/vehicule"
                className="min-h-[43px] gap-4 rounded-[7px] px-[17px] text-[12px]"
                iconRight={<IconArrowRight className="size-4" />}
              >
                {plusieursEquipements
                  ? "Indiquer mon équipement d'origine"
                  : 'Choisir ce véhicule'}
              </ButtonLink>
            )}
          </div>

          <p className="mt-3 text-[13px] text-[#4f5356]">
            {totalProduits > 0
              ? 'Choisissez l’éclairage à remplacer.'
              : 'Aucun éclairage n’est encore documenté pour cette génération.'}
          </p>
        </div>

        {data.photo ? (
          <div className="pointer-events-none absolute top-1/2 right-0 hidden h-[78%] w-[46%] -translate-y-1/2 fiche:block">
            <Image
              src={data.photo.url}
              alt={data.photo.alt}
              fill
              sizes="46vw"
              className="object-contain object-right"
              priority
            />
          </div>
        ) : null}
      </section>

      {/*
        L'avertissement qui empêche cette page de mentir.

        Elle montre ce qui est documenté pour la génération. Si celle-ci a été
        vendue avec plusieurs équipements d'origine, aucun des statuts affichés
        ne vaut pour un véhicule donné tant que l'équipement n'est pas choisi.
      */}
      {totalProduits > 0 && plusieursEquipements ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-[7px] bg-warn-soft p-3 text-[#8d5420]">
          <IconInfo className="mt-px size-4 shrink-0" />
          <div className="min-w-0 text-[11px] leading-[1.7]">
            <p className="font-bold">
              Cette génération a été vendue avec {data.equipments.length} équipements
              d&apos;origine.
            </p>
            <p>
              Un phare halogène et un xénon n&apos;acceptent pas les mêmes pièces. Les éclairages
              ci-dessous sont ceux documentés pour la génération ; indiquez votre équipement pour
              savoir lesquels conviennent à votre véhicule.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {data.equipments.map((equipment) => (
                <span key={equipment.configurationId} className="font-semibold">
                  {equipment.label}
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      {totalProduits === 0 ? (
        <EmptyState
          className="mt-6"
          title="Aucun éclairage n'est encore documenté pour cette génération."
          description="Les compatibilités sont relevées véhicule par véhicule. Dites-nous lequel vous avez : nous les vérifions et vous répondons."
          action={{ label: 'Faire vérifier mon véhicule', href: '/verification' }}
        />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 fiche:mt-8">
            <h2 className="text-[20px] leading-tight font-bold tracking-[-0.6px] fiche:text-[23px]">
              Les kits pour votre {data.makeName} {data.generationName}
              <span className="ml-2.5 text-[13px] font-normal text-[#828282]">
                {totalProduits} kit{totalProduits > 1 ? 's' : ''}
              </span>
            </h2>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-ink underline underline-offset-4 decoration-line-strong hover:decoration-brand hover:text-brand"
            >
              <IconHeadset className="size-4 shrink-0" strokeWidth={1.5} />
              Un doute sur votre montage ?
            </Link>
          </div>

          {/*
            Ce que coûte l'éclairage complet.

            La page alignait les prix sans jamais les additionner, alors que
            c'est la question de qui équipe sa voiture. Le total est celui des
            prix affichés juste en dessous, incompatibles exclus : un client qui
            additionne les cartes doit retomber dessus, sans quoi il doutera du
            reste de la page.
          */}
          {total.produits > 1 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[9px] border border-line bg-surface-paper px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[13px] font-bold fiche:text-[14px]">
                  Tout l&apos;éclairage de votre {data.makeName} {data.generationName}
                </p>
                <p className="mt-0.5 text-[10px] text-[#828282]">
                  {total.emplacements} emplacement{total.emplacements > 1 ? 's' : ''} ·{' '}
                  {total.produits} référence{total.produits > 1 ? 's' : ''} · prix des packs
                  conseillés
                </p>
              </div>
              <strong className="text-[19px] tracking-[-0.5px] fiche:text-[21px]">
                {formatPrice(total.totalCents)}
              </strong>
            </div>
          ) : null}

          <PacksParZone produits={situes} />
        </>
      )}
    </div>
  )
}
