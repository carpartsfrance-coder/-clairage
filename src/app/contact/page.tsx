import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { identity } from '@/lib/identity'
import { CONTACT_SUBJECTS, type ContactSubjectKey } from '@/lib/support'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { ContactForm } from '@/components/support/ContactForm'

export const metadata: Metadata = {
  title: 'Nous contacter',
  robots: { index: false, follow: false },
}

type PageProps = { searchParams: Promise<{ sujet?: string; commande?: string }> }

/**
 * Prise de contact.
 *
 * Cette page remplace un gabarit « page non encore construite » qui était la
 * destination de presque tous les appels à l'aide du site : pied de page,
 * bande d'assistance de l'accueil et de la fiche, bloc d'achat, barre
 * utilitaire de l'en-tête. Un client qui demandait de l'aide arrivait sur un
 * mur — honnête, mais sans issue.
 *
 * Elle ouvre une vraie demande SAV, dans la même file que les autres, avec la
 * même référence. Ce qui n'existe pas n'est pas annoncé : aucun numéro de
 * téléphone, aucun horaire et aucun délai de réponse ne sont affichés tant
 * qu'ils ne sont pas renseignés dans `identity`, et l'envoi d'e-mails n'étant
 * pas activé, le retour du formulaire le dit.
 */
export default async function ContactPage({ searchParams }: PageProps) {
  const { sujet, commande } = await searchParams
  const user = await getCurrentUser()

  // Le sujet repris de l'URL n'est qu'une présélection : il doit appartenir à
  // la liste, et l'action le revalide de toute façon avant d'écrire.
  const sujetParDefaut = CONTACT_SUBJECTS.find((item) => item.key === sujet)?.key as
    | ContactSubjectKey
    | undefined

  // Coordonnées : affichées seulement si elles existent réellement.
  const coordonnees = [
    identity.contact.email
      ? { label: 'E-mail', value: identity.contact.email, href: `mailto:${identity.contact.email}` }
      : null,
    identity.contact.phone
      ? { label: 'Téléphone', value: identity.contact.phone, href: `tel:${identity.contact.phone}` }
      : null,
    identity.contact.hours ? { label: 'Horaires', value: identity.contact.hours, href: null } : null,
  ].filter((item) => item !== null)

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Nous contacter' }]} />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Nous contacter
      </h1>

      <div className="mt-6 flex flex-col gap-8 fiche:flex-row fiche:items-start fiche:gap-[49px]">
        <section aria-labelledby="contact-formulaire" className="min-w-0 flex-1">
          <h2 id="contact-formulaire" className="text-[14px] font-bold">
            Votre demande
          </h2>
          <p className="mt-2 mb-5 max-w-[580px] text-[11px] leading-[1.8] text-[#7a7a7a]">
            Dites-nous ce qu&apos;il vous faut : nous ouvrons une demande, elle reçoit une
            référence, et vous la gardez pour la suite.
          </p>

          <ContactForm
            defaultEmail={user?.email ?? null}
            defaultSubject={sujetParDefaut}
            defaultOrderReference={commande ?? null}
          />
        </section>

        <section aria-labelledby="contact-cadre" className="fiche:w-[370px] fiche:shrink-0">
          <div className="rounded-[9px] border border-[#e0e0e0] p-5">
            <h2 id="contact-cadre" className="text-[14px] font-bold">
              Ce qui se passe ensuite
            </h2>

            <p className="mt-3 text-[11px] leading-[1.8] text-[#7a7a7a]">
              Votre demande est enregistrée et apparaît dans la file de l&apos;équipe avec sa
              référence. L&apos;envoi automatique d&apos;e-mails n&apos;est pas encore activé sur
              cet environnement : vous ne recevrez pas d&apos;accusé de réception, et aucun délai
              de réponse ne vous est promis ici.
            </p>

            {coordonnees.length > 0 ? (
              <dl className="mt-4 text-[12px]">
                {coordonnees.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-baseline justify-between gap-4 border-t border-line py-3"
                  >
                    <dt className="text-[#7e7e7e]">{item.label}</dt>
                    <dd className="min-w-0 text-right font-semibold">
                      {item.href ? (
                        <a href={item.href} className="underline-offset-[3px] hover:underline">
                          {item.value}
                        </a>
                      ) : (
                        item.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              /* Pas de téléphone ni d'adresse publiée : on le dit, plutôt que
                 d'afficher un canal qui ne mènerait nulle part. */
              <p className="mt-3 text-[10px] leading-[1.7] text-[#8c8c8c]">
                Aucun numéro de téléphone ni adresse e-mail d&apos;assistance n&apos;est publié
                pour le moment : ce formulaire est la voie d&apos;entrée.
              </p>
            )}

            <h3 className="mt-6 text-[12px] font-bold">Plus rapide que d&apos;écrire</h3>
            <ul className="mt-2 flex flex-col gap-2 text-[11px] leading-[1.7] text-[#7a7a7a]">
              <li>
                <Link href="/suivi" className="font-semibold text-ink hover:underline">
                  Suivre une commande
                </Link>{' '}
                — avec sa référence et l&apos;adresse utilisée, sans compte.
              </li>
              <li>
                <Link href="/aide" className="font-semibold text-ink hover:underline">
                  Questions fréquentes
                </Link>{' '}
                — ce qui revient le plus souvent, déjà répondu.
              </li>
              <li>
                <Link href="/verification" className="font-semibold text-ink hover:underline">
                  Faire vérifier une compatibilité
                </Link>{' '}
                — depuis la fiche du produit concerné, le contexte est repris.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
