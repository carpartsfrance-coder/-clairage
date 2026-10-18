import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/session'
import { getMyAddresses } from '@/lib/queries/account'
import { deleteAddress } from '@/lib/actions/account'
import { AccountNav } from '@/components/account/AccountNav'
import { AddressForm } from '@/components/account/AddressForm'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'

/**
 * Carnet d'adresses.
 *
 * `requireUser()` est la première instruction : le contrôle d'accès est fait
 * côté serveur, avant toute lecture. La lecture passe par `getMyAddresses`, qui
 * pose `userId` dans le `where` — aucune requête Prisma n'est écrite ici.
 */

export const metadata: Metadata = {
  title: 'Mes adresses',
  robots: { index: false, follow: false },
}

/** Résumé de <details> : cible tactile confortable, état visible au clavier. */
const summaryClass =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold ' +
  'text-slate-ink underline underline-offset-4 decoration-line-strong ' +
  'hover:decoration-brand hover:text-brand'

/** Seul code pays accepté à ce jour (voir le select du formulaire). */
const countryNames: Record<string, string> = { FR: 'France' }

export default async function MesAdressesPage() {
  const user = await requireUser()
  const addresses = await getMyAddresses(user.id)

  return (
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Mon compte', href: '/compte' },
          { label: 'Mes adresses' },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Mes adresses
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <AccountNav current="adresses" />

        <section aria-labelledby="adresses-liste" className="min-w-0 flex-1">
          <h2 id="adresses-liste" className="sr-only">
            Adresses enregistrées
          </h2>

          {addresses.length === 0 ? (
            <EmptyState
              title="Aucune adresse enregistrée."
              description="Conservez ici vos adresses de livraison et de facturation."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {addresses.map((address) => {
                // Désigne l'adresse dans les libellés d'action, pour que
                // « Supprimer » dise toujours laquelle.
                const designation = address.label || address.city

                return (
                  <Card as="li" key={address.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {address.label ? <p className="font-bold">{address.label}</p> : null}
                        <p className={address.label ? 'text-sm text-muted-strong' : 'font-bold'}>
                          {address.firstName} {address.lastName}
                        </p>
                      </div>
                      {address.isDefaultShipping ? <Badge tone="ok">Par défaut</Badge> : null}
                    </div>

                    <address className="mt-3 text-sm text-muted-strong not-italic">
                      {address.company ? <span className="block">{address.company}</span> : null}
                      <span className="block">{address.line1}</span>
                      {address.line2 ? <span className="block">{address.line2}</span> : null}
                      <span className="block">
                        {address.postalCode} {address.city}
                      </span>
                      <span className="block">
                        {countryNames[address.country] ?? address.country}
                      </span>
                      {address.phone ? <span className="block">{address.phone}</span> : null}
                    </address>

                    {/*
                      Les deux actions sont empilées : le formulaire de
                      modification s'ouvre sous son propre résumé, sans
                      déplacer le bouton de suppression.
                    */}
                    <div className="mt-4 flex flex-col items-start border-t border-line pt-2">
                      <details>
                        <summary className={summaryClass}>Modifier</summary>
                        <div className="mt-4 mb-2">
                          <AddressForm address={address} />
                        </div>
                      </details>

                      <form action={deleteAddress}>
                        <input type="hidden" name="id" value={address.id} />
                        <button
                          type="submit"
                          aria-label={`Supprimer l'adresse ${designation}`}
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-danger underline underline-offset-4"
                        >
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </Card>
                )
              })}
            </ul>
          )}

          <details className="mt-8">
            <summary className={summaryClass}>Ajouter une adresse</summary>
            <Card className="mt-4 p-5">
              <AddressForm address={null} />
            </Card>
          </details>
        </section>
      </div>
    </div>
  )
}
