import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { prisma } from '@/lib/db'
import { visiteurPresent } from '@/lib/chat'
import { disponibiliteChat, questionsEnAttente } from '@/lib/chat-serveur'
import { clePubliqueAlertes } from '@/lib/alertes-equipe'
import { AlertesAppareil } from '@/components/admin/AlertesAppareil'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'
import { Disponibilite, RelectureAuto } from '@/components/admin/DiscussionActions'

/*
  « (2) Discussions » dans l'onglet : sur ordinateur, c'est ce qui se voit
  depuis un autre onglet. La page se relit toutes les 10 s, le titre avec.
*/
export async function generateMetadata(): Promise<Metadata> {
  const enAttente = await questionsEnAttente()
  return {
    title: enAttente > 0 ? `(${enAttente}) Discussions` : 'Discussions',
    robots: { index: false, follow: false },
  }
}

/**
 * Boîte des discussions en direct.
 *
 * Pensée pour être ouverte sur un téléphone, depuis l'alerte e-mail : une
 * colonne, la question en clair, et ce qu'il faut pour répondre vite — le
 * produit regardé et le véhicule choisi. Les discussions qui attendent une
 * réponse passent devant les autres.
 */

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export default async function DiscussionsPage() {
  const staff = await requireStaff('sav.view')
  const peutTraiter = can(staff.role, 'sav.handle')

  const [disponible, clePublique, discussions] = await Promise.all([
    disponibiliteChat(),
    clePubliqueAlertes(),
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
  ])

  const maintenant = new Date()
  const lignes = discussions
    .map((d) => {
      const dernier = d.messages[0] ?? null
      const attend = d.status === 'OPEN' && dernier?.authorKind === 'customer'
      return { d, dernier, attend, present: visiteurPresent(d.customerSeenAt, maintenant) }
    })
    // Celles qui attendent une réponse d'abord, puis l'ordre chronologique.
    .sort((a, b) => Number(b.attend) - Number(a.attend))

  const enAttente = lignes.filter((l) => l.attend).length

  return (
    <div className="flex flex-col gap-4">
      <RelectureAuto intervalle={10_000} />
      <div>
        <Breadcrumb items={[{ label: 'Back-office', href: '/admin' }, { label: 'Discussions' }]} />
        <h1 className="mt-2 text-xl font-extrabold">Discussions</h1>
        <p className="mt-1 text-sm text-muted-strong">
          {enAttente === 0
            ? 'Aucune question n’attend de réponse.'
            : `${enAttente} question${enAttente > 1 ? 's attendent' : ' attend'} une réponse.`}
        </p>
      </div>

      {peutTraiter ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <Disponibilite disponible={disponible} />
          </Card>
          <Card className="p-4">
            <AlertesAppareil clePublique={clePublique} />
          </Card>
        </div>
      ) : null}

      {lignes.length === 0 ? (
        <EmptyState
          title="Aucune discussion pour l’instant"
          description="Les questions posées depuis la bulle des fiches produit et du panier arriveront ici, et par e-mail à l’adresse de contact."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lignes.map(({ d, dernier, attend, present }) => (
            <li key={d.id}>
              <Link
                href={`/admin/discussions/${d.id}`}
                className="block rounded-md border border-line bg-white px-4 py-3 transition-colors hover:border-line-strong"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {attend ? <Badge tone="warn">À répondre</Badge> : null}
                  {d.status === 'CLOSED' ? <Badge tone="neutral">Close</Badge> : null}
                  {present ? <Badge tone="ok">Sur la page</Badge> : null}
                  <span className="text-xs text-muted">
                    {horodatage.format(d.lastMessageAt)}
                  </span>
                </span>
                <span className="mt-1.5 block text-sm font-semibold break-words">
                  {d.productName ?? 'Question sans fiche produit'}
                </span>
                {d.vehicleLabel ? (
                  <span className="block text-xs text-muted-strong">{d.vehicleLabel}</span>
                ) : null}
                {dernier ? (
                  <span className="mt-1.5 line-clamp-2 block text-sm break-words text-muted-strong">
                    {dernier.authorKind === 'customer' ? '' : 'Vous : '}
                    {dernier.body}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
