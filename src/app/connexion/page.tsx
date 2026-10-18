import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Surface'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { LoginForm } from '@/components/auth/AuthForms'

export const metadata: Metadata = {
  title: 'Connexion',
  robots: { index: false, follow: false },
}

/** Une clé répétée arrive en tableau : on ne garde que la première valeur. */
function readOne(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Connexion.
 *
 * La page ne vérifie pas le mot de passe : elle n'affiche que le formulaire.
 * Le contrôle appartient à l'action `login`, qui est aussi la seule à savoir si
 * un compte existe — et qui n'en dit rien.
 */
export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Déjà connecté : la page de connexion n'a plus d'objet.
  const user = await getCurrentUser()
  if (user) redirect('/compte')

  const sp = await searchParams
  const next = readOne(sp.next)
  const justeReinitialise = readOne(sp.reinitialise) === '1'

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Connexion' }]} />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Se connecter
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,30rem)_1fr] lg:items-start">
        <section aria-labelledby="connexion-identifiants">
          <Card className="p-5 sm:p-6">
            <h2 id="connexion-identifiants" className="text-lg font-bold">
              Vos identifiants
            </h2>
            <div className="mt-4">
              <LoginForm next={next} justeReinitialise={justeReinitialise} />
            </div>
          </Card>
        </section>

        <section aria-labelledby="connexion-sans-compte">
          <Card className="p-5 sm:p-6">
            <h2 id="connexion-sans-compte" className="text-lg font-bold">
              Commander sans compte
            </h2>
            <p className="mt-3 text-sm text-muted-strong">
              La création d&apos;un compte n&apos;est pas obligatoire pour commander. Vous pouvez
              passer commande en renseignant simplement vos coordonnées de livraison.
            </p>
            <p className="mt-3 text-sm text-muted-strong">
              Pour retrouver une commande passée sans compte, il faut sa référence et
              l&apos;adresse e-mail utilisée lors de la commande.
            </p>
            <ButtonLink variant="secondary" href="/suivi" className="mt-5 w-full sm:w-auto">
              Suivre une commande
            </ButtonLink>
          </Card>
        </section>
      </div>
    </div>
  )
}
