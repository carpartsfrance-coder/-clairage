import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, dureeGarantie, identity } from '@/lib/identity'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Garanties',
  description:
    'Garantie LEDVROOM de 5 ans sur toutes nos ampoules et LED, en plus des garanties légales : ce qui est couvert et comment la faire jouer.',
  alternates: { canonical: '/garanties' },
}

const MISE_A_JOUR = '8 novembre 2026'

/**
 * Garanties.
 *
 * Cette page remplace un gabarit « en préparation » fermé à Google.
 *
 * **Seules les garanties qui existent sont annoncées.** Les garanties légales
 * s'appliquent de plein droit à toute vente à un consommateur : elles sont
 * citées avec leurs articles, comme dans l'article 8 des CGV, sans être
 * reformulées à la baisse. Une garantie commerciale n'apparaît que si
 * `commercialTerms.warrantyMonths` est renseigné.
 */
export default function Page() {
  const mois = commercialTerms.warrantyMonths
  const duree = dureeGarantie()
  const contact = identity.contact
  const { legal } = identity

  return (
    <PageLegale
      titre="Garanties"
      chapeau={
        duree
          ? `Tous nos produits sont garantis ${duree}. Si une ampoule ou une LED tombe en panne, nous la remplaçons.`
          : 'Ce qui est couvert si un pack est défectueux ou ne correspond pas à ce qui était annoncé.'
      }
      miseAJour={MISE_A_JOUR}
    >
      {mois ? (
        <Article numero={1} id="garantie-commerciale" titre={`Garantie ${identity.name} ${duree}`}>
          <p>
            <strong>Tous les produits vendus sur notre site</strong> — ampoules, LED, modules et kits —
            sont garantis <strong>{duree} à compter de la livraison</strong> contre les pannes et les
            défauts de fonctionnement : une LED qui ne s’allume plus, qui clignote ou qui scintille
            anormalement, une ampoule qui grille, un module qui cesse de fonctionner.
          </p>
          <p>
            <strong>Ce que nous faisons :</strong> nous remplaçons le produit défectueux par un produit
            identique ou équivalent, envoyé à nos frais. S’il n’est plus disponible, nous vous
            remboursons. La garantie est gratuite et comprise dans le prix.
          </p>
          <p>
            <strong>Ce qui n’est pas couvert :</strong> un produit monté de façon non conforme à la
            notice ou au véhicule, modifié, endommagé par un choc, un accident ou une infiltration
            d’eau due au montage, ou utilisé hors de l’usage prévu (sport, tension non prévue). Un
            produit qui ne convient pas au véhicule relève du droit de retour, pas de la garantie.
          </p>
          <p>
            <strong>Pour la faire jouer :</strong> voir « Faire jouer une garantie » ci-dessous. Gardez
            votre numéro de commande : il nous suffit pour retrouver l’achat.
          </p>
          <p>
            Garant : {legal.companyName ?? identity.name}
            {legal.address ? <>, {legal.address}</> : null}. Cette garantie s’applique aux produits
            livrés dans les pays où nous livrons.
          </p>
          <p>
            <strong>
              Elle s’ajoute aux garanties légales, sans les remplacer : indépendamment de cette
              garantie commerciale, le vendeur reste tenu de la garantie légale de conformité
              (articles L217-3 à L217-20 du code de la consommation) et de la garantie des vices
              cachés (articles 1641 à 1649 du code civil), décrites ci-dessous.
            </strong>
          </p>
        </Article>
      ) : null}

      <Article numero={mois ? 2 : 1} id="conformite" titre="Garantie légale de conformité : 2 ans">
        <p>
          Si un pack présente un défaut ou ne correspond pas à sa description, vous pouvez demander
          sa réparation ou son remplacement pendant <strong>deux ans à compter de la livraison</strong>
          , sans avoir à prouver que le défaut existait à la livraison (articles L217-3 et suivants
          du code de la consommation).
        </p>
      </Article>

      <Article numero={mois ? 3 : 2} id="vices-caches" titre="Garantie des vices cachés">
        <p>
          Un défaut caché qui rend l’article impropre à son usage ouvre droit à l’annulation de la
          vente ou à une réduction du prix, dans les deux ans qui suivent sa découverte (articles
          1641 et suivants du code civil).
        </p>
      </Article>

      <Article numero={mois ? 4 : 3} id="demande" titre="Faire jouer une garantie">
        <ol className="list-decimal pl-5">
          <li>
            Écrivez-nous depuis le{' '}
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
            , avec votre numéro de commande.
          </li>
          <li>Décrivez le problème et joignez une photo si vous le pouvez.</li>
          <li>
            Nous vous indiquons la marche à suivre. Un article défectueux est renvoyé à nos frais.
          </li>
        </ol>
        <p>
          Pour un simple changement d’avis, voir{' '}
          <Link href="/livraison-retours#retours" className="underline underline-offset-2">
            les retours
          </Link>
          . Le détail figure dans nos{' '}
          <Link href="/cgv#garanties" className="underline underline-offset-2">
            conditions générales de vente
          </Link>
          .
        </p>
      </Article>
    </PageLegale>
  )
}
