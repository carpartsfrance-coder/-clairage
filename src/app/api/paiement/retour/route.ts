import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { canViewOrder } from '@/lib/order-access'
import { reconcilePayment } from '@/lib/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Retour du client depuis la page de paiement du prestataire.
 *
 * Pourquoi une route et non une page : **cette étape écrit**. Elle relit l'état
 * du paiement chez le prestataire et applique l'issue. Dans ce projet une page
 * ne doit jamais écrire — un rendu peut être rejoué, préchargé ou annulé par
 * React, et personne ne veut qu'un préchargement valide une commande.
 *
 * Elle existe aussi parce que **Mollie n'a qu'une seule URL de retour**, quelle
 * que soit l'issue, et que sa documentation demande explicitement de ne pas
 * déduire le statut de cette redirection. C'est donc ici qu'on interroge le
 * prestataire, puis qu'on décide où envoyer le client.
 *
 * Le jeton d'accès est exigé comme sur les pages de commande : cette URL arrive
 * dans le navigateur du client, dans son historique et dans les journaux du
 * prestataire. Sans contrôle, l'identifiant de commande suffirait à déclencher
 * un rattrapage sur la commande de quelqu'un d'autre.
 *
 * Une écriture derrière un GET se discute, et c'est assumé ici : le prestataire
 * ramène le client par une redirection de navigateur, il n'y a pas d'autre
 * verbe disponible. Le risque habituel — un préchargement ou un robot qui
 * déclenche l'action — est écarté par trois faits : l'URL porte un jeton
 * secret, `/api/` est refusé par robots.txt, et l'opération n'invente rien :
 * elle recopie l'état que le prestataire donne, exactement comme le webhook, et
 * passe par le même verrou d'idempotence. La rejouer n'a aucun effet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  // Toutes les redirections se construisent sur l'origine réellement demandée :
  // dépendre de NEXT_PUBLIC_SITE_URL ferait sortir le client du site si cette
  // variable était mal réglée, et elle l'est par défaut en développement.
  const base = url.origin
  const orderId = url.searchParams.get('order')?.trim() ?? ''
  const token = url.searchParams.get('t')

  // Sans commande identifiable, on ne devine pas : retour à l'accueil.
  if (!orderId) return NextResponse.redirect(new URL('/', base))

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, guestToken: true, userId: true },
  })

  const viewer = await getCurrentUser()
  if (!order || !canViewOrder(order, token, viewer?.id ?? null)) {
    // Même traitement qu'une commande inexistante : un refus distinct
    // confirmerait qu'elle existe.
    return NextResponse.redirect(new URL('/', base))
  }

  /*
    Rattrapage.

    Volontairement tolérant : une relecture qui échoue ne doit pas bloquer le
    client sur une page d'erreur. Il est renvoyé sur sa commande, qui affiche
    l'état réellement constaté en base — « en attente » si l'issue n'est pas
    encore connue, ce qui est la vérité à cet instant. Le webhook, ou un retour
    ultérieur, terminera le travail.
  */
  const result = await reconcilePayment(orderId).catch((error) => {
    console.error('[retour paiement] rattrapage impossible', error)
    return { applied: false, reason: 'erreur de rattrapage' } as const
  })

  // L'état lu APRÈS le rattrapage : c'est lui qui décide de la destination, pas
  // un paramètre d'URL ni la valeur de retour du rattrapage. Un paiement
  // confirmé entre-temps par le webhook mène donc bien à la confirmation, même
  // si le rattrapage n'a rien eu à appliquer.
  const after = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paymentStatus: true },
  })

  const suffix = token ? `?t=${encodeURIComponent(token)}` : ''

  if (after?.paymentStatus === 'PAID') {
    return NextResponse.redirect(
      new URL(`/commande/${orderId}/confirmation${suffix}`, base),
    )
  }

  console.info(
    `[retour paiement] ${orderId} : ${after?.paymentStatus ?? 'inconnu'} (${result.reason ?? 'appliqué'})`,
  )

  // Pas payée : la page de paiement dit où en est la commande, à partir de la
  // base. `abandon=1` ne fait que nuancer le message quand rien n'a changé ;
  // elle n'affirme pas d'elle-même un échec.
  const abandon = after?.paymentStatus === 'PENDING' ? (suffix ? '&abandon=1' : '?abandon=1') : ''
  return NextResponse.redirect(
    new URL(`/commande/${orderId}/paiement${suffix}${abandon}`, base),
  )
}
