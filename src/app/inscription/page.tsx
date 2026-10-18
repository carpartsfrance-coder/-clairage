import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { Card } from '@/components/ui/Surface'
import { IconCheck } from '@/components/ui/icons'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { RegisterForm } from '@/components/auth/AuthForms'

export const metadata: Metadata = {
  title: 'Créer un compte',
  robots: { index: false, follow: false },
}

/**
 * Ce que le compte apporte — et rien de plus.
 *
 * La liste se limite à des fonctions qui existent réellement dans l'espace
 * client. Aucune remise, aucun programme de fidélité, aucune livraison
 * privilégiée : rien de tout cela n'est en place, donc rien n'est annoncé.
 */
const avantages = [
  {
    titre: 'Retrouver vos commandes',
    detail: 'Historique et statut de chaque commande, au même endroit.',
  },
  {
    titre: 'Enregistrer vos adresses',
    detail: 'Vos adresses de livraison restent dans votre compte, modifiables à tout moment.',
  },
  {
    titre: 'Enregistrer vos véhicules',
    detail: 'Vous repartez de votre véhicule sans le resaisir à chaque visite.',
  },
]

export default async function InscriptionPage() {
  // Même garde que sur la connexion : un compte déjà ouvert va à son espace.
  const user = await getCurrentUser()
  if (user) redirect('/compte')

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Créer un compte' }]} />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Créer un compte
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,30rem)_1fr] lg:items-start">
        <section aria-labelledby="inscription-formulaire">
          <Card className="p-5 sm:p-6">
            <h2 id="inscription-formulaire" className="text-lg font-bold">
              Vos informations
            </h2>
            <div className="mt-4">
              <RegisterForm />
            </div>
          </Card>
        </section>

        <section aria-labelledby="inscription-avantages">
          <Card className="p-5 sm:p-6">
            <h2 id="inscription-avantages" className="text-lg font-bold">
              Ce que le compte vous apporte
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {avantages.map((avantage) => (
                <li key={avantage.titre} className="flex items-start gap-3">
                  <IconCheck className="mt-0.5 size-5 shrink-0 text-ok" />
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold">{avantage.titre}</span>
                    <span className="block text-muted-strong">{avantage.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-sm text-muted-strong">
              Vous pouvez aussi commander sans compte : le compte sert à retrouver vos commandes
              et vos informations d&apos;une visite à l&apos;autre.
            </p>
          </Card>
        </section>
      </div>
    </div>
  )
}
