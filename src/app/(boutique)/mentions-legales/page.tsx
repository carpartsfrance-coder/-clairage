import type { Metadata } from 'next'
import Link from 'next/link'
import { identity, siteConfig } from '@/lib/identity'
import {
  AComplete,
  Article,
  AvertissementIncomplet,
  PageLegale,
} from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: "Identité de l'éditeur, hébergeur et directeur de la publication.",
  alternates: { canonical: '/mentions-legales' },
}

const MISE_A_JOUR = '24 octobre 2026'

/**
 * Mentions légales.
 *
 * Les champs viennent tous de `identity.legal` : un numéro d'immatriculation
 * écrit en dur dans un gabarit finit par survivre au changement de société.
 * Ce qui n'est pas renseigné s'affiche comme manquant plutôt que de
 * disparaître — voir `AComplete`.
 *
 * Obligations couvertes : art. 6 III de la LCEN pour l'éditeur et
 * l'hébergeur, art. L111-1 du code de la consommation pour le vendeur.
 */
export default function Page() {
  const l = identity.legal

  const manquants = [
    !l.legalForm && 'la forme juridique',
    !l.capital && 'le capital social',
    !l.address && "l'adresse du siège",
    !l.rcs && "le numéro d'immatriculation au RCS",
    !l.vatNumber && 'le numéro de TVA intracommunautaire',
    !l.publicationDirector && 'le directeur de la publication',
  ].filter((x): x is string => Boolean(x))

  return (
    <PageLegale
      titre="Mentions légales"
      chapeau="Qui édite ce site, qui l'héberge, et comment nous joindre."
      miseAJour={MISE_A_JOUR}
    >
      <AvertissementIncomplet manquants={manquants} />

      <Article numero={1} id="editeur" titre="Éditeur du site">
        <dl className="grid gap-x-6 gap-y-2 fiche:grid-cols-[minmax(0,180px)_1fr]">
          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Dénomination sociale</dt>
          <dd>{l.companyName ?? <AComplete quoi="Dénomination" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Forme juridique</dt>
          <dd>{l.legalForm ?? <AComplete quoi="Forme juridique" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Capital social</dt>
          <dd>{l.capital ?? <AComplete quoi="Capital social" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Siège social</dt>
          <dd>{l.address ?? <AComplete quoi={`Adresse complète${l.city ? ` à ${l.city}` : ''}`} />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">RCS</dt>
          <dd>{l.rcs ?? <AComplete quoi="Ville et numéro RCS" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">SIRET</dt>
          <dd>{l.siret ?? <AComplete quoi="SIRET" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">TVA intracommunautaire</dt>
          <dd>{l.vatNumber ?? <AComplete quoi="Numéro de TVA" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Directeur de la publication</dt>
          <dd>{l.publicationDirector ?? <AComplete quoi="Nom du directeur" />}</dd>

          <dt className="text-[12px] font-semibold text-[#6a6a6a]">Contact</dt>
          <dd>
            {identity.contact.email ? (
              <a href={`mailto:${identity.contact.email}`} className="underline underline-offset-2">
                {identity.contact.email}
              </a>
            ) : (
              <Link href={identity.contact.contactPath} className="underline underline-offset-2">
                Formulaire de contact
              </Link>
            )}
          </dd>
        </dl>
      </Article>

      <Article numero={2} id="hebergeur" titre="Hébergeur">
        <p>
          Le site est hébergé par <strong>{l.hostingProvider}</strong>
          {l.hostingAddress ? `, ${l.hostingAddress}` : null}.
        </p>
        <p className="text-[12px] text-muted-strong">
          Les médias (photographies, documents) sont servis depuis un stockage objet distinct,
          opéré par le même éditeur ou par un prestataire équivalent.
        </p>
      </Article>

      <Article numero={3} id="propriete" titre="Propriété intellectuelle">
        <p>
          La structure du site, ses textes et sa charte graphique sont la propriété de l'éditeur.
          Toute reproduction, même partielle, est soumise à son autorisation écrite.
        </p>
        <p>
          Les marques et logotypes des constructeurs automobiles et des fabricants cités le sont à
          titre de référence, pour identifier la compatibilité d'une pièce. Ils restent la propriété
          de leurs titulaires respectifs, et leur présence n'implique ni partenariat ni agrément.
        </p>
      </Article>

      <Article numero={4} id="donnees" titre="Données personnelles et cookies">
        <p>
          Le traitement des données personnelles est décrit dans la{' '}
          <Link href="/confidentialite" className="underline underline-offset-2">
            politique de confidentialité
          </Link>
          , et l'usage des traceurs dans la{' '}
          <Link href="/cookies" className="underline underline-offset-2">
            page dédiée aux cookies
          </Link>
          .
        </p>
      </Article>

      <Article numero={5} id="signaler" titre="Signaler un contenu">
        <p>
          Pour signaler un contenu illicite ou une erreur sur une fiche, écrivez-nous depuis le{' '}
          <Link href={identity.contact.contactPath} className="underline underline-offset-2">
            formulaire de contact
          </Link>
          . Précisez l'adresse de la page concernée — elle se copie depuis la barre du navigateur.
        </p>
        <p className="text-[12px] text-muted-strong">
          Adresse du site : {siteConfig.url.replace(/^https?:\/\//, '')}
        </p>
      </Article>
    </PageLegale>
  )
}
