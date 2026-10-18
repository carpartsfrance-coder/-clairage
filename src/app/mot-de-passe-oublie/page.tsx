import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { RequestResetForm } from '@/components/auth/ResetForms'

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false, follow: false },
}

export default function MotDePasseOubliePage() {
  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Connexion', href: '/connexion' },
          { label: 'Mot de passe oublié' },
        ]}
      />

      <div className="mt-6 max-w-md">
        <h1 className="text-[1.75rem] leading-[1.15] font-extrabold text-slate-ink sm:text-[2.125rem]">
          Mot de passe oublié
        </h1>
        <p className="mt-3 text-base text-muted-strong">
          Indiquez l&apos;adresse e-mail de votre compte. Si un compte existe pour cette adresse, un
          lien de réinitialisation valable une heure vous sera envoyé.
        </p>

        <div className="mt-7">
          <RequestResetForm />
        </div>

        <p className="mt-8 border-t border-line pt-6 text-sm text-muted-strong">
          <Link
            href="/connexion"
            className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
          >
            Revenir à la connexion
          </Link>
        </p>
      </div>
    </div>
  )
}
