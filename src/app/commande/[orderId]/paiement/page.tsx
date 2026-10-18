import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
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

  const abandon = premier(sp.abandon) === '1'

  const dernierPaiement = order.payments[0] ?? null
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
    <div className="container-page py-8 lg:py-12">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Panier', href: '/panier' },
          { label: 'Paiement' },
        ]}
      />

      <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold sm:text-[2.125rem]">
        Paiement de la commande {order.reference}
      </h1>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* -----------------------------------------------------------------
            État du paiement et seule action encore possible
            ----------------------------------------------------------------- */}
        <section aria-labelledby="paiement-etat" className="min-w-0 flex-1">
          <h2 id="paiement-etat" className="text-lg font-bold">
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
                    <p>
                      Aucun montant n&apos;a été encaissé. Les articles de cette commande ont été
                      remis à disposition : pour commander à nouveau, repartez de votre panier.
                    </p>
                  </Alert>
                ) : null}

                {estAnnulee && !echec ? (
                  <Alert tone="danger" title="Cette commande a été annulée.">
                    <p>
                      Le paiement a été refusé, abandonné ou a expiré. Aucun montant n&apos;a été
                      encaissé et les articles ont été remis à disposition. Cette commande ne peut
                      plus être réglée.
                    </p>
                  </Alert>
                ) : null}

                {abandon && enAttente ? (
                  <Alert tone="warn" title="Paiement non terminé.">
                    <p>
                      Vous êtes revenu sans finaliser le règlement : rien n&apos;a été débité. La
                      commande reste en attente de paiement et les articles lui sont réservés un
                      moment, le temps que vous décidiez.
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
                    </Alert>
                    <div>
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
              <h2 id="paiement-simulation" className="text-lg font-bold">
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
              <h2 id="paiement-recapitulatif" className="text-lg font-bold">
                Récapitulatif
              </h2>
              <Badge tone={etat.tone}>{etat.label}</Badge>
            </div>

            <dl className="mt-4 flex flex-col gap-3 text-sm">
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

            {dernierPaiement?.isTestMode ? (
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
