import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { accessTokenFrom, canViewOrder } from '@/lib/order-access'
import { getCurrentUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { formatPrice } from '@/lib/identity'
import { paymentIsSimulated } from '@/lib/payments'
import { simulatePaymentOutcome } from '@/lib/actions/payment-simulation'
import { Alert, Card } from '@/components/ui/Surface'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'

/**
 * Étape de paiement.
 *
 * Deux usages : le pilote de simulation redirige ici avec `?ref=sim_xxx`, et le
 * retour du prestataire y revient en cas d'abandon (`?abandon=1`) ou d'issue
 * négative. Ces paramètres ne servent qu'à nuancer le message : l'état annoncé
 * est toujours celui que la base constate.
 *
 * Aucune donnée bancaire n'est demandée, affichée ni manipulée ici : le
 * règlement a lieu chez le prestataire. Cette page ne fait que dire où en est
 * la commande et proposer la seule action encore possible.
 */

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Paiement',
    robots: { index: false, follow: false },
  }
}

/**
 * Lecture directe de la commande : il n'existe pas encore de fonction de
 * lecture dédiée côté `lib`. L'erreur est journalisée et traitée comme une
 * absence, pour ne jamais afficher une page de paiement à moitié renseignée.
 */
async function lireCommande(orderId: string) {
  try {
    return await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lines: { where: { parentLineId: null }, orderBy: { id: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        // Sert à ne pas affirmer « aucun montant n'a été encaissé » quand le
        // dossier contient justement la trace du contraire.
        events: {
          where: { type: { in: ['payment.paid_after_release', 'payment.amount_mismatch'] } },
          take: 1,
        },
      },
    })
  } catch (error) {
    console.error('[commande/paiement]', error)
    return null
  }
}

/** Un paramètre d'URL peut arriver en tableau : on ne garde que la 1re valeur. */
function premier(valeur: string | string[] | undefined): string | null {
  if (Array.isArray(valeur)) return valeur[0] ?? null
  return valeur ?? null
}

const etatsPaiement: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'En attente de paiement', tone: 'warn' },
  AUTHORIZED: { label: 'Paiement autorisé', tone: 'warn' },
  PAID: { label: 'Payée', tone: 'ok' },
  PARTIALLY_REFUNDED: { label: 'Partiellement remboursée', tone: 'neutral' },
  REFUNDED: { label: 'Remboursée', tone: 'neutral' },
  FAILED: { label: 'Paiement refusé', tone: 'danger' },
  EXPIRED: { label: 'Paiement expiré', tone: 'danger' },
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orderId } = await params
  const sp = await searchParams

  const order = await lireCommande(orderId)
  if (!order) notFound()

  // Sans ce contrôle, l'identifiant de commande suffirait à lire l'adresse,
  // l'e-mail et le montant du client. On renvoie une 404 plutôt qu'un 403 :
  // un refus explicite confirmerait que la commande existe.
  if (!canViewOrder(order, accessTokenFrom(sp), (await getCurrentUser())?.id ?? null)) notFound()

  const abandon = premier(sp.abandon) === '1'
  // Réutilisé dans le lien de vérification : sans lui, le client se verrait
  // refuser l'accès à sa propre commande au retour.
  const jeton = accessTokenFrom(sp)

  const dernierPaiement = order.payments[0] ?? null
  /*
    Un encaissement a-t-il été signalé malgré l'annulation ?

    Deux traces le disent : `payment.paid_after_release` (le prestataire a
    annoncé un paiement sur une commande déjà libérée) et
    `payment.amount_mismatch` (il a annoncé un montant qui ne correspond pas).
    Dans ces cas, écrire « aucun montant n'a été encaissé » serait faux, et
    c'est précisément le client qui a besoin de le savoir.
  */
  const encaissementSignale = order.events.length > 0
  const estPayee = order.paymentStatus === 'PAID'
  const estAnnulee = order.status === 'CANCELLED'
  const enAttente = order.paymentStatus === 'PENDING' && !estAnnulee

  // L'issue annoncée est lue en base, jamais dans l'URL. `?echec=…` ne décide
  // de rien : sinon n'importe quel lien ferait dire « paiement refusé, articles
  // remis à disposition » à une commande encore en attente, dont le paiement
  // est toujours ouvert chez le prestataire et que le webhook peut confirmer
  // une seconde plus tard.
  const echec =
    order.paymentStatus === 'EXPIRED'
      ? 'expired'
      : order.paymentStatus === 'FAILED'
        ? 'failed'
        : null

  // Le bloc de simulation n'apparaît que si TOUT concorde : environnement sans
  // prestataire, paiement effectivement créé par le pilote de simulation, et
  // commande encore en attente. Un seul critère manquant et il disparaît.
  const paiementSimule =
    enAttente && paymentIsSimulated() && dernierPaiement && dernierPaiement.provider === 'simulation'
      ? dernierPaiement
      : null

  const prestataireReel = enAttente && !paiementSimule

  const nombreArticles = order.lines.reduce((total, ligne) => total + ligne.quantity, 0)
  const etat = etatsPaiement[order.paymentStatus] ?? { label: 'État inconnu', tone: 'neutral' as const }

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Panier', href: '/panier' },
          { label: 'Paiement' },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        Paiement de la commande {order.reference}
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* -----------------------------------------------------------------
            État du paiement et seule action encore possible
            ----------------------------------------------------------------- */}
        <section aria-labelledby="paiement-etat" className="min-w-0 flex-1">
          <h2 id="paiement-etat" className="text-[14px] font-bold">
            État du paiement
          </h2>

          <div className="mt-4 flex flex-col gap-4">
            {estPayee ? (
              <>
                <Alert tone="ok" title="Cette commande est déjà payée.">
                  <p>
                    Le règlement a bien été enregistré. Il n&apos;y a plus rien à payer pour cette
                    commande, et aucun second paiement ne peut être lancé depuis cet écran.
                  </p>
                </Alert>
                <div>
                  <ButtonLink href={`/commande/${orderId}/confirmation`} size="lg">
                    Voir la confirmation
                  </ButtonLink>
                </div>
              </>
            ) : (
              <>
                {echec ? (
                  <Alert
                    tone="danger"
                    live="assertive"
                    title={
                      echec === 'failed' ? 'Le paiement a été refusé.' : 'Le paiement a expiré.'
                    }
                  >
                    {encaissementSignale ? (
                      <p>
                        Les articles de cette commande ont été remis à disposition. En revanche,
                        notre prestataire a signalé un mouvement sur ce paiement : nous le
                        vérifions et revenons vers vous. Ne payez pas une seconde fois sans nous
                        avoir contactés.
                      </p>
                    ) : (
                      <p>
                        Aucun montant n&apos;a été encaissé. Les articles de cette commande ont été
                        remis à disposition : pour commander à nouveau, repartez de votre panier.
                      </p>
                    )}
                  </Alert>
                ) : null}

                {estAnnulee && !echec ? (
                  <Alert tone="danger" title="Cette commande a été annulée.">
                    {encaissementSignale ? (
                      <p>
                        Cette commande ne peut plus être réglée et ses articles ont été remis à
                        disposition. Notre prestataire a toutefois signalé un mouvement sur ce
                        paiement : nous le vérifions et revenons vers vous.
                      </p>
                    ) : (
                      <p>
                        Le paiement a été refusé, abandonné ou a expiré. Aucun montant n&apos;a été
                        encaissé et les articles ont été remis à disposition. Cette commande ne
                        peut plus être réglée.
                      </p>
                    )}
                  </Alert>
                ) : null}

                {abandon && enAttente ? (
                  <Alert tone="warn" title="Paiement non confirmé.">
                    {/*
                      On n'affirme plus « rien n'a été débité ». Ce bandeau
                      s'affiche dès que la commande est encore en attente au
                      retour du prestataire — ce qui arrive aussi quand le
                      client VIENT de payer par un moyen lent (virement,
                      paiement fractionné) : les fonds sont alors en route, et
                      l'affirmation serait fausse au pire moment.
                    */}
                    <p>
                      Le règlement de cette commande ne nous est pas encore confirmé. Si vous venez
                      de payer par un moyen qui demande un délai — virement, paiement en plusieurs
                      fois — c&apos;est normal : la confirmation peut prendre un moment. Les
                      articles vous restent réservés en attendant.
                    </p>
                  </Alert>
                ) : null}

                {estAnnulee ? (
                  <div>
                    <ButtonLink href="/panier" size="lg">
                      Revenir au panier
                    </ButtonLink>
                  </div>
                ) : null}

                {prestataireReel ? (
                  <>
                    <Alert tone="info" title="Le règlement se fait chez notre prestataire.">
                      <p>
                        Sa page de paiement a dû s&apos;ouvrir : aucune donnée de carte n&apos;est
                        saisie ni conservée sur ce site. Si cette page ne s&apos;est pas affichée ou
                        si vous l&apos;avez fermée, revenez au panier et reprenez la commande.
                      </p>
                      <p className="mt-2">
                        Si vous venez de régler et que cette page affiche encore «&nbsp;en
                        attente&nbsp;», le prestataire ne nous a pas encore prévenus. Cela prend
                        généralement quelques secondes.
                      </p>
                    </Alert>
                    <div className="flex flex-wrap gap-3">
                      {/*
                        Va interroger le prestataire et revient ici, ou sur la
                        confirmation si le paiement est passé entre-temps. C'est
                        la même route que celle qu'emprunte le retour du
                        prestataire : elle n'affirme rien, elle demande.
                      */}
                      <ButtonLink
                        href={`/api/paiement/retour?order=${orderId}${jeton ? `&t=${encodeURIComponent(jeton)}` : ''}`}
                        size="lg"
                      >
                        Vérifier l&apos;état du paiement
                      </ButtonLink>
                      <ButtonLink href="/panier" variant="secondary" size="lg">
                        Revenir au panier
                      </ButtonLink>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>

          {/* ---------------------------------------------------------------
              Simulation : jamais confondue avec un vrai paiement
              --------------------------------------------------------------- */}
          {paiementSimule ? (
            <section aria-labelledby="paiement-simulation" className="mt-8">
              <h2 id="paiement-simulation" className="text-[14px] font-bold">
                Vérifier le tunnel en paiement simulé
              </h2>

              <div className="mt-4 flex flex-col gap-4">
                <Alert tone="warn" title="Paiement simulé">
                  <p>
                    Aucun prestataire de paiement n&apos;est configuré sur cet environnement :{' '}
                    <strong className="font-semibold text-slate-ink">
                      aucun montant ne sera encaissé
                    </strong>
                    . Les boutons ci-dessous ne règlent rien. Ils servent à vérifier le tunnel de
                    commande de bout en bout, en déclenchant les mêmes traitements qu&apos;un vrai
                    paiement : statut de la commande, mouvements de stock et e-mail de confirmation
                    — ce dernier n&apos;est réellement expédié que si un pilote d&apos;e-mail est
                    configuré ; sinon il est seulement journalisé.
                  </p>
                </Alert>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <form action={simulatePaymentOutcome} className="w-full sm:w-auto">
                    <input type="hidden" name="providerRef" value={paiementSimule.providerRef} />
                    <input type="hidden" name="outcome" value="paid" />
                    <Button type="submit" block className="sm:w-auto">
                      Simuler un paiement accepté
                    </Button>
                  </form>

                  <form action={simulatePaymentOutcome} className="w-full sm:w-auto">
                    <input type="hidden" name="providerRef" value={paiementSimule.providerRef} />
                    <input type="hidden" name="outcome" value="failed" />
                    <Button type="submit" variant="secondary" block className="sm:w-auto">
                      Simuler un refus
                    </Button>
                  </form>

                  <form action={simulatePaymentOutcome} className="w-full sm:w-auto">
                    <input type="hidden" name="providerRef" value={paiementSimule.providerRef} />
                    <input type="hidden" name="outcome" value="expired" />
                    <Button type="submit" variant="secondary" block className="sm:w-auto">
                      Simuler une expiration
                    </Button>
                  </form>
                </div>
              </div>
            </section>
          ) : null}
        </section>

        {/* -----------------------------------------------------------------
            Récapitulatif court
            ----------------------------------------------------------------- */}
        <section
          aria-labelledby="paiement-recapitulatif"
          className="lg:sticky lg:top-6 lg:w-96 lg:shrink-0"
        >
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="paiement-recapitulatif" className="text-[14px] font-bold">
                Récapitulatif
              </h2>
              <Badge tone={etat.tone}>{etat.label}</Badge>
            </div>

            <dl className="mt-4 flex flex-col gap-2.5 text-[12px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt>Articles</dt>
                <dd className="font-semibold">
                  {nombreArticles}
                  {nombreArticles > 1 ? ' articles' : ' article'}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-4">
                <dt>E-mail</dt>
                <dd className="min-w-0 text-right font-semibold break-words">{order.email}</dd>
              </div>

              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-4">
                <dt className="font-semibold">Total</dt>
                <dd className="text-xl font-bold">{formatPrice(order.totalCents)}</dd>
              </div>
            </dl>

            {/*
              Une simulation n'est PAS « un prestataire en mode test ».
              `isTestMode` vaut vrai dans les deux cas, et s'en contenter
              laissait croire à un prestataire là où il n'y en a aucun — la
              confusion exacte que le reste du code s'applique à éviter.
            */}
            {dernierPaiement?.provider === 'simulation' ? (
              <p className="mt-3 text-xs text-muted">
                Paiement <strong className="font-semibold">simulé</strong> : aucun prestataire
                n&apos;est configuré sur cet environnement, et aucun encaissement n&apos;a lieu.
              </p>
            ) : dernierPaiement?.isTestMode ? (
              <p className="mt-3 text-xs text-muted">
                Prestataire de paiement en mode test : aucun montant réel n&apos;est encaissé.
              </p>
            ) : null}
          </Card>
        </section>
      </div>
    </div>
  )
}
