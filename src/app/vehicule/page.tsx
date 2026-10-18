import type { ComponentType, SVGProps } from 'react'
import type { Metadata } from 'next'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'
import { ButtonLink } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Surface'
import { IconArrowRight, IconCar, IconGear, IconHeadset, IconWrench } from '@/components/ui/icons'
import { getSelectedVehicle } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Mon véhicule',
  description:
    "Marque, modèle, année, puis équipement lumineux d'origine : c'est le véhicule qui décide de l'éclairage qui lui correspond, pas le culot de l'ampoule.",
  alternates: { canonical: '/vehicule' },
}

/**
 * Page de sélection du véhicule.
 *
 * Elle explique pourquoi l'information est demandée avant de la demander : sans
 * véhicule, aucune compatibilité ne peut être affirmée, et la page ne fait donc
 * aucune promesse de montage. Les trois états de compatibilité sont décrits en
 * mots ; seul FitmentBadge, en fiche produit, en fait une affirmation.
 */

type Step = {
  title: string
  text: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const steps: Step[] = [
  {
    title: 'Marque, modèle, année',
    text: "Ces trois réponses identifient la génération exacte du véhicule. C'est elle qui porte les blocs optiques, pas le modèle pris au sens large.",
    Icon: IconCar,
  },
  {
    title: "Équipement lumineux d'origine",
    text: "Halogène, xénon d'origine ou LED d'origine : quand une génération a été vendue avec plusieurs équipements, le choix vous revient. Nous ne le devinons pas à votre place.",
    Icon: IconGear,
  },
  {
    title: 'Les produits, emplacement par emplacement',
    text: "Feux de croisement, route, antibrouillards, intérieur, plaque, recul, clignotants. Chaque produit affiche son statut : compatibilité confirmée, informations insuffisantes, ou incompatible.",
    Icon: IconWrench,
  },
]

export default async function Page() {
  const vehicle = await getSelectedVehicle()

  return (
    <div className="pb-16">
      <div className="container-page pt-6">
        <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Mon véhicule' }]} />

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Partons de votre véhicule.</h1>
          <p className="mt-4 text-lg text-muted-strong">
            Un éclairage ne se choisit pas au culot de l&apos;ampoule. Le bloc optique, son
            réflecteur et l&apos;équipement monté en sortie d&apos;usine décident de ce qui peut y
            être installé.
          </p>
          <p className="mt-3 text-base text-muted-strong">
            Deux voitures du même modèle et de la même année peuvent donc demander des pièces
            différentes. C&apos;est pour cette raison que nous partons du véhicule : tant qu&apos;il
            n&apos;est pas connu, nous ne pouvons rien affirmer sur la compatibilité d&apos;un
            produit.
          </p>
        </header>

        {vehicle ? (
          /*
           * Ton neutre, pas `ok` : le vert est réservé à la compatibilité
           * confirmée (voir globals.css). Retenir un véhicule ne valide aucune
           * pièce — c'est FitmentBadge, en fiche produit, qui le fait.
           */
          <Alert tone="info" title={`Véhicule retenu : ${vehicle.label}`} className="mt-8 max-w-3xl">
            {vehicle.equipmentLabel ? (
              <p>Équipement d&apos;origine retenu : {vehicle.equipmentLabel}.</p>
            ) : null}
            <div className="mt-3">
              <ButtonLink
                href="/vehicule/resultats"
                iconRight={<IconArrowRight className="size-5" />}
              >
                Voir mes éclairages
              </ButtonLink>
            </div>
            <p className="mt-3">
              Ce n&apos;est pas le bon véhicule ?{' '}
              <a
                href="#choisir-titre"
                className="font-semibold text-brand underline underline-offset-4"
              >
                Changez-le juste en dessous.
              </a>
            </p>
          </Alert>
        ) : null}

        <section aria-labelledby="choisir-titre" className="mt-10">
          <Card className="max-w-3xl p-5 sm:p-7">
            <h2 id="choisir-titre" className="text-2xl font-extrabold">
              Choisir mon véhicule
            </h2>
            <p className="mt-2 text-sm text-muted-strong">
              L&apos;équipement d&apos;origine n&apos;est pas demandé ici : il vous sera demandé
              juste après, et seulement si votre génération a été vendue avec plusieurs
              équipements.
            </p>
            <VehicleSelector
              layout="stacked"
              currentConfigurationId={vehicle?.configurationId ?? null}
              className="mt-6"
            />
          </Card>
        </section>
      </div>

      <section
        aria-labelledby="etapes-titre"
        className="mt-14 border-y border-line bg-surface-soft"
      >
        <div className="container-page py-12">
          <h2 id="etapes-titre" className="text-[1.75rem] leading-tight font-extrabold">
            Les trois étapes
          </h2>
          <p className="mt-2 max-w-2xl text-base text-muted-strong">
            Le parcours est court, et chaque étape sert à écarter ce qui ne se monte pas.
          </p>

          {/* Les numéros ne font que doubler l'ordre de la liste : retirés du lecteur d'écran. */}
          <ol className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0">
            {steps.map(({ title, text, Icon }, index) => (
              <li
                key={title}
                className={
                  index > 0
                    ? 'flex items-start gap-4 md:border-l md:border-line md:pr-7 md:pl-7'
                    : 'flex items-start gap-4 md:pr-7'
                }
              >
                <span
                  aria-hidden="true"
                  className="text-[2.5rem] leading-none font-extrabold tabular-nums text-line-strong"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Icon className="mt-1 size-7 shrink-0 text-slate-ink" />
                <div className="min-w-0">
                  <h3 className="text-[0.95rem] font-bold text-slate-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-snug text-muted-strong">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="absent-titre" className="container-page mt-14">
        <Card className="max-w-3xl p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <IconHeadset className="mt-1 size-7 shrink-0 text-slate-ink" />
            <div className="min-w-0">
              <h2 id="absent-titre" className="text-2xl font-extrabold">
                Et si mon véhicule n&apos;est pas listé ?
              </h2>
              <p className="mt-3 text-base text-muted-strong">
                Le catalogue véhicules est en cours de constitution. Une marque, un modèle ou une
                année absente de la liste ne signifie pas que votre véhicule est incompatible :
                cela signifie seulement que nous n&apos;avons pas encore saisi ses blocs optiques.
              </p>
              <p className="mt-3 text-base text-muted-strong">
                Dans ce cas, décrivez-nous le véhicule — marque, modèle, année, équipement
                d&apos;origine si vous le connaissez. Nous vous répondrons sur ce qui se monte et
                sur ce que nous ne savons pas encore.
              </p>
              <div className="mt-5">
                <ButtonLink
                  href="/contact"
                  variant="secondary"
                  iconRight={<IconArrowRight className="size-5" />}
                >
                  Décrire mon véhicule
                </ButtonLink>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}
