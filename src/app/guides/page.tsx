import type { Metadata } from 'next'
import Link from 'next/link'
import { identity } from '@/lib/identity'
import { prisma } from '@/lib/db'
import { Article, PageLegale } from '@/components/legal/PageLegale'

export const metadata: Metadata = {
  title: 'Conseils & montage',
  description:
    'Comment monter vos ampoules et LED : préparation, gestes à connaître, accès par emplacement (plaque, veilleuses, feux de jour, phares, antibrouillards, recul) et vérifications.',
  alternates: { canonical: '/guides' },
}

const MISE_A_JOUR = '7 novembre 2026'

/**
 * Conseils de montage.
 *
 * Remplace le gabarit « page non encore construite » vers lequel pointaient
 * l'en-tête, le pied de page, l'aide et l'accueil (« Voir les guides de
 * montage »).
 *
 * **Que des règles générales, vraies pour tous les véhicules.** Rien ici ne
 * décrit un modèle en particulier : l'accès à un feu varie d'une voiture à
 * l'autre, et une consigne fausse pour un véhicule ferait casser une agrafe ou
 * perdre une heure. Ce qui dépend du véhicule renvoie vers l'équipe. Les
 * guides par véhicule (table `Guide`) viendront s'ajouter sous cette page.
 */
export default async function Page() {
  const contact = identity.contact
  const guides = await prisma.guide
    .findMany({
      where: { publishedAt: { not: null } },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true, summary: true },
    })
    .catch(() => [])

  return (
    <PageLegale
      titre="Conseils & montage"
      chapeau="Les gestes qui valent pour tous les véhicules, emplacement par emplacement. Pour le détail de votre voiture, notre équipe vous répond."
      miseAJour={MISE_A_JOUR}
    >
      <Article numero={1} id="avant" titre="Avant de commencer">
        <ul className="list-disc pl-5">
          <li>
            Vérifiez que le pack correspond à votre véhicule : choisissez votre voiture avec le
            sélecteur, la fiche produit vous dit si c&apos;est compatible.
          </li>
          <li>Coupez le contact et éteignez les feux. Retirez la clé si possible.</li>
          <li>
            Laissez refroidir l&apos;ampoule d&apos;origine si elle vient d&apos;éclairer : une
            ampoule halogène devient très chaude.
          </li>
          <li>
            Prévoyez des gants propres, une lampe, et un outil de démontage en plastique pour ne
            pas rayer la carrosserie ni casser une agrafe.
          </li>
        </ul>
      </Article>

      <Article numero={2} id="gestes" titre="Les gestes à connaître">
        <ul className="list-disc pl-5">
          <li>
            <strong>Ne touchez pas le verre</strong> d&apos;une ampoule halogène ou effet xénon :
            la trace de doigt crée un point chaud qui raccourcit sa durée de vie. Tenez-la par son
            culot.
          </li>
          <li>
            <strong>Une petite LED ne s&apos;allume pas ?</strong> Les LED de veilleuse, de plaque
            ou d&apos;habitacle ont un sens. Retirez-la, tournez-la d&apos;un demi-tour et
            remettez-la.
          </li>
          <li>
            <strong>Changez les deux côtés</strong> en même temps, pour une lumière identique à
            gauche et à droite.
          </li>
          <li>
            <strong>Testez avant de tout refermer</strong>, puis remettez bien les caches et les
            joints : un phare mal refermé prend l&apos;humidité et fait de la buée.
          </li>
        </ul>
      </Article>

      <Article numero={3} id="emplacements" titre="Emplacement par emplacement">
        <p>
          <strong>Éclairage de plaque.</strong> Il se change de l&apos;extérieur, sous le hayon ou
          dans le pare-chocs arrière. Le boîtier se déclipse avec l&apos;outil en plastique, ou se
          dévisse. Avec un module de plaque complet, on remplace tout le boîtier : il se clipse à la
          place de celui d&apos;origine.
        </p>
        <p>
          <strong>Veilleuses et feux de jour.</strong> L&apos;accès se fait le plus souvent par le
          compartiment moteur, derrière le phare : retirez le cache, tournez le porte-ampoule
          d&apos;un quart de tour et tirez. Sur certains véhicules, il faut passer par le passage
          de roue.
        </p>
        <p>
          <strong>Feux de croisement (effet xénon ou LED).</strong> Même accès, par l&apos;arrière
          du phare. L&apos;ampoule est tenue par un ressort ou une bague : notez sa position avant
          de l&apos;ouvrir. Une LED haute puissance porte un petit radiateur à l&apos;arrière :
          vérifiez qu&apos;il trouve sa place et que le cache du phare se referme.
        </p>
        <p>
          <strong>Antibrouillards.</strong> Ils s&apos;atteignent en général par-dessous le
          pare-chocs ou par le passage de roue.
        </p>
        <p>
          <strong>Feux de recul.</strong> Ils se changent depuis l&apos;intérieur du coffre, par
          une trappe ou en écartant la garniture ; parfois, le bloc du feu se dévisse.
        </p>
      </Article>

      <Article numero={4} id="apres" titre="Après le montage">
        <ul className="list-disc pl-5">
          <li>Vérifiez que tout s&apos;allume, moteur tournant.</li>
          <li>
            <strong>Un message d&apos;erreur au tableau de bord</strong>, ou une lumière qui
            clignote ? Certains véhicules surveillent la consommation des ampoules. Écrivez-nous
            avec votre modèle : nous vous indiquons la solution pour votre voiture.
          </li>
          <li>
            Après un changement des feux de croisement, faites contrôler le{' '}
            <strong>réglage des phares</strong> (un garage le fait en quelques minutes), pour bien
            voir la route sans éblouir les autres.
          </li>
        </ul>
      </Article>

      {guides.length > 0 ? (
        <Article numero={5} id="guides" titre="Guides par véhicule">
          <ul className="list-disc pl-5">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <Link href={`/guides/${guide.slug}`} className="underline underline-offset-2">
                  {guide.title}
                </Link>
                {guide.summary ? <span className="text-muted-strong"> — {guide.summary}</span> : null}
              </li>
            ))}
          </ul>
        </Article>
      ) : null}

      <Article numero={guides.length > 0 ? 6 : 5} id="aide" titre="Besoin d'aide pour votre véhicule ?">
        <p>
          Envoyez-nous le modèle et l&apos;année de votre véhicule, et si possible une photo de
          l&apos;emplacement, depuis le{' '}
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
          . Nous vous expliquons le montage pour votre voiture.
        </p>
      </Article>
    </PageLegale>
  )
}
