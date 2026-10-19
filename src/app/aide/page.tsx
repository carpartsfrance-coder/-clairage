import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { countPublishedGuides, listGeneralFaq } from '@/lib/queries/support'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Card } from '@/components/ui/Surface'

export const metadata: Metadata = {
  title: 'Aide & contact',
  robots: { index: false, follow: false },
}

/**
 * Point d'entrée de l'assistance.
 *
 * Cette page ne crée rien : elle réunit ce qui existe déjà et marche —
 * le suivi de commande, les questions publiées, le formulaire de contact,
 * l'espace client, et les guides le jour où il y en aura.
 *
 * **Une rubrique sans contenu ne s'affiche pas.** C'est la règle de la fiche
 * produit (`aContenuQuestions`) : trois clics pour apprendre qu'il n'y a rien
 * valent moins qu'une page plus courte. Les guides, qui n'ont pas encore de
 * page construite, sont donc absents tant qu'aucun n'est publié ; et rien
 * n'est inventé pour remplir le reste.
 */
export default async function AidePage() {
  const [faq, guides, user] = await Promise.all([
    listGeneralFaq(),
    countPublishedGuides(),
    getCurrentUser(),
  ])

  /*
    Les entrées sont construites, pas écrites en dur : celles qui dépendent
    d'un contenu (les guides) ou d'un état (le compte) n'apparaissent que
    lorsqu'elles mènent quelque part.
  */
  const entrees = [
    {
      href: '/suivi',
      title: 'Suivre ma commande',
      text: "Sa référence et l'adresse e-mail utilisée suffisent. Aucun compte n'est nécessaire.",
      action: 'Retrouver ma commande',
    },
    {
      href: '/contact',
      title: 'Nous écrire',
      text: "Une question sur un produit, sur une commande ou sur autre chose. La demande est enregistrée et reçoit une référence.",
      action: 'Ouvrir une demande',
    },
    {
      href: '/verification',
      title: 'Faire vérifier une compatibilité',
      text: "Quand la fiche ne confirme pas qu'une référence convient à votre véhicule, nous le vérifions.",
      action: 'Demander une vérification',
    },
    guides > 0
      ? {
          href: '/guides',
          title: 'Conseils & montage',
          text: `${guides} guide${guides > 1 ? 's' : ''} publié${guides > 1 ? 's' : ''}, par emplacement et par véhicule.`,
          action: 'Découvrir les guides',
        }
      : null,
    user
      ? {
          href: '/compte/commandes',
          title: 'Mon espace client',
          text: 'Vos commandes, vos adresses et votre véhicule enregistré, au même endroit.',
          action: 'Ouvrir mon espace',
        }
      : null,
  ].filter((entree) => entree !== null)

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Aide & contact' }]} />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Aide &amp; contact
      </h1>

      <p className="mt-3 max-w-[580px] text-[11px] leading-[1.8] text-[#7b8074]">
        Ce qui est déjà en place pour vous dépanner, et comment nous joindre quand ça ne suffit
        pas.
      </p>

      <section aria-labelledby="aide-entrees" className="mt-8">
        <h2 id="aide-entrees" className="text-[14px] font-bold">
          Par où commencer
        </h2>

        <ul className="mt-4 grid gap-4 fiche:grid-cols-2 min-[1101px]:grid-cols-3">
          {entrees.map((entree) => (
            <li key={entree.href} className="min-w-0">
              <Card interactive className="flex h-full flex-col p-5">
                <h3 className="text-[13px] font-bold">
                  <Link href={entree.href} className="hover:underline underline-offset-[3px]">
                    {entree.title}
                  </Link>
                </h3>
                <p className="mt-2 text-[11px] leading-[1.8] text-[#7b8074]">{entree.text}</p>
                <p className="mt-auto pt-4 text-[11px] font-bold">
                  <Link href={entree.href} className="text-ink hover:underline">
                    {entree.action}{' '}
                    <span aria-hidden="true" className="text-[13px] leading-none">
                      ↗
                    </span>
                  </Link>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Les questions publiées, telles quelles. Aucune n'est écrite ici : si
          la base n'en contient pas, la rubrique disparaît. */}
      {faq.length > 0 ? (
        <section
          aria-labelledby="aide-questions"
          id="questions"
          className="mt-10 scroll-mt-32 block gap-[49px] fiche:grid fiche:grid-cols-[0.72fr_1.28fr]"
        >
          <div>
            <h2 id="aide-questions" className="text-[14px] font-bold">
              Questions fréquentes
            </h2>
            <p className="mt-2 text-[11px] leading-[1.8] text-[#7b8074]">
              Ce qui revient le plus souvent. Si votre cas n&apos;y est pas,{' '}
              <Link href="/contact" className="font-semibold text-ink hover:underline">
                écrivez-nous
              </Link>
              .
            </p>
          </div>

          <ul className="mt-[23px] border-t border-line fiche:mt-0 fiche:border-t-0">
            {faq.map((item) => (
              <li key={item.question} className="border-b border-line py-4">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 text-[11px] font-semibold [&::-webkit-details-marker]:hidden fiche:gap-[15px] fiche:text-[12px]">
                    {item.question}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-[17px] leading-[26px] font-normal text-[#8c8e85] transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[580px] text-[10px] leading-[1.8] text-[#7b8074] fiche:text-[11px]">
                    {item.answer}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
