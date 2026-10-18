import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { AccountNav } from '@/components/account/AccountNav'
import { PasswordForm, ProfileForm } from '@/components/account/ProfileForms'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Card } from '@/components/ui/Surface'
import { identity } from '@/lib/identity'

/**
 * Profil.
 *
 * `requireUser()` d'abord : aucune lecture avant de savoir qui demande.
 *
 * La requête ci-dessous est la seule exception à la règle « tout passe par
 * queries/account.ts » : il n'y a pas de fonction de lecture du profil, et le
 * besoin tient en un `findUnique` sur l'identifiant de la session. Le `where`
 * porte donc sur `user.id` — pas sur un identifiant reçu de la page.
 */

export const metadata: Metadata = {
  title: 'Mon profil',
  robots: { index: false, follow: false },
}

type Profile = {
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string
}

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, phone: true, email: true },
    })
  } catch (error) {
    console.error('[compte/profil]', error)
    return null
  }
}

export default async function ProfilPage() {
  const user = await requireUser()
  const profile = await loadProfile(user.id)

  // Base indisponible : on retombe sur ce que porte déjà la session plutôt que
  // d'afficher des champs vides qui écraseraient les valeurs enregistrées.
  const defaults = {
    firstName: profile?.firstName ?? user.firstName,
    lastName: profile?.lastName ?? user.lastName,
    phone: profile?.phone ?? null,
  }
  const email = profile?.email ?? user.email

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon compte', href: '/compte' },
          { label: 'Mon profil' },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Mon profil
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="profil" />

        <div className="min-w-0 flex-1 lg:max-w-2xl">
          {/* -----------------------------------------------------------------
              Informations personnelles
              ----------------------------------------------------------------- */}
          <section aria-labelledby="profil-informations">
            <h2 id="profil-informations" className="text-lg font-bold">
              Informations personnelles
            </h2>

            <Card className="mt-4 p-5">
              {/*
                L'adresse e-mail identifie le compte et sert à la récupération
                d'accès : la changer suppose de vérifier la nouvelle adresse, ce
                qui n'existe pas encore. On le dit, sans annoncer de date.
              */}
              <div className="rounded-sm border border-line bg-surface-soft px-4 py-3">
                <p className="text-sm font-semibold">Adresse e-mail</p>
                <p className="mt-0.5 text-sm break-words text-muted-strong">{email}</p>
                <p className="mt-2 text-xs text-muted">
                  La modification de l&apos;adresse e-mail n&apos;est pas encore possible depuis le
                  compte.{' '}
                  <Link
                    href={identity.contact.contactPath}
                    className="font-semibold underline underline-offset-4 hover:text-brand"
                  >
                    Écrivez-nous
                  </Link>{' '}
                  pour la faire changer.
                </p>
              </div>

              <div className="mt-5">
                <ProfileForm defaults={defaults} />
              </div>
            </Card>
          </section>

          {/* -----------------------------------------------------------------
              Mot de passe
              ----------------------------------------------------------------- */}
          <section aria-labelledby="profil-mot-de-passe" className="mt-10">
            <h2 id="profil-mot-de-passe" className="text-lg font-bold">
              Mot de passe
            </h2>

            <Card className="mt-4 p-5">
              <PasswordForm />
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
