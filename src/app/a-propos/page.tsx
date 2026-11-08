import type { Metadata } from 'next'
import Link from 'next/link'
import { commercialTerms, dureeGarantie, formatPrice, identity } from '@/lib/identity'
import { getSeuilLivraisonOfferte } from '@/lib/shipping'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Qui sommes-nous',
  description:
    'LEDVROOM compose des packs d’éclairage LED pour chaque véhicule, emplacement par emplacement. Une marque de CAR PARTS FRANCE, garantie 5 ans.',
  alternates: { canonical: '/a-propos' },
}

const MISE_A_JOUR = '8 novembre 2026'

/**
 * Qui sommes-nous.
 *
 * La page que lit un client qui hésite à commander sur une boutique qu'il ne
 * connaît pas. **Rien n'y est affirmé qui ne soit vrai et vérifiable** : pas
 * d'ancienneté, pas de nombre de clients, pas d'avis inventés. L'identité de
 * la société vient de `identity.legal` (vérifiée au répertoire Sirene), les
 * engagements de la configuration (garantie, livraison, retours).
 */
export default async function Page() {
  const seuil = await getSeuilLivraisonOfferte()
  const garantie = dureeGarantie()
  const retour = commercialTerms.returnWindowDays
  const { legal, contact } = identity

  return (
    <PageLegale
      titre="Qui sommes-nous"
      chapeau={`${identity.name}, c’est l’éclairage auto pensé véhicule par véhicule.`}
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="idee" titre="Notre idée : le bon pack pour votre voiture">
        <p>
          Changer une ampoule, ce n’est pas seulement trouver la bonne référence. Chaque voiture a ses
          emplacements, son bloc optique et son équipement d’origine : la même génération peut
          exister en halogène ou en xénon, avec ou sans feux de jour.
        </p>
        <p>
          Nous composons donc nos packs <strong>pour chaque véhicule, emplacement par
          emplacement</strong> : phares, veilleuses, plaque, recul, habitacle… Vous choisissez votre
          voiture, vous recevez exactement ce qu’il faut, prêt à monter.
        </p>
      </Article>

      <Article numero={2} id="engagements" titre="Nos engagements">
        <ul className="list-disc pl-5">
          {garantie ? (
            <li>
              <strong>Garantie {garantie}</strong> sur toutes nos ampoules et LED.{' '}
              <Link href="/garanties" className="underline underline-offset-2">
                Ce qui est couvert
              </Link>
            </li>
          ) : null}
          {seuil ? (
            <li>
              <strong>Livraison offerte dès {formatPrice(seuil)}</strong> en France.{' '}
              <Link href="/livraison-retours" className="underline underline-offset-2">
                Tarifs et délais
              </Link>
            </li>
          ) : null}
          {retour ? (
            <li>
              <strong>{retour} jours pour changer d’avis</strong>, sans avoir à vous justifier.
            </li>
          ) : null}
          <li>
            <strong>Paiement sécurisé</strong> par carte ou Apple Pay, avec Mollie : votre numéro de
            carte ne nous est jamais transmis.
          </li>
          <li>
            <strong>Une vraie personne pour vous répondre</strong>, avant l’achat pour choisir et
            après pour le montage.
          </li>
        </ul>
      </Article>

      <Article numero={3} id="societe" titre="Qui est derrière LEDVROOM">
        <p>
          {identity.name} est une marque de <strong>{legal.companyName ?? identity.name}</strong>,
          société française spécialisée dans les pièces automobiles
          {legal.address ? <>, dont le siège est au {legal.address}</> : null}.
        </p>
        <p className="text-[12px] text-muted-strong">
          {[legal.legalForm, legal.siret ? `SIRET ${legal.siret}` : null, legal.rcs, legal.vatNumber ? `TVA ${legal.vatNumber}` : null]
            .filter(Boolean)
            .join(' · ')}
          . Toutes les mentions sur la page{' '}
          <Link href="/mentions-legales" className="underline underline-offset-2">
            Mentions légales
          </Link>
          .
        </p>
      </Article>

      <Article numero={4} id="contact" titre="Nous écrire">
        <p>
          Une question sur un pack, sur la compatibilité avec votre voiture ou sur le montage ?
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
          .
        </p>
      </Article>
    </PageLegale>
  )
}
