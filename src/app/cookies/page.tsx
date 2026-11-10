import type { Metadata } from 'next'
import Link from 'next/link'
import { identity } from '@/lib/identity'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { CART_COOKIE, VEHICLE_COOKIE } from '@/lib/session'
import { Article, PageLegale } from '@/components/legal/PageLegale'
import { RefusMesure } from '@/components/mesure/RefusMesure'

export const metadata: Metadata = {
  title: 'Cookies',
  description:
    'Les trois cookies déposés par le site, tous nécessaires à son fonctionnement : panier, véhicule choisi et connexion au compte. Aucun cookie de publicité. Une mesure d’audience anonyme, sans cookie, que vous pouvez refuser.',
  alternates: { canonical: '/cookies' },
}

const MISE_A_JOUR = '10 novembre 2026'

/**
 * Cookies.
 *
 * Cette page remplace un gabarit « en préparation » fermé à Google.
 *
 * **La liste est complète, et elle doit le rester.** Inventaire du code au
 * 7 novembre 2026 : trois cookies, tous posés par le serveur, `httpOnly`,
 * `secure` et `sameSite=lax` ; aucun `document.cookie`, aucun stockage local,
 * aucun script tiers. Ce sont des cookies « strictement nécessaires » au sens
 * de l'article 82 de la loi Informatique et Libertés : ils sont dispensés de
 * consentement, d'où l'absence de bandeau. Les durées sont celles du code
 * (`maxAge` du panier et du véhicule, `expires` de la session).
 *
 * Ajouter une mesure d'audience, un pixel publicitaire ou une vidéo intégrée
 * change tout : il faudra un bandeau de consentement **avant** de les charger,
 * et une mise à jour de cette page.
 */
export default function Page() {
  const contact = identity.contact

  return (
    <PageLegale
      titre="Cookies"
      chapeau="La liste complète des cookies déposés par le site, et à quoi ils servent."
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="en-bref" titre="En bref">
        <p>
          {identity.name} n’utilise que <strong>trois cookies</strong>, tous nécessaires au
          fonctionnement du site. Aucun cookie de publicité ou de réseau social, et aucun
          traceur d’un autre site. Nous mesurons aussi la fréquentation du site, de façon
          anonyme et sans cookie (voir plus bas).
        </p>
        <p>
          C’est pour cela qu’aucun bandeau ne vous demande votre accord : la loi dispense de
          consentement les cookies indispensables au service que vous demandez.
        </p>
      </Article>

      <Article numero={2} id="liste" titre="Les cookies du site">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-semibold">Nom</th>
              <th scope="col" className="py-2 pr-3 font-semibold">À quoi il sert</th>
              <th scope="col" className="py-2 font-semibold">Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-3 font-mono text-[12px]">{CART_COOKIE}</td>
              <td className="py-2 pr-3">
                Garde votre panier. Déposé quand vous ajoutez un premier article.
              </td>
              <td className="py-2">30 jours</td>
            </tr>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-3 font-mono text-[12px]">{VEHICLE_COOKIE}</td>
              <td className="py-2 pr-3">
                Retient le véhicule que vous avez choisi, pour ne vous montrer que les produits qui
                lui conviennent. Déposé quand vous choisissez un véhicule.
              </td>
              <td className="py-2">6 mois</td>
            </tr>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-3 font-mono text-[12px]">{SESSION_COOKIE}</td>
              <td className="py-2 pr-3">
                Vous garde connecté à votre compte. Déposé seulement si vous vous connectez, effacé
                quand vous vous déconnectez.
              </td>
              <td className="py-2">30 jours</td>
            </tr>
          </tbody>
        </table>
        <p>
          Ces cookies ne servent qu’à ce site. Ils ne contiennent ni votre nom ni votre adresse :
          seulement un identifiant technique. Ils ne sont transmis que de façon chiffrée et ne
          peuvent pas être lus par un script de la page.
        </p>
      </Article>

      <Article numero={3} id="mesure" titre="Mesure de fréquentation">
        <p>
          Pour améliorer le site, nous comptons les pages vues et les liens cliqués : par exemple,
          combien de visiteurs ouvrent une fiche produit, ou à quelle étape ils quittent la
          commande. Cette mesure est faite par nous seuls, sans aucun service extérieur.
        </p>
        <p>
          Elle est anonyme : pas de cookie, pas d’adresse IP, aucun lien avec votre compte ou
          votre commande. Un numéro tiré au hasard est gardé dans l’onglet de votre navigateur
          pendant la visite, et oublié à sa fermeture ou après 30 minutes sans activité. Nous
          gardons seulement la taille de l’écran (mobile, tablette ou ordinateur) et le site
          d’où vous arrivez (un moteur de recherche, une publicité…). Les données sont
          effacées au bout de 13 mois.
        </p>
        <p>
          Cette mesure respecte les conditions de la CNIL pour être dispensée de consentement.
          Vous pouvez quand même la refuser, et le réglage « Ne pas me pister » de votre navigateur
          est respecté.
        </p>
        <RefusMesure />
      </Article>

      <Article numero={4} id="paiement" titre="Pendant le paiement">
        <p>
          Pour payer, vous passez sur la page sécurisée de Mollie, notre prestataire de paiement.
          Cette page appartient à Mollie : elle peut déposer ses propres cookies, nécessaires au
          paiement et à la lutte contre la fraude. Ils sont décrits dans la politique de
          confidentialité de Mollie.
        </p>
      </Article>

      <Article numero={5} id="refuser" titre="Supprimer ou bloquer les cookies">
        <p>
          Vous pouvez supprimer ou bloquer les cookies dans les réglages de votre navigateur. Sans
          eux, le site ne peut plus garder votre panier, retenir votre véhicule ni vous garder
          connecté.
        </p>
      </Article>

      <Article numero={6} id="changements" titre="Si cela change">
        <p>
          Si nous ajoutons un jour un cookie qui n’est pas indispensable (publicité, outil
          extérieur), nous vous demanderons d’abord votre accord, et cette page sera mise à jour.
        </p>
        <p>
          Pour le reste de vos données, voir notre{' '}
          <Link href="/confidentialite" className="underline underline-offset-2">
            politique de confidentialité
          </Link>
          .{' '}
          {contact.email ? (
            <>
              Une question :{' '}
              <a href={`mailto:${contact.email}`} className="underline underline-offset-2">
                {contact.email}
              </a>
              .
            </>
          ) : null}
        </p>
      </Article>
    </PageLegale>
  )
}
