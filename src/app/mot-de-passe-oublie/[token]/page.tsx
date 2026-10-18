import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { ResetPasswordForm } from '@/components/auth/ResetForms'

export const metadata: Metadata = {
  title: 'Nouveau mot de passe',
  robots: { index: false, follow: false },
}

/**
 * Ouverture d'un lien de réinitialisation.
 *
 * Le jeton n'est volontairement PAS vérifié ici. Une page qui afficherait
 * « lien invalide » ou le formulaire selon le jeton deviendrait un oracle :
 * il suffirait d'appeler l'URL avec des jetons au hasard et de regarder la
 * réponse pour savoir lesquels existent encore. Le formulaire est donc toujours
 * rendu, et c'est `resetPassword` qui tranche à la soumission : un jeton
 * inconnu, déjà consommé ou expiré y reçoit le même message, et un jeton valide
 * est consommé à l'usage.
 */
export default async function NouveauMotDePassePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Connexion', href: '/connexion' },
          { label: 'Nouveau mot de passe' },
        ]}
      />

      <div className="mt-6 max-w-md">
        <h1 className="text-[1.75rem] leading-[1.15] font-extrabold text-slate-ink sm:text-[2.125rem]">
          Choisir un nouveau mot de passe
        </h1>

        <div className="mt-7">
          <ResetPasswordForm token={token} />
        </div>

        <p className="mt-5 text-sm text-muted-strong">
          À l&apos;enregistrement, toutes les sessions ouvertes sur votre compte sont déconnectées,
          sur cet appareil comme sur les autres. Vous vous reconnecterez avec ce nouveau mot de
          passe.
        </p>

        <p className="mt-8 border-t border-line pt-6 text-sm text-muted-strong">
          <Link
            href="/mot-de-passe-oublie"
            className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
          >
            Demander un nouveau lien
          </Link>
        </p>
      </div>
    </div>
  )
}
