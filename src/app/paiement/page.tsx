import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, identity } from '@/lib/identity'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Moyens de paiement',
  description:
    'Paiement par carte bancaire ou Apple Pay, sur la page sécurisée de Mollie. Votre numéro de carte ne nous est jamais transmis.',
  alternates: { canonical: '/paiement' },
}

const MISE_A_JOUR = '7 novembre 2026'

/**
 * Moyens de paiement.
 *
 * Remplace un gabarit « page non encore construite » auquel le pied de page
 * renvoyait. N'annonce que ce qui est activé chez Mollie sur le profil
 * LEDVROOM (vérifié le 7 novembre 2026 : carte et Apple Pay). Un moyen ajouté
 * plus tard chez Mollie s'affichera de lui-même sur la page de paiement ;
 * cette page sera à compléter à ce moment-là.
 */
export default function Page() {
  const retour = commercialTerms.returnWindowDays ?? 14
  const contact = identity.contact

  return (
    <PageLegale
      titre="Moyens de paiement"
      chapeau="Comment payer votre commande, et pourquoi c'est sûr."
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="moyens" titre="Les moyens acceptés">
        <ul className="list-disc pl-5">
          <li>
            <strong>Carte bancaire</strong> : Visa, Mastercard et cartes CB.
          </li>
          <li>
            <strong>Apple Pay</strong>, sur iPhone, iPad et Mac, depuis Safari.
          </li>
        </ul>
        <p>
          Les moyens affichés sur la page de paiement sont ceux disponibles pour votre appareil
          et votre commande.
        </p>
      </Article>

      <Article numero={2} id="securite" titre="Un paiement sécurisé">
        <p>
          Le paiement se fait sur la page sécurisée de <strong>Mollie</strong>, notre prestataire
          de paiement, établissement de paiement agréé. La connexion est chiffrée et votre banque
          peut vous demander de confirmer le paiement (3-D Secure), par exemple dans son
          application.
        </p>
        <p>
          <strong>Votre numéro de carte ne nous est jamais transmis</strong> : nous ne le voyons
          pas et ne le conservons pas. Le détail est dans notre{' '}
          <Link href="/confidentialite" className="underline underline-offset-2">
            politique de confidentialité
          </Link>
          .
        </p>
      </Article>

      <Article numero={3} id="debit" titre="Quand êtes-vous débité ?">
        <p>
          Le montant est débité au moment où vous validez le paiement. Votre commande est
          confirmée par e-mail dès que le paiement est accepté. Si le paiement échoue ou que vous
          l&apos;abandonnez, rien n&apos;est débité et vous pouvez réessayer depuis votre panier.
        </p>
      </Article>

      <Article numero={4} id="remboursement" titre="Remboursement">
        <p>
          En cas de retour (vous avez {retour} jours après réception) ou d&apos;annulation, le
          remboursement est fait sur le moyen de paiement utilisé pour la commande. Les règles
          sont détaillées sur la page{' '}
          <Link href="/livraison-retours#retours" className="underline underline-offset-2">
            Livraison et retours
          </Link>
          .
        </p>
      </Article>

      <Article numero={5} id="question" titre="Une question sur un paiement ?">
        <p>
          Écrivez-nous depuis le{' '}
          <Link href={contact.contactPath} className="underline underline-offset-2">
            formulaire de contact
          </Link>
          {contact.email ? (
            <>
              {' '}
              ou à{' '}
              <a href={`mailto:${contact.email}`} className="underline underline-offset-2">
                {contact.email}
              </a>
            </>
          ) : null}
          , avec votre numéro de commande si vous l&apos;avez.
        </p>
      </Article>
    </PageLegale>
  )
}
