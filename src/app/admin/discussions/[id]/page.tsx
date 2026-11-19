import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { prisma } from '@/lib/db'
import { formatPrice } from '@/lib/identity'
import { lirePanier, visiteurPresent, type CarteProduit } from '@/lib/chat'
import {
  carteDuConseil,
  INCLURE_CONSEIL,
  variantesDeLaFiche,
  type MessageAvecConseil,
} from '@/lib/chat-serveur'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Surface'
import { cn } from '@/lib/cn'
import {
  RelectureAuto,
  ReponseDiscussion,
  StatutDiscussion,
} from '@/components/admin/DiscussionActions'

export const metadata: Metadata = {
  title: 'Discussion',
  robots: { index: false, follow: false },
}

/**
 * Une discussion en direct, et de quoi y répondre juste.
 *
 * Le contexte passe avant tout : le produit regardé, le véhicule choisi, le
 * panier. La question la plus fréquente est « est-ce que ça va sur ma
 * voiture ? », et la moitié de la réponse est là, sans avoir à la demander.
 *
 * La page se relit toutes les 5 s et note chaque relecture comme une
 * lecture : tant qu'elle est ouverte, les nouveaux messages du visiteur ne
 * déclenchent pas d'e-mail (voir `EQUIPE_PRESENTE_MS`).
 */

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

const dtClass = 'text-xs font-semibold text-muted-strong'
const ddClass = 'mt-0.5 text-sm break-words'

export default async function DiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff('sav.view')
  const peutTraiter = can(staff.role, 'sav.handle')
  const { id } = await params

  const discussion = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 300, include: INCLURE_CONSEIL } },
  })
  if (!discussion) notFound()

  // De quoi conseiller sans chercher : les conditionnements de la fiche qu'il regardait.
  const suggestions = peutTraiter ? await variantesDeLaFiche(discussion.productSlug) : []
  const vehiculeCourt = discussion.vehicleLabel ? discussion.vehicleLabel.split(' · ')[0] : null

  // L'ouverture vaut lecture. Seule l'équipe qui peut répondre la marque :
  // un compte en lecture seule ne doit pas faire taire les alertes.
  if (peutTraiter) {
    await prisma.conversation
      .update({ where: { id }, data: { staffReadAt: new Date() } })
      .catch(() => {})
  }

  const present = visiteurPresent(discussion.customerSeenAt, new Date())
  const panier = lirePanier(discussion.cart)
  const close = discussion.status === 'CLOSED'

  return (
    <div className="flex flex-col gap-4">
      <RelectureAuto intervalle={5_000} />
      <div>
        <Breadcrumb
          items={[
            { label: 'Back-office', href: '/admin' },
            { label: 'Discussions', href: '/admin/discussions' },
            { label: discussion.productName ?? 'Discussion' },
          ]}
        />
        <h1 className="mt-2 text-xl font-extrabold break-words">
          {discussion.productName ?? 'Question en direct'}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {present ? (
            <Badge tone="ok">Le visiteur est sur la page</Badge>
          ) : (
            <Badge tone="neutral">Le visiteur a quitté la page</Badge>
          )}
          {close ? <Badge tone="neutral">Close</Badge> : null}
          {discussion.email ? (
            <Badge tone="info">Réponse possible par e-mail</Badge>
          ) : (
            <Badge tone="warn">Pas d’e-mail laissé</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* ---- Le fil, et la réponse ---- */}
        <section aria-label="Messages" className="flex min-w-0 flex-col gap-3">
          <ol className="flex flex-col gap-2.5">
            {discussion.messages.map((m) => {
              const equipe = m.authorKind !== 'customer'
              return (
                <li key={m.id} className={cn('flex flex-col', equipe ? 'items-end' : 'items-start')}>
                  {m.body ? (
                    <p
                      className={cn(
                        'max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-snug break-words whitespace-pre-line',
                        equipe ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-white',
                      )}
                    >
                      {m.body}
                    </p>
                  ) : null}
                  {carteDe(m) ? <CarteEnvoyee carte={carteDe(m)!} /> : null}
                  <span className="mt-1 px-1 text-[11px] text-muted">
                    {equipe ? 'Équipe' : 'Visiteur'} · {horodatage.format(m.createdAt)}
                    {m.emailedAt ? ' · envoyé par e-mail' : ''}
                  </span>
                </li>
              )
            })}
          </ol>

          {peutTraiter ? (
            <Card className="p-4">
              <ReponseDiscussion
                id={discussion.id}
                vehicule={vehiculeCourt}
                suggestions={suggestions}
              />
            </Card>
          ) : null}
        </section>

        {/* ---- Le contexte ---- */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="px-4 py-3">
            <dl className="flex flex-col gap-2.5">
              <div>
                <dt className={dtClass}>Produit regardé</dt>
                <dd className={ddClass}>
                  {discussion.productSlug ? (
                    <Link
                      href={`/p/${discussion.productSlug}`}
                      target="_blank"
                      className="underline decoration-line-strong underline-offset-4 hover:text-brand"
                    >
                      {discussion.productName}
                    </Link>
                  ) : (
                    <span className="text-muted">Aucune fiche produit</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={dtClass}>Véhicule choisi</dt>
                <dd className={ddClass}>
                  {discussion.vehicleLabel ?? <span className="text-muted">Aucun véhicule choisi</span>}
                </dd>
              </div>
              <div>
                <dt className={dtClass}>Panier</dt>
                <dd className={ddClass}>
                  {panier.length === 0 ? (
                    <span className="text-muted">Vide</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {panier.map((ligne, index) => (
                        <li key={index}>
                          {ligne.quantite} × {ligne.produit}
                          {ligne.option ? <span className="text-muted-strong"> ({ligne.option})</span> : null}
                          <span className="text-muted-strong"> · {formatPrice(ligne.prixCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              {discussion.pagePath ? (
                <div>
                  <dt className={dtClass}>Page</dt>
                  <dd className={ddClass}>{discussion.pagePath}</dd>
                </div>
              ) : null}
              <div>
                <dt className={dtClass}>E-mail</dt>
                <dd className={ddClass}>
                  {discussion.email ?? <span className="text-muted">Pas encore laissé</span>}
                </dd>
              </div>
              {discussion.visit ? (
                <div>
                  <dt className={dtClass}>Parcours</dt>
                  <dd className={ddClass}>
                    <Link
                      href={`/admin/statistiques/visites/${discussion.visit}?jours=7`}
                      className="underline decoration-line-strong underline-offset-4 hover:text-brand"
                    >
                      Voir la visite page par page
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {peutTraiter ? (
            <Card className="p-4">
              <StatutDiscussion id={discussion.id} close={close} />
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function carteDe(message: MessageAvecConseil): CarteProduit | null {
  return carteDuConseil(message.variant)
}

/** L'article conseillé, tel que le visiteur l'a reçu — prix et stock du moment. */
function CarteEnvoyee({ carte }: { carte: CarteProduit }) {
  return (
    <a
      href={carte.url}
      target="_blank"
      className="mt-1.5 flex max-w-[88%] items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 hover:border-line-strong"
    >
      {carte.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={carte.image.url} alt="" className="size-11 shrink-0 rounded object-cover" />
      ) : null}
      <span className="min-w-0 text-sm">
        <span className="block font-semibold break-words">{carte.nom}</span>
        <span className="block text-xs text-muted-strong">
          {[carte.option, formatPrice(carte.prixCents), carte.dispo].filter(Boolean).join(' · ')}
        </span>
      </span>
    </a>
  )
}
