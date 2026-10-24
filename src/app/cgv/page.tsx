import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, formatPrice, identity } from '@/lib/identity'
import {
  AComplete,
  Article,
  AvertissementIncomplet,
  PageLegale,
} from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Conditions générales de vente',
  description: 'Commande, paiement, livraison, rétractation et garanties.',
  alternates: { canonical: '/cgv' },
}

const MISE_A_JOUR = '24 octobre 2026'

/**
 * Conditions générales de vente.
 *
 * Deux règles ont guidé la rédaction.
 *
 * **Rien n'est promis qui ne soit configuré.** Les délais d'expédition, la
 * durée d'une garantie commerciale et le seuil de livraison offerte viennent
 * de `commercialTerms`. Quand une valeur vaut `null`, la clause ne l'invente
 * pas : elle dit que le délai est indiqué au moment de la commande. Un délai
 * écrit dans des CGV est un engagement contractuel, pas une formule.
 *
 * **Les garanties légales sont citées, pas résumées.** L'art. L217-3 et
 * l'art. 1641 du code civil s'appliquent quoi qu'écrive le vendeur ; les
 * reformuler à la baisse serait une clause abusive. Le texte renvoie donc aux
 * articles et en donne la portée exacte.
 */
export default function Page() {
  const l = identity.legal
  const seuil = commercialTerms.freeShippingThresholdCents
  const retractation = commercialTerms.returnWindowDays ?? 14

  const manquants = [
    !l.address && "l'adresse du siège, nécessaire pour les retours",
    !l.mediator && 'le médiateur de la consommation',
  ].filter((x): x is string => Boolean(x))

  return (
    <PageLegale
      titre="Conditions générales de vente"
      chapeau="Ce à quoi vous vous engagez en commandant, et ce à quoi nous nous engageons en vendant."
      miseAJour={MISE_A_JOUR}
    >
      <AvertissementIncomplet manquants={manquants} />

      <Article numero={1} id="objet" titre="Objet et acceptation">
        <p>
          Les présentes conditions régissent les ventes conclues sur {siteNom()} entre{' '}
          {l.companyName ?? <AComplete quoi="le vendeur" />}, ci-après « le vendeur », et toute
          personne effectuant un achat, ci-après « le client ».
        </p>
        <p>
          Elles sont acceptées au moment de la commande, par une case à cocher distincte du reste du
          formulaire. La version applicable est celle en vigueur à la date de la commande ; une
          modification ultérieure ne s'y applique pas.
        </p>
      </Article>

      <Article numero={2} id="produits" titre="Produits et compatibilité">
        <p>
          Les produits sont des équipements d'éclairage pour véhicules. Les photographies et les
          descriptions visent la plus grande exactitude possible ; de légères différences d'aspect
          sans incidence sur les caractéristiques essentielles ne constituent pas un défaut de
          conformité.
        </p>
        <p>
          <strong>La compatibilité de montage n'est pas l'homologation routière.</strong> Le site
          indique si une pièce se monte sur un véhicule donné ; cela ne préjuge pas de sa conformité
          à la réglementation applicable à la circulation. Le remplacement d'une source halogène par
          une source à LED, en particulier, n'est pas homologué en France sur un véhicule réceptionné
          pour l'halogène. Il appartient au client de s'assurer de la conformité de son véhicule.
        </p>
        <p>
          Lorsqu'une compatibilité n'a pas été vérifiée, le site l'indique et propose une
          vérification avant achat. Une absence d'information ne vaut jamais confirmation.
        </p>
      </Article>

      <Article numero={3} id="prix" titre="Prix">
        <p>
          Les prix sont indiqués en euros toutes taxes comprises, hors frais de livraison. Ceux-ci
          sont calculés et affichés avant la validation définitive de la commande.
        </p>
        <p>
          Le vendeur peut modifier ses prix à tout moment ; le prix applicable est celui affiché au
          moment de la commande.
        </p>
        {seuil ? (
          <p>
            La livraison est offerte à partir de {formatPrice(seuil)} d'achat, sous réserve de la
            zone de livraison retenue.
          </p>
        ) : null}
      </Article>

      <Article numero={4} id="commande" titre="Commande">
        <p>
          La commande suit quatre étapes : panier, coordonnées et livraison, récapitulatif, paiement.
          Le client peut revenir en arrière et corriger son panier jusqu'au paiement.
        </p>
        <p>
          La vente est formée à l'encaissement effectif du paiement. Un accusé de réception est
          adressé par courrier électronique ; il ne vaut pas confirmation d'expédition.
        </p>
        <p>
          Le vendeur se réserve le droit d'annuler une commande en cas d'indisponibilité constatée
          après coup, d'erreur manifeste de prix ou de soupçon de fraude. Dans ce cas, les sommes
          déjà versées sont remboursées intégralement.
        </p>
      </Article>

      <Article numero={5} id="paiement" titre="Paiement">
        <p>
          Le paiement s'effectue en ligne au moment de la commande. Les coordonnées bancaires sont
          saisies directement chez le prestataire de paiement : elles ne transitent pas par le site
          et n'y sont jamais enregistrées.
        </p>
        <p>
          La commande n'est traitée qu'après confirmation de l'encaissement par le prestataire. Un
          paiement refusé ou abandonné libère les articles réservés après un délai, sans frais.
        </p>
      </Article>

      <Article numero={6} id="livraison" titre="Livraison">
        <p>
          Les produits sont livrés à l'adresse indiquée par le client. Les zones desservies, les
          méthodes et leurs tarifs sont affichés à l'étape de livraison, avant paiement.
        </p>
        <p>
          {commercialTerms.dispatchEstimate ? (
            <>Les commandes sont expédiées sous {commercialTerms.dispatchEstimate}.</>
          ) : (
            <>
              Le délai d'expédition et le délai de livraison estimés sont indiqués au moment de la
              commande, selon la méthode retenue et la disponibilité des articles.
            </>
          )}{' '}
          À défaut d'indication, la livraison intervient au plus tard trente jours après la
          conclusion du contrat, conformément à l'article L216-1 du code de la consommation.
        </p>
        <p>
          En cas de retard, le client peut demander la résolution de la commande dans les conditions
          de l'article L216-6 ; les sommes versées lui sont alors remboursées au plus tard dans les
          quatorze jours.
        </p>
        <p>
          À la réception, il est recommandé de vérifier l'état du colis devant le transporteur et
          d'émettre, le cas échéant, des réserves précises sur le bon de livraison.
        </p>
      </Article>

      <Article numero={7} id="retractation" titre="Droit de rétractation">
        <p>
          Conformément à l'article L221-18 du code de la consommation, le client dispose de{' '}
          <strong>{retractation} jours</strong> à compter de la réception pour se rétracter, sans
          avoir à motiver sa décision ni à supporter de pénalité.
        </p>
        <p>
          La rétractation s'exerce par toute déclaration dénuée d'ambiguïté, adressée depuis le{' '}
          <Link href={identity.contact.contactPath} className="underline underline-offset-2">
            formulaire de contact
          </Link>
          {identity.contact.email ? (
            <>
              {' '}
              ou par courriel à{' '}
              <a href={`mailto:${identity.contact.email}`} className="underline underline-offset-2">
                {identity.contact.email}
              </a>
            </>
          ) : null}
          .
        </p>
        <p>
          Les produits sont renvoyés dans les quatorze jours suivant la déclaration, à{' '}
          {l.address ?? <AComplete quoi="adresse de retour" />}. Les frais de retour restent à la
          charge du client, sauf si le produit est non conforme ou si le vendeur a omis d'en
          informer le client.
        </p>
        <p>
          Le remboursement intervient au plus tard quatorze jours après récupération des produits ou
          preuve de leur expédition, par le même moyen de paiement que celui utilisé à l'achat. Il
          couvre le prix des produits et les frais de livraison standard initialement payés.
        </p>
        <p className="text-[12px] text-muted-strong">
          La responsabilité du client peut être engagée en cas de dépréciation résultant de
          manipulations autres que celles nécessaires pour établir la nature et les caractéristiques
          du produit — un montage sur véhicule, par exemple.
        </p>
      </Article>

      <Article numero={8} id="garanties" titre="Garanties légales">
        <p>
          Indépendamment de toute garantie commerciale, le vendeur reste tenu des défauts de
          conformité et des vices cachés dans les conditions prévues par la loi. Ces garanties
          s'appliquent de plein droit.
        </p>
        <p>
          <strong>Garantie légale de conformité</strong> — articles L217-3 et suivants du code de la
          consommation : le client dispose de deux ans à compter de la délivrance pour agir, peut
          choisir entre la réparation et le remplacement, et n'a pas à prouver l'existence du défaut
          pendant les vingt-quatre mois qui suivent la délivrance.
        </p>
        <p>
          <strong>Garantie des vices cachés</strong> — articles 1641 et suivants du code civil : le
          client peut demander la résolution de la vente ou une réduction du prix, dans un délai de
          deux ans à compter de la découverte du vice.
        </p>
        <p>
          {commercialTerms.warrantyMonths ? (
            <>
              Une garantie commerciale de {commercialTerms.warrantyMonths} mois s'ajoute à ces
              garanties légales, sans s'y substituer.
            </>
          ) : (
            <>
              Aucune garantie commerciale ne s'ajoute aujourd'hui aux garanties légales. Le cas
              échéant, sa durée et sa portée seraient précisées sur la fiche du produit concerné.
            </>
          )}
        </p>
      </Article>

      <Article numero={9} id="responsabilite" titre="Responsabilité">
        <p>
          Le vendeur ne saurait être tenu responsable des dommages résultant d'un montage non
          conforme aux prescriptions du fabricant ou du véhicule, d'un usage non conforme à la
          réglementation routière, ou d'une modification apportée au produit.
        </p>
        <p>
          Les guides de montage publiés sur le site sont fournis à titre indicatif et ne remplacent
          pas la documentation du constructeur ni l'intervention d'un professionnel.
        </p>
      </Article>

      <Article numero={10} id="litiges" titre="Réclamations et médiation">
        <p>
          Toute réclamation est d'abord adressée au service client, depuis le{' '}
          <Link href={identity.contact.contactPath} className="underline underline-offset-2">
            formulaire de contact
          </Link>
          . Nous nous engageons à répondre à chaque demande.
        </p>
        <p>
          Conformément à l'article L612-1 du code de la consommation, le client peut recourir
          gratuitement à un médiateur de la consommation si le litige n'est pas résolu dans les
          deux mois suivant sa réclamation écrite :{' '}
          {l.mediator ? (
            <>
              <strong>{l.mediator.name}</strong>, {l.mediator.address} —{' '}
              <a
                href={l.mediator.url}
                className="underline underline-offset-2"
                rel="noopener noreferrer"
                target="_blank"
              >
                {l.mediator.url.replace(/^https?:\/\//, '')}
              </a>
            </>
          ) : (
            <AComplete quoi="Médiateur agréé" />
          )}
          .
        </p>
        <p className="text-[12px] text-muted-strong">
          La plateforme européenne de règlement en ligne des litiges reste accessible à l'adresse{' '}
          <a
            href="https://ec.europa.eu/consumers/odr"
            className="underline underline-offset-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>
      </Article>

      <Article numero={11} id="bloctel" titre="Prospection téléphonique">
        <p>
          Le numéro de téléphone demandé lors de la commande sert au suivi de la livraison et à
          nous permettre de vous joindre en cas de difficulté sur votre commande. Il est facultatif.
        </p>
        <p>
          Conformément à l'article L223-1 du code de la consommation, vous pouvez vous inscrire
          gratuitement sur la liste d'opposition au démarchage téléphonique à l'adresse{' '}
          <a
            href="https://www.bloctel.gouv.fr"
            className="underline underline-offset-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            bloctel.gouv.fr
          </a>
          . Cette opposition est respectée.
        </p>
      </Article>

      <Article numero={12} id="droit" titre="Droit applicable">
        <p>
          Les présentes conditions sont soumises au droit français. En cas de litige, et à défaut de
          résolution amiable, les tribunaux français sont compétents selon les règles de droit
          commun. Le consommateur conserve le bénéfice des dispositions protectrices de la loi de sa
          résidence habituelle.
        </p>
      </Article>
    </PageLegale>
  )
}

function siteNom() {
  return identity.name
}
