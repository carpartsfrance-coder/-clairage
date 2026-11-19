import { NextResponse } from 'next/server'
import type { Conversation } from '@prisma/client'
import { prisma } from '@/lib/db'
import { throttle, throttleMessage } from '@/lib/auth/throttle'
import { notifierEquipe } from '@/lib/alertes-equipe'
import {
  cheminPropre,
  doitAlerterEquipe,
  doitNotifierEquipe,
  emailValide,
  jetonPropre,
  nettoyerMessage,
  slugPropre,
  visitePropre,
  type EtatDiscussion,
} from '@/lib/chat'
import {
  alerterEquipe,
  contexteDuVisiteur,
  disponibiliteChat,
  INCLURE_CONSEIL,
  nouveauJeton,
  versLeNavigateur,
} from '@/lib/chat-serveur'

/**
 * La discussion en direct, côté visiteur.
 *
 * - `GET ?t=<jeton>` : relit la discussion (la bulle interroge toutes les
 *   quelques secondes tant que la page est au premier plan). Sans jeton,
 *   renvoie seulement si l'équipe est disponible.
 * - `POST` (JSON) : un message, une adresse e-mail, ou les deux.
 *
 * Le jeton est la seule clé d'une discussion : 24 octets aléatoires, gardés
 * par le navigateur du visiteur, jamais dans une adresse. Un jeton inconnu
 * ne dit pas s'il a existé — la réponse est la même que sans jeton.
 *
 * Le corps doit être du JSON : un formulaire posté depuis un autre site ne
 * peut pas en envoyer sans que le navigateur demande d'abord la permission,
 * ce qui ferme la porte aux envois croisés sans autre mécanisme.
 */

const ROBOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|pingdom|monitor/i

/** Au-delà, la discussion n'est plus une question en passant. */
const MESSAGES_RENVOYES = 200

/** La présence du visiteur n'est réécrite qu'une fois toutes les 10 s. */
const PRESENCE_ECRITURE_MS = 10_000

function reponse(corps: EtatDiscussion | { erreur: string }, status = 200) {
  return NextResponse.json(corps, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function etat(discussion: Conversation, disponible: boolean): Promise<EtatDiscussion> {
  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId: discussion.id },
    orderBy: { createdAt: 'desc' },
    take: MESSAGES_RENVOYES,
    // L'article conseillé, relu à chaque fois : prix et stock du moment.
    include: INCLURE_CONSEIL,
  })
  return {
    disponible,
    t: discussion.token,
    ouverte: discussion.status === 'OPEN',
    avecEmail: Boolean(discussion.email),
    messages: versLeNavigateur(messages.reverse()),
  }
}

export async function GET(request: Request) {
  const disponible = await disponibiliteChat()
  const t = jetonPropre(new URL(request.url).searchParams.get('t'))
  if (!t) return reponse({ disponible })

  const discussion = await prisma.conversation.findUnique({ where: { token: t } })
  if (!discussion) return reponse({ disponible })

  // La relecture vaut présence : c'est ce qui dit à l'équipe, au moment de
  // répondre, si le visiteur lira à l'écran ou s'il faut lui écrire.
  const maintenant = new Date()
  if (
    !discussion.customerSeenAt ||
    maintenant.getTime() - discussion.customerSeenAt.getTime() > PRESENCE_ECRITURE_MS
  ) {
    await prisma.conversation
      .update({ where: { id: discussion.id }, data: { customerSeenAt: maintenant } })
      .catch(() => {})
  }
  return reponse(await etat(discussion, disponible))
}

export async function POST(request: Request) {
  if (ROBOT.test(request.headers.get('user-agent') ?? '')) {
    return reponse({ erreur: 'Requête refusée.' }, 403)
  }
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    return reponse({ erreur: 'Format non accepté.' }, 415)
  }

  let corps: Record<string, unknown>
  try {
    const brut: unknown = await request.json()
    if (typeof brut !== 'object' || brut === null) throw new Error('corps')
    corps = brut as Record<string, unknown>
  } catch {
    return reponse({ erreur: 'Requête illisible.' }, 400)
  }

  const texte = nettoyerMessage(corps.message)
  const emailFourni = typeof corps.email === 'string' && corps.email.trim() !== ''
  const email = emailFourni ? emailValide(corps.email) : null
  if (emailFourni && !email) return reponse({ erreur: 'Cette adresse e-mail ne semble pas valide.' }, 400)
  if (!texte && !email) return reponse({ erreur: 'Le message est vide.' }, 400)

  const limite = await throttle('chatMessage')
  if (!limite.allowed) return reponse({ erreur: throttleMessage(limite.retryAfterSeconds) }, 429)

  const t = jetonPropre(corps.t)
  let discussion = t ? await prisma.conversation.findUnique({ where: { token: t } }) : null

  if (!discussion) {
    if (!texte) return reponse({ erreur: 'Écrivez d’abord votre question.' }, 400)
    const ouverture = await throttle('chatOuverture')
    if (!ouverture.allowed) {
      return reponse({ erreur: throttleMessage(ouverture.retryAfterSeconds) }, 429)
    }
  }

  const disponible = await disponibiliteChat()
  const maintenant = new Date()

  // Une adresse seule : le visiteur veut recevoir la réponse s'il part.
  if (!texte && discussion) {
    discussion = await prisma.conversation.update({
      where: { id: discussion.id },
      data: { email, customerSeenAt: maintenant },
    })
    return reponse(await etat(discussion, disponible))
  }
  if (!texte) return reponse({ erreur: 'Le message est vide.' }, 400)

  const contexte = await contexteDuVisiteur(slugPropre(corps.produit))
  const page = cheminPropre(corps.page)
  const visite = visitePropre(corps.visite)

  try {
    if (!discussion) {
      discussion = await prisma.conversation.create({
        data: {
          token: nouveauJeton(),
          email,
          pagePath: page,
          productSlug: contexte.productSlug,
          productName: contexte.productName,
          vehicleLabel: contexte.vehicleLabel,
          cart: contexte.cart,
          visit: visite,
          customerSeenAt: maintenant,
          lastMessageAt: maintenant,
          messages: { create: { authorKind: 'customer', body: texte } },
        },
      })
    } else {
      // Le contexte suit le visiteur : s'il écrit depuis une autre fiche,
      // c'est elle que l'équipe doit voir. Une page sans produit (le panier)
      // ne fait pas oublier le dernier produit regardé.
      discussion = await prisma.conversation.update({
        where: { id: discussion.id },
        data: {
          status: 'OPEN',
          ...(email ? { email } : {}),
          ...(page ? { pagePath: page } : {}),
          ...(contexte.productSlug
            ? { productSlug: contexte.productSlug, productName: contexte.productName }
            : {}),
          ...(contexte.vehicleLabel ? { vehicleLabel: contexte.vehicleLabel } : {}),
          cart: contexte.cart,
          ...(visite ? { visit: visite } : {}),
          customerSeenAt: maintenant,
          lastMessageAt: maintenant,
          messages: { create: { authorKind: 'customer', body: texte } },
        },
      })
    }
  } catch (error) {
    console.error('[chat] message non enregistré', error)
    return reponse({ erreur: 'Le message n’a pas pu partir. Réessayez dans un instant.' }, 500)
  }

  /*
    Deux alertes, en parallèle : la notification sonne tout de suite sur les
    appareils de l'équipe ; l'e-mail garde la trace et sert de filet. Aucune
    des deux ne part si l'équipe a déjà la discussion sous les yeux.
  */
  const alertes: Promise<unknown>[] = []
  if (doitNotifierEquipe(discussion, maintenant)) {
    alertes.push(
      notifierEquipe({
        titre: `Question en direct${discussion.productName ? ` — ${discussion.productName}` : ''}`,
        texte: discussion.vehicleLabel ? `${texte}\n${discussion.vehicleLabel}` : texte,
        url: `/admin/discussions/${discussion.id}`,
        etiquette: `discussion-${discussion.id}`,
      }),
    )
  }
  if (doitAlerterEquipe(discussion, maintenant)) alertes.push(alerterEquipe(discussion, texte))
  await Promise.all(alertes)

  return reponse(await etat(discussion, disponible))
}
