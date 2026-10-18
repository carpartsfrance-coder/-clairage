import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/session'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Surface'
import { TrackOrderForm } from '@/components/account/TrackOrderForm'

export const metadata: Metadata = {
  title: 'Suivre ma commande',
  robots: { index: false, follow: false },
}

/**
 * Page volontairement accessible sans compte : c'est tout l'objet du suivi
 * invité. On lit quand même la session — avec `getCurrentUser`, pas
 * `requireUser` — pour renvoyer un client connecté vers son espace plutôt que
 * de lui faire ressaisir une référence qu'il n'a pas forcément sous les yeux.
 */
export default async function SuiviPage() {
  const user = await getCurrentUser()

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Suivre ma commande' }]} />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Suivre ma commande
      </h1>

      <p className="mt-3 max-w-prose text-base text-muted-strong">
        La référence de votre commande et l&apos;adresse e-mail utilisée lors de la commande
        suffisent. Aucun compte n&apos;est nécessaire.
      </p>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        <section aria-labelledby="suivi-formulaire" className="w-full max-w-md">
          <h2 id="suivi-formulaire" className="sr-only">
            Retrouver une commande
          </h2>
          <TrackOrderForm />
        </section>

        <section aria-labelledby="suivi-compte" className="w-full max-w-md">
          {user ? (
            <Card className="p-5">
              <h2 id="suivi-compte" className="text-lg font-bold">
                Vos commandes sont dans votre espace client
              </h2>
              <p className="mt-2 text-sm text-muted-strong">
                Vous y retrouvez le détail et le suivi des commandes liées à votre compte, sans
                ressaisir de référence. Une commande passée sans compte s&apos;y rattache en
                indiquant sa référence.
              </p>
              <ButtonLink href="/compte/commandes" variant="secondary" className="mt-4">
                Voir mes commandes
              </ButtonLink>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 id="suivi-compte" className="text-lg font-bold">
                Créer un compte
              </h2>
              <p className="mt-2 text-sm text-muted-strong">
                Vos commandes passées en étant connecté sont réunies au même endroit, sans ressaisir
                de référence. Une commande déjà passée sans compte s&apos;y ajoute en indiquant une
                fois sa référence depuis votre espace client.
              </p>
              <ButtonLink href="/inscription" variant="secondary" className="mt-4">
                Créer un compte
              </ButtonLink>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}
