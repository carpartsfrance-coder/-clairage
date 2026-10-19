import { cache } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { VEHICLE_COOKIE } from '@/lib/session'
import { identity } from '@/lib/identity'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { ButtonLink } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { IconChevronRight } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Étape d'équipement lumineux d'origine.
 *
 * C'est le point de bascule du parcours : un phare halogène et un xénon
 * d'origine n'acceptent pas la même pièce, même culot identique. On ne tranche
 * donc jamais à la place du client — une seule option affichée reste une
 * option qu'il valide lui-même.
 */

/**
 * Lecture locale : il n'existe pas encore de fonction dédiée dans
 * src/lib/queries. `cache` évite de requêter deux fois (generateMetadata puis
 * la page) sur une même requête.
 *
 * `null` en retour signifie « lecture impossible », ce qui n'est pas la même
 * chose que `{ generation: null }` (« cette génération n'existe pas ») : une
 * base injoignable ne doit pas se dire au client comme une page inexistante.
 */
const getGeneration = cache(async function getGeneration(id: string) {
  try {
    const generation = await prisma.vehicleGeneration.findFirst({
      where: { id, active: true },
      include: {
        model: { include: { make: true } },
        configurations: {
          where: { active: true },
          include: {
            // L'illustration est facultative : elle n'est rendue que si un
            // média lui a été rattaché.
            equipment: { include: { illustration: true } },
            trim: true,
          },
        },
      },
    })
    return { generation }
  } catch (error) {
    console.error('[vehicule/equipement]', error)
    return null
  }
})

/** « 2012–2019 » ou « depuis 2020 » — même formulation que le header. */
function yearsLabel(yearFrom: number, yearTo: number | null) {
  return yearTo ? `${yearFrom}–${yearTo}` : `depuis ${yearFrom}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ generationId: string }>
}): Promise<Metadata> {
  const { generationId } = await params
  const generation = (await getGeneration(generationId))?.generation
  const title = generation
    ? `Éclairage d'origine — ${generation.model.make.name} ${generation.name}`
    : "Éclairage d'origine"

  return {
    title,
    // Étape de parcours : rien à indexer, et surtout rien à faire entrer par là.
    robots: { index: false, follow: false },
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ generationId: string }>
}) {
  const { generationId } = await params
  const contactPath = identity.contact.contactPath
  const read = await getGeneration(generationId)

  /**
   * Lecture impossible : on le dit. Un 404 affirmerait que cette génération
   * n'existe pas, alors que nous n'en savons rien tant que la base ne répond
   * pas — et ferait passer une panne passagère pour une absence définitive.
   */
  if (!read) {
    return (
      <div className="container-page py-10 sm:py-14">
        <Breadcrumb
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Mon véhicule', href: '/vehicule' },
            { label: "Équipement d'origine" },
          ]}
        />
        <h1 className="mt-6 max-w-3xl text-[1.75rem] leading-[1.15] font-extrabold sm:text-[2.125rem]">
          Équipement d&apos;origine
        </h1>
        <Alert
          tone="danger"
          title="Véhicule momentanément illisible"
          live="polite"
          className="mt-6 max-w-2xl"
        >
          Les équipements d&apos;origine de ce véhicule n&apos;ont pas pu être lus. Nous
          n&apos;affichons rien plutôt que de laisser croire que cette génération n&apos;existe
          pas. Réessayez dans un instant, ou{' '}
          <Link href={contactPath} className="font-semibold underline underline-offset-4">
            contactez-nous
          </Link>
          .
        </Alert>
        <div className="mt-6">
          <ButtonLink href="/vehicule" variant="secondary">
            Choisir un autre véhicule
          </ButtonLink>
        </div>
      </div>
    )
  }

  const generation = read.generation
  if (!generation) notFound()

  // Équipement déjà retenu, pour le marquer au lieu de repartir de zéro.
  const store = await cookies()
  const configurationRetenue = store.get(VEHICLE_COOKIE)?.value ?? null

  /**
   * Enregistre la configuration choisie pour la session, puis enchaîne sur les
   * résultats. Le cookie est la même clé que celle lue par getSelectedVehicle.
   */
  async function choisir(formData: FormData) {
    'use server'
    const configurationId = String(formData.get('configurationId') ?? '')
    if (!configurationId) return
    const store = await cookies()
    store.set(VEHICLE_COOKIE, configurationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    })
    redirect('/vehicule/resultats')
  }

  const make = generation.model.make
  const vehicleLabel = `${make.name} ${generation.name}`
  const years = yearsLabel(generation.yearFrom, generation.yearTo)

  /**
   * Ordre d'affichage : `position` de l'équipement (halogène avant xénon avant
   * LED, tel que réglé côté admin), puis libellé. Le tri est fait ici pour ne
   * pas dépendre d'un ordre de retour non garanti.
   */
  const configurations = [...generation.configurations].sort(
    (a, b) =>
      a.equipment.position - b.equipment.position ||
      a.equipment.label.localeCompare(b.equipment.label, 'fr'),
  )

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon véhicule', href: '/vehicule' },
          { label: vehicleLabel },
        ]}
      />

      {/*
        La question d'abord, les choix tout de suite après.

        Cet écran ouvrait sur un paragraphe de six lignes expliquant pourquoi
        la question se pose : sur un téléphone, il fallait le faire défiler
        avant de voir le premier choix. L'explication n'a pas disparu — elle
        est repliée sous les cartes, là où elle sert ceux qui hésitent.
      */}
      <p className="eyebrow mt-6 text-brand">Équipement d&apos;origine</p>
      <h1 className="mt-2 max-w-3xl text-[25px] leading-[1.15] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Quel éclairage avez-vous d&apos;origine ?
      </h1>

      <p className="mt-2 text-[11px] text-muted-strong">
        {make.name} {generation.name} · {years}
        {generation.phase ? ` · ${generation.phase}` : ''}
      </p>

      <section aria-labelledby="equipements-title" className="mt-6">
        <h2 id="equipements-title" className="sr-only">
          Équipements documentés pour cette génération
        </h2>

        {configurations.length === 0 ? (
          <>
            <Alert tone="warn" title="Équipement non encore documenté" className="mt-4 max-w-2xl">
              Nous n&apos;avons pas encore relevé les équipements d&apos;origine de cette
              génération. Cela ne veut pas dire que rien ne lui correspond : sans cette
              information, nous ne pouvons simplement pas l&apos;affirmer. Indiquez-nous votre
              véhicule et nous la vérifions.
            </Alert>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href={contactPath}>Nous indiquer ce véhicule</ButtonLink>
              <ButtonLink href="/vehicule" variant="secondary">
                Choisir un autre véhicule
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <form action={choisir}>
              <ul className="mt-4 flex flex-col gap-3">
                {configurations.map((config) => (
                  <li key={config.id}>
                    <button
                      type="submit"
                      name="configurationId"
                      value={config.id}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-lg p-4 text-left transition-colors',
                        config.id === configurationRetenue
                          ? 'border-[1.5px] border-brand bg-[#fdf6f5]'
                          : 'border border-[#ddddda] hover:border-slate-ink',
                      )}
                    >
                      {/*
                        Illustration explicative, quand elle existe.

                        Rien n'est affiché à la place si elle manque : une photo
                        d'illustration générique sur un écran qui sert à
                        reconnaître SON propre phare induirait en erreur. Pour
                        en ajouter une, rattacher un média à
                        `LightingEquipment.illustration` — aucun autre
                        changement n'est nécessaire ici.
                      */}
                      {config.equipment.illustration ? (
                        <Image
                          src={config.equipment.illustration.url}
                          alt={config.equipment.illustration.alt ?? ''}
                          width={96}
                          height={96}
                          className="size-24 shrink-0 rounded-sm border border-line bg-surface-muted object-cover"
                        />
                      ) : null}

                      <span className="min-w-0 flex-1">
                        {config.id === configurationRetenue ? (
                          <span className="mb-1 block text-[7px] font-bold tracking-[0.7px] text-brand uppercase">
                            Votre choix actuel
                          </span>
                        ) : null}
                        <span className="block text-[13px] font-bold">
                          {config.equipment.label}
                        </span>
                        {/* Le repère avant la description : il est écrit pour
                            quelqu'un qui regarde ses phares. */}
                        {config.equipment.hint ? (
                          <span className="mt-1 block text-[11px] text-slate-ink">
                            {config.equipment.hint}
                          </span>
                        ) : null}
                        {config.equipment.description ? (
                          <span className="mt-1 block text-[10px] leading-[1.7] text-muted-strong">
                            {config.equipment.description}
                          </span>
                        ) : null}
                        {config.trim?.name ? (
                          <span className="mt-1 block text-sm text-muted-strong">
                            Finition : {config.trim.name}
                          </span>
                        ) : null}
                        {/* Discrimine deux configurations de même équipement. */}
                        {config.headlampRef ? (
                          <span className="mt-1 block text-sm text-muted">
                            Bloc optique : {config.headlampRef}
                          </span>
                        ) : null}
                        {config.label ? (
                          <span className="mt-1 block text-sm text-muted">{config.label}</span>
                        ) : null}
                      </span>
                      <IconChevronRight className="size-5 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </form>

            {/*
              « Je ne sais pas » est une réponse, et elle doit avoir sa place —
              juste sous les cartes, visible sans défiler.

              Sans elle, quelqu'un d'incertain choisit au hasard — et un choix
              au hasard ici produit une compatibilité affirmée sur la mauvaise
              configuration. Elle ouvre maintenant une vraie demande, avec le
              véhicule déjà renseigné, au lieu de renvoyer vers une page de
              contact qui n'est pas construite.
            */}
            <div className="mt-4 rounded-[7px] bg-[#f7f7f3] p-[15px]">
              <p className="text-[12px] font-bold">Vous ne savez pas lequel vous avez ?</p>
              <p className="mt-1.5 text-[10px] leading-[1.7] text-[#7f8775]">
                Ne choisissez pas au hasard : un halogène et un xénon n&apos;acceptent pas la même
                pièce. Nous l&apos;identifions à partir de votre véhicule.
              </p>
              <div className="mt-3">
                <ButtonLink
                  href={`/verification?generation=${generation.id}`}
                  variant="secondary"
                  className="min-h-[42px] gap-3 rounded-md px-[17px] text-[11px]"
                >
                  Je ne sais pas, aidez-moi
                </ButtonLink>
              </div>
            </div>

            {/* L'explication longue, rangée : elle ouvrait la page et repoussait
                les choix sous la ligne de flottaison en mobile. */}
            <details className="group mt-4 border-t border-line pt-4">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[11px] font-semibold [&::-webkit-details-marker]:hidden">
                Pourquoi cette question change tout
                <span aria-hidden="true" className="ml-2 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-2 max-w-2xl text-[11px] leading-[1.8] text-muted-strong">
                <p>
                  C&apos;est l&apos;équipement monté en usine qui détermine ce qui peut le
                  remplacer : un phare halogène et un xénon d&apos;origine n&apos;acceptent pas la
                  même pièce, même quand le culot porte le même nom. L&apos;information est
                  généralement lisible sur l&apos;ampoule déposée.
                </p>
                <p className="mt-2">
                  Aucun de ces équipements ne correspond à ce que vous avez sous le capot ?{' '}
                  <Link
                    href={`/verification?generation=${generation.id}`}
                    className="font-semibold text-brand underline underline-offset-4"
                  >
                    Dites-le-nous
                  </Link>{' '}
                  plutôt que de choisir au hasard, ou{' '}
                  <Link
                    href="/vehicule"
                    className="font-semibold text-brand underline underline-offset-4"
                  >
                    reprenez la sélection du véhicule
                  </Link>
                  .
                </p>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  )
}
