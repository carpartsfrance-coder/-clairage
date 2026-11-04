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
import { FitmentBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconInfo } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { nomDuConditionnement, produitsSitues, totalVehicule } from '@/lib/packs-vue'

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

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Éclairage {data.makeName} {data.generationName}
        <span className="ml-2 font-normal text-[#686c67]">{data.years}</span>
      </h1>
      {data.phase ? (
        <p className="mt-1 text-[11px] text-muted-strong">{data.phase}</p>
      ) : null}

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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ButtonLink
          href="/vehicule"
          className="min-h-[43px] gap-4 rounded-[7px] px-[17px] text-[11px]"
          iconRight={<IconArrowRight className="size-4" />}
        >
          {plusieursEquipements
            ? "Indiquer mon équipement d'origine"
            : 'Choisir ce véhicule'}
        </ButtonLink>

        {vehicle ? (
          <p className="text-[10px] text-muted-strong">
            Véhicule actuellement retenu :{' '}
            <span className="font-semibold text-slate-ink">{vehicle.label}</span>
          </p>
        ) : null}
      </div>

      {totalProduits === 0 ? (
        <EmptyState
          className="mt-6"
          title="Aucun éclairage n'est encore documenté pour cette génération."
          description="Les compatibilités sont relevées véhicule par véhicule. Dites-nous lequel vous avez : nous les vérifions et vous répondons."
          action={{ label: 'Faire vérifier mon véhicule', href: '/verification' }}
        />
      ) : (
        <>
          {/*
            Ce que coûte l'éclairage complet.

            La page alignait cinq prix sans jamais les additionner, alors que
            c'est la question de qui équipe sa voiture. Le total est celui des
            prix affichés juste en dessous, incompatibles exclus : un client qui
            additionne les cartes doit retomber dessus, sans quoi il doutera du
            reste de la page.
          */}
          {total.produits > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[9px] border border-[#e1e1e1] bg-surface-paper px-4 py-3.5">
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

          {/*
            Le même découpage que la liste d'une rubrique (`/c/[slug]`), et les
            mêmes seuils : deux écrans du site qui alignent des cartes de
            produits ne doivent pas se répondre à des largeurs différentes.
          */}
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {situes.map(({ produit, emplacements }) => {
              const conditionnement = nomDuConditionnement(produit)
              return (
                <li key={produit.productSlug}>
                  <Link
                    href={`/p/${produit.productSlug}`}
                    className={cn(
                      'flex h-full gap-3 rounded-[9px] border border-[#e1e1e1] p-3 transition-colors hover:border-slate-ink',
                      produit.status === 'INCOMPATIBLE' && 'opacity-75',
                    )}
                  >
                    <span className="relative size-[86px] shrink-0 overflow-hidden rounded-md bg-surface-paper">
                      {produit.image ? (
                        <Image
                          src={produit.image.url}
                          alt=""
                          fill
                          sizes="86px"
                          className="object-contain p-1"
                        />
                      ) : null}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col">
                      {/*
                        L'emplacement, là où était le titre de section. C'est
                        lui qu'on parcourt des yeux : il passe donc au-dessus du
                        nom, en surtitre, et non en pastille parmi d'autres.
                      */}
                      <span className="text-[9px] font-bold tracking-[0.7px] text-accent uppercase">
                        {emplacements.join(' · ')}
                      </span>
                      <span className="mt-0.5 text-[12px] leading-[1.35] font-bold">
                        {produit.productName}
                      </span>
                      {/*
                        L'accroche ne figure pas ici. Elle dit « Pour les
                        antibrouillards de votre Peugeot 207 » : le surtitre
                        donne déjà l'emplacement, le nom donne déjà le véhicule,
                        et le titre de la page le redonne une troisième fois.
                        Deux lignes de téléphone par carte pour rien.
                      */}
                      {/* Contenu essentiel du conditionnement conseillé. */}
                      {produit.contents.length > 0 ? (
                        <span className="mt-1 line-clamp-2 text-[9px] text-[#828282]">
                          {produit.contents.join(' + ')}
                        </span>
                      ) : null}

                      <span className="mt-auto flex items-end justify-between gap-2 pt-2">
                        <span className="min-w-0">
                          {conditionnement ? (
                            <span className="block text-[9px] text-[#898989]">
                              {conditionnement}
                            </span>
                          ) : null}
                          <strong className="block text-[15px] tracking-[-0.4px]">
                            {formatPrice(produit.recommended?.priceCents ?? produit.fromPriceCents)}
                          </strong>
                        </span>
                        <FitmentBadge status={produit.status} short className="shrink-0" />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
