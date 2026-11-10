import type { Metadata } from 'next'
import Link from 'next/link'
import { identity } from '@/lib/identity'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Données recueillies lors d’une commande, d’une demande ou de la création d’un compte, à quoi elles servent, combien de temps elles sont gardées, et comment exercer vos droits.',
  alternates: { canonical: '/confidentialite' },
}

const MISE_A_JOUR = '7 novembre 2026'

/**
 * Politique de confidentialité.
 *
 * Cette page remplace un gabarit « en préparation » fermé à Google. Elle est
 * exigée par le RGPD (articles 13 et 14) dès qu'un formulaire recueille une
 * donnée, et Mollie la vérifie avant d'ouvrir les paiements réels.
 *
 * **Elle ne décrit que ce que le site fait.** L'inventaire a été fait dans le
 * code le 7 novembre 2026 : formulaires (commande, compte, contact,
 * vérification de compatibilité, alerte de stock), modèles Prisma, cookies
 * (voir /cookies). Aucun outil de mesure d'audience, de publicité ou de réseau
 * social n'est chargé ; les polices sont servies par le site lui-même
 * (next/font) et les images passent par son propre optimiseur. Ajouter l'un
 * de ces outils, un nouveau formulaire ou un nouveau prestataire oblige à
 * revoir cette page — et la page des cookies.
 *
 * Le prestataire d'envoi d'e-mails n'est pas nommé : le pilote se règle dans
 * Render (`EMAIL_DRIVER`) et peut changer sans que le code le sache. Le RGPD
 * admet les catégories de destinataires.
 */
export default function Page() {
  const legal = identity.legal
  const contact = identity.contact

  const ecrire = (
    <>
      <Link href={contact.contactPath} className="underline underline-offset-2">
        formulaire de contact
      </Link>
      {contact.email ? (
        <>
          {' '}
          ou par e-mail à{' '}
          <a href={`mailto:${contact.email}`} className="underline underline-offset-2">
            {contact.email}
          </a>
        </>
      ) : null}
    </>
  )

  return (
    <PageLegale
      titre="Politique de confidentialité"
      chapeau="Les données que nous recueillons, à quoi elles servent, combien de temps nous les gardons, et comment exercer vos droits."
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="responsable" titre="Qui est responsable de vos données">
        <p>
          Le site {identity.name} est édité par {legal.companyName}
          {legal.legalForm ? `, ${legal.legalForm.split(' — ')[0]}` : ''}
          {legal.address ? `, dont le siège est ${legal.address}` : ''}. C’est elle qui décide de
          l’usage de vos données : elle en est responsable au sens du règlement général sur la
          protection des données (RGPD).
        </p>
        <p>Pour toute question sur vos données, écrivez-nous depuis le {ecrire}.</p>
      </Article>

      <Article numero={2} id="donnees" titre="Les données que nous recueillons">
        <p>Uniquement celles que vous nous donnez, et seulement quand vous en avez besoin :</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Quand vous commandez</strong> : nom, prénom, adresse de livraison et de
            facturation, e-mail, téléphone, contenu de la commande et véhicule choisi.
          </li>
          <li>
            <strong>Quand vous payez</strong> : vous saisissez votre carte sur la page sécurisée
            de notre prestataire de paiement, Mollie. Nous ne voyons jamais votre numéro de carte :
            nous recevons seulement le résultat du paiement et sa référence.
          </li>
          <li>
            <strong>Si vous créez un compte</strong> (ce n’est pas obligatoire pour commander) :
            e-mail, mot de passe, nom, prénom, téléphone, adresses et véhicules enregistrés.
          </li>
          <li>
            <strong>Quand vous nous écrivez</strong> (contact, vérification de compatibilité) :
            e-mail, message, et le numéro de commande ou le véhicule si vous les indiquez.
          </li>
          <li>
            <strong>Si vous demandez une alerte de retour en stock</strong> : e-mail et produit
            concerné.
          </li>
          <li>
            <strong>Si vous cochez la case « nouveautés et conseils »</strong> à la commande :
            votre e-mail, pour vous les envoyer. La case n’est jamais cochée d’avance.
          </li>
          <li>
            <strong>Pour la sécurité du site</strong> : adresse IP et type de navigateur quand
            vous vous connectez à votre compte, et le nombre d’essais de connexion, pour bloquer
            les tentatives d’intrusion.
          </li>
        </ul>
      </Article>

      <Article numero={3} id="finalites" titre="À quoi elles servent">
        <Tableau
          colonnes={['Ce que nous faisons', 'Ce qui nous y autorise']}
          lignes={[
            [
              'Traiter, livrer et facturer votre commande, gérer les retours et les garanties',
              'Le contrat de vente',
            ],
            ['Gérer votre compte client', 'Le contrat (conditions d’utilisation du compte)'],
            ['Répondre à vos questions et à vos demandes', 'Votre demande'],
            ['Vous prévenir du retour en stock d’un produit', 'Votre demande'],
            [
              'Vous envoyer nos nouveautés et conseils',
              'Votre accord, que vous pouvez retirer à tout moment',
            ],
            ['Tenir notre comptabilité', 'Nos obligations légales'],
            [
              'Protéger le site contre la fraude et les abus',
              'Notre intérêt légitime à sécuriser le site et vos données',
            ],
          ]}
        />
        <p>
          Nous ne vendons, ne louons et n’échangeons jamais vos données. Nous ne les utilisons pas
          pour de la publicité ciblée.
        </p>
      </Article>

      <Article numero={4} id="destinataires" titre="Qui peut y accéder">
        <ul className="list-disc pl-5">
          <li>
            <strong>Notre équipe</strong>, pour préparer votre commande et vous répondre.
          </li>
          <li>
            <strong>Mollie B.V.</strong> (Amsterdam, Pays-Bas), notre prestataire de paiement.
            Établissement de paiement agréé, Mollie traite les données de paiement sous sa propre
            responsabilité, selon sa politique de confidentialité.
          </li>
          <li>
            <strong>Le transporteur</strong> qui livre votre colis : nom, adresse et coordonnées
            utiles à la livraison.
          </li>
          <li>
            <strong>Notre hébergeur</strong>, {legal.hostingProvider}, qui stocke le site et ses
            données sur des serveurs situés à Francfort (Allemagne).
          </li>
          <li>
            <strong>Notre prestataire d’envoi d’e-mails</strong>, pour les messages liés à votre
            commande, à votre compte et à vos demandes.
          </li>
          <li>
            <strong>Notre cabinet comptable</strong>, pour les factures.
          </li>
        </ul>
        <p>
          Ces prestataires n’utilisent vos données que pour le service qu’ils nous rendent. Nous ne
          les transmettons à une autorité que si la loi nous y oblige.
        </p>
      </Article>

      <Article numero={5} id="transferts" titre="Où sont vos données">
        <p>
          Vos données sont stockées dans l’Union européenne, à Francfort. Notre hébergeur, Render,
          est une société américaine : elle est certifiée au cadre de protection des données
          UE–États-Unis (Data Privacy Framework), que la Commission européenne reconnaît comme
          offrant une protection équivalente à celle de l’Union.
        </p>
        <p>
          Si un autre prestataire devait accéder à vos données depuis un pays hors de l’Union
          européenne, ce transfert serait encadré par les clauses contractuelles types de la
          Commission européenne.
        </p>
      </Article>

      <Article numero={6} id="durees" titre="Combien de temps nous les gardons">
        <Tableau
          colonnes={['Données', 'Durée']}
          lignes={[
            [
              'Commandes, adresses et échanges qui s’y rapportent',
              '5 ans après la commande, pour les garanties et en cas de litige',
            ],
            ['Factures', '10 ans, comme l’exige le code de commerce'],
            [
              'Compte client',
              'Tant que vous l’utilisez ; supprimé après 3 ans sans connexion ni commande, ou plus tôt à votre demande',
            ],
            ['Demandes de contact et de compatibilité', '3 ans après notre dernière réponse'],
            ['Alerte de retour en stock', 'Jusqu’à l’envoi de l’alerte, ou votre désinscription'],
            [
              'Nouveautés et conseils par e-mail',
              'Jusqu’à votre désinscription, ou 3 ans sans nouvelles de votre part',
            ],
            ['Données de connexion (adresse IP, navigateur)', '30 jours'],
            ['Données de carte bancaire', 'Jamais conservées par nous : elles restent chez Mollie'],
          ]}
        />
      </Article>

      <Article numero={7} id="droits" titre="Vos droits">
        <p>Sur les données qui vous concernent, vous pouvez à tout moment :</p>
        <ul className="list-disc pl-5">
          <li>les consulter et en obtenir une copie ;</li>
          <li>les faire corriger si elles sont fausses ou incomplètes ;</li>
          <li>
            les faire effacer, sauf celles que la loi nous oblige à garder (les factures, par
            exemple) ;
          </li>
          <li>vous opposer à leur utilisation, ou la faire limiter ;</li>
          <li>les récupérer dans un format lisible, pour les confier à un autre service ;</li>
          <li>retirer votre accord, par exemple pour les e-mails de nouveautés et conseils ;</li>
          <li>nous dire ce qu’elles deviennent après votre décès.</li>
        </ul>
        <p>
          Pour cela, écrivez-nous depuis le {ecrire}. Nous vous répondons dans un délai d’un mois.
          Si nous avons un doute sur votre identité, nous pouvons vous demander de la confirmer.
          Chaque e-mail de nouveautés et conseils contient aussi un lien pour vous désinscrire en
          un clic.
        </p>
        <p>
          Si vous pensez que vos droits ne sont pas respectés, vous pouvez saisir la Commission
          nationale de l’informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715,
          75334 Paris Cedex 07,{' '}
          <a
            href="https://www.cnil.fr/fr/plaintes"
            className="underline underline-offset-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            cnil.fr
          </a>
          .
        </p>
        <p>
          Pour ne plus recevoir d’appels de démarchage commercial, vous pouvez vous inscrire
          gratuitement sur la liste d’opposition{' '}
          <Link href="/cgv#bloctel" className="underline underline-offset-2">
            Bloctel
          </Link>
          .
        </p>
      </Article>

      <Article numero={8} id="securite" titre="Comment nous les protégeons">
        <ul className="list-disc pl-5">
          <li>Le site est entièrement chiffré (HTTPS).</li>
          <li>
            Votre mot de passe n’est jamais stocké en clair : nous n’en gardons qu’une empreinte
            chiffrée, impossible à retransformer en mot de passe.
          </li>
          <li>Votre carte bancaire ne passe jamais par nos serveurs.</li>
          <li>Seules les personnes qui en ont besoin pour leur travail accèdent à vos données.</li>
        </ul>
      </Article>

      <Article numero={9} id="cookies" titre="Cookies">
        <p>
          Le site n’utilise que les cookies nécessaires à son fonctionnement : votre panier, le
          véhicule choisi et la connexion à votre compte. Aucun cookie de publicité. La
          fréquentation du site est mesurée de façon anonyme, sans cookie ni adresse IP, et vous
          pouvez la refuser. Le détail est sur la{' '}
          <Link href="/cookies" className="underline underline-offset-2">
            page des cookies
          </Link>
          .
        </p>
      </Article>

      <Article numero={10} id="modifications" titre="Modifications">
        <p>
          Nous mettons cette page à jour si nos pratiques changent. La date de la dernière mise à
          jour figure en haut de la page.
        </p>
      </Article>
    </PageLegale>
  )
}

/** Tableau à deux colonnes, dans le style des autres pages légales. */
function Tableau({ colonnes, lignes }: { colonnes: [string, string]; lignes: Array<[string, string]> }) {
  return (
    <table className="w-full border-collapse text-left text-[13px]">
      <thead>
        <tr className="border-b border-line">
          {colonnes.map((colonne) => (
            <th key={colonne} scope="col" className="py-2 pr-3 font-semibold">
              {colonne}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map(([gauche, droite]) => (
          <tr key={gauche} className="border-b border-line align-top">
            <td className="py-2 pr-3">{gauche}</td>
            <td className="py-2">{droite}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
