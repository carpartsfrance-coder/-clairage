import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, formatPrice, identity } from '@/lib/identity'
import { getZonesDeLivraison } from '@/lib/shipping'
import { nomDuPays, trierLesPays } from '@/lib/livraison-pays'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Livraison et retours',
  description:
    'Tarifs et délais de livraison en France, livraison offerte, suivi de colis, retours sous 14 jours et remboursement.',
  alternates: { canonical: '/livraison-retours' },
}

const MISE_A_JOUR = '7 novembre 2026'

/**
 * Livraison et retours.
 *
 * Cette page remplace un gabarit « en préparation » fermé à Google. Elle est
 * ouverte : c'est l'une des pages que Google et ses fiches produit gratuites
 * (Merchant Center) attendent d'un site marchand, avec le contact et les
 * garanties.
 *
 * **Rien n'est écrit qui ne soit configuré ou déjà dans les CGV.** Les
 * méthodes, prix, seuils et délais viennent des méthodes de livraison en
 * base (`getShippingOffers`) : la page ne peut pas annoncer un autre tarif
 * que le panier. Les règles de retour reprennent l'article 7 des CGV, mot
 * pour mot sur le fond — le délai vient de `commercialTerms`. Aucun délai de
 * préparation n'est promis tant que `dispatchEstimate` n'est pas renseigné.
 */
export default async function Page() {
  // Toutes les zones livrées (page « Livraison » du back-office), la France
  // d'abord : un client belge doit trouver ses tarifs, pas ceux de Lyon.
  const zones = (await getZonesDeLivraison()).sort((a, b) =>
    a.countries.includes('FR') ? -1 : b.countries.includes('FR') ? 1 : 0,
  )
  const retour = commercialTerms.returnWindowDays ?? 14
  const zoneFrance = zones.find((zone) => zone.countries.includes('FR'))
  const seuils = (zoneFrance?.offres ?? [])
    .map((offre) => offre.freeFromCents)
    .filter((seuil): seuil is number => seuil !== null)
  const seuil = seuils.length > 0 ? Math.min(...seuils) : null
  const contact = identity.contact
  const adresse = identity.legal.address

  return (
    <PageLegale
      titre="Livraison et retours"
      chapeau="Ce que coûte la livraison, quand le colis arrive, et comment renvoyer un article."
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="livraison" titre="Tarifs et délais de livraison">
        {seuil ? (
          <p>
            <strong>La livraison est offerte dès {formatPrice(seuil)} d’achat</strong>, en France.
          </p>
        ) : null}
        {zones.length > 0 ? (
          zones.map((zone) => (
            <div key={zone.label} className="flex flex-col gap-2">
              {zones.length > 1 || !zone.countries.includes('FR') ? (
                <p className="font-semibold">
                  {zone.countries.length === 1
                    ? nomDuPays(zone.countries[0])
                    : `${zone.label} : ${trierLesPays(zone.countries).map((p) => p.nom).join(', ')}`}
                </p>
              ) : null}
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3 font-semibold">Mode de livraison</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Prix</th>
                    <th scope="col" className="py-2 font-semibold">Délai estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {zone.offres.map((offre) => (
                    <tr key={offre.code} className="border-b border-line align-top">
                      <td className="py-2 pr-3">
                        {offre.label}
                        {offre.carrier && !offre.label.includes(offre.carrier)
                          ? ` (${offre.carrier})`
                          : ''}
                      </td>
                      <td className="py-2 pr-3">
                        {offre.priceCents === 0 ? 'Offerte' : formatPrice(offre.priceCents)}
                        {offre.freeFromCents && offre.priceCents > 0
                          ? `, offerte dès ${formatPrice(offre.freeFromCents)}`
                          : ''}
                      </td>
                      <td className="py-2">{delai(offre.minDays, offre.maxDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        ) : (
          <p>Le prix et le délai de livraison sont indiqués dans le panier, avant le paiement.</p>
        )}
        <p>
          Le prix exact de la livraison est toujours affiché dans le panier, avant le paiement. Les
          délais sont des estimations en jours ouvrés, à compter de l’expédition.
        </p>
      </Article>

      <Article numero={2} id="suivi" titre="Suivre son colis">
        <p>
          Vous pouvez{' '}
          <Link href="/suivi" className="underline underline-offset-2">
            suivre votre commande
          </Link>{' '}
          avec son numéro et votre adresse e-mail, sans créer de compte.
        </p>
        <p>
          À la réception, vérifiez l’état du colis devant le transporteur et notez vos réserves
          précises sur le bon de livraison s’il est abîmé.
        </p>
      </Article>

      <Article numero={3} id="retours" titre={`Retours sous ${retour} jours`}>
        <p>
          Vous avez <strong>{retour} jours à compter de la réception</strong> pour changer d’avis,
          sans avoir à vous justifier.
        </p>
        <ol className="list-decimal pl-5">
          <li>
            Prévenez-nous depuis le{' '}
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
          <li>
            Renvoyez l’article dans les {retour} jours qui suivent
            {adresse ? <>, à l’adresse : {adresse}</> : <>, à l’adresse que nous vous indiquons</>}.
            Les frais de retour sont à votre charge, sauf si l’article est défectueux ou ne
            correspond pas à la commande.
          </li>
          <li>
            Nous vous remboursons au plus tard {retour} jours après avoir reçu l’article (ou la
            preuve de son envoi), par le même moyen de paiement. Le remboursement comprend le prix de
            l’article et les frais de livraison standard payés à la commande.
          </li>
        </ol>
        <p className="text-[12px] text-muted-strong">
          Un article monté sur le véhicule peut perdre de sa valeur : dans ce cas, le remboursement
          peut en tenir compte. Vérifiez la compatibilité avant le montage, et contactez-nous au
          moindre doute.
        </p>
      </Article>

      <Article numero={4} id="probleme" titre="Article défectueux ou qui ne convient pas">
        <p>
          Un article défectueux ou non conforme est couvert par les{' '}
          <Link href="/garanties" className="underline underline-offset-2">
            garanties légales
          </Link>
          , pendant deux ans. Écrivez-nous avec votre numéro de commande et, si possible, une photo :
          nous vous disons comment procéder, et le retour est alors à nos frais.
        </p>
        <p>
          Le détail de ces règles figure dans nos{' '}
          <Link href="/cgv#retractation" className="underline underline-offset-2">
            conditions générales de vente
          </Link>
          .
        </p>
      </Article>
    </PageLegale>
  )
}

/** « 3 à 5 jours ouvrés », « 2 jours ouvrés », ou un renvoi au panier. */
function delai(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return min === max ? `${min} jours ouvrés` : `${min} à ${max} jours ouvrés`
  }
  const un = min ?? max
  return un !== null ? `${un} jours ouvrés` : 'Indiqué au panier'
}
