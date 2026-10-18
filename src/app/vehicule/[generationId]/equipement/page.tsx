import { cache } from 'react'
import type { Metadata } from 'next'
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
        configurations: { where: { active: true }, include: { equipment: true, trim: true } },
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

      <p className="eyebrow mt-6 text-brand">Équipement d&apos;origine</p>
      <h1 className="mt-2 max-w-3xl text-[1.75rem] leading-[1.15] font-extrabold sm:text-[2.125rem]">
        Quel est l&apos;éclairage d&apos;origine de votre {make.name} {generation.name} ?
      </h1>

      <p className="mt-3 text-sm text-muted-strong">
        {generation.model.name} · {years}
        {generation.phase ? ` · ${generation.phase}` : ''}
      </p>

      <p className="mt-5 max-w-2xl text-base text-muted-strong">
        C&apos;est l&apos;équipement monté en usine qui détermine ce qui peut le remplacer : un
        phare halogène et un xénon d&apos;origine n&apos;acceptent pas la même pièce, même quand le
        culot porte le même nom. En cas de doute, l&apos;information est lisible sur l&apos;ampoule
        déposée, ou vous pouvez{' '}
        <Link href={contactPath} className="font-semibold text-brand underline underline-offset-4">
          demander à notre équipe
        </Link>
        .
      </p>

      <section aria-labelledby="equipements-title" className="mt-10">
        <h2 id="equipements-title" className="text-lg font-bold">
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
                      className="flex w-full items-center gap-4 rounded-md border border-line-strong p-4 text-left transition-colors hover:border-slate-ink"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{config.equipment.label}</span>
                        {config.equipment.description ? (
                          <span className="mt-1 block text-sm text-muted-strong">
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

            <p className="mt-8 text-sm text-muted-strong">
              Aucun de ces équipements ne correspond à ce que vous avez sous le capot ?{' '}
              <Link
                href={contactPath}
                className="font-semibold text-brand underline underline-offset-4"
              >
                Écrivez-nous
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
          </>
        )}
      </section>
    </div>
  )
}
