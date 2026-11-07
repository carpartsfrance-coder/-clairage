import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, identity } from '@/lib/identity'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Garanties',
  description:
    'Garantie légale de conformité de deux ans et garantie des vices cachés sur tous les packs, et comment les faire jouer.',
  alternates: { canonical: '/garanties' },
}

const MISE_A_JOUR = '7 novembre 2026'

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
  const contact = identity.contact

  return (
    <PageLegale
      titre="Garanties"
      chapeau="Ce qui est couvert si un pack est défectueux ou ne correspond pas à ce qui était annoncé."
      miseAJour={MISE_A_JOUR}
    >
      {mois ? (
        <Article numero={1} id="garantie-commerciale" titre={`Garantie ${identity.name} de ${mois} mois`}>
          <p>
            Tous nos packs bénéficient d’une garantie commerciale de {mois} mois. Elle s’ajoute aux
            garanties légales ci-dessous, sans les remplacer.
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
