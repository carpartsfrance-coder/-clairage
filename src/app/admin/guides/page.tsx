import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { prisma } from '@/lib/db'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState } from '@/components/ui/Surface'
import { GuideForm } from '@/components/admin/GuideForm'

/*
  Pré-rendu partiel : cette page n'est pas encore reprise. `instant = false`
  la dispense de la vérification ; elle se comporte exactement comme avant.
  Retirer cette ligne, c'est la faire entrer dans le nouveau modèle — voir le
  commentaire de `cacheComponents` dans next.config.ts.
*/
export const instant = false

export const metadata: Metadata = { title: 'Guides de montage', robots: { index: false, follow: false } }

const DIFFICULTE: Record<string, string> = { EASY: 'Facile', MEDIUM: 'Moyen', HARD: 'Difficile', UNKNOWN: '—' }

export default async function AdminGuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ modifier?: string; cree?: string }>
}) {
  const staff = await requireStaff('catalog.view')
  const peutModifier = can(staff.role, 'catalog.edit')
  const { modifier, cree } = await searchParams
  const guides = await prisma.guide.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { products: true } } },
  })
  const enCours = modifier ? guides.find((g) => g.id === modifier) : undefined

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-extrabold">Guides de montage</h1>
      <p className="text-sm text-muted-strong">
        Un guide s’écrit une fois, puis se rattache aux produits depuis leur fiche (onglet « Fiche
        produit », bloc « Questions et montage »). Il est publié sur /guides.
      </p>

      {peutModifier ? (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {enCours ? (
              <>
                Modifier « {enCours.title} »{' '}
                <Link href="/admin/guides" className="ml-2 text-xs font-normal underline">
                  Nouveau guide
                </Link>
              </>
            ) : (
              'Écrire un guide'
            )}
          </h2>
          {enCours ? (
            <GuideForm
              key={enCours.id}
              notice={cree ? 'Guide créé.' : undefined}
              initial={{
                id: enCours.id,
                title: enCours.title,
                slug: enCours.slug,
                summary: enCours.summary ?? '',
                body: enCours.body,
                difficulty: enCours.difficulty,
                durationMinutes: enCours.durationMinutes?.toString() ?? '',
                published: enCours.publishedAt !== null,
              }}
            />
          ) : (
            <GuideForm key="nouveau" />
          )}
        </Card>
      ) : null}

      {guides.length === 0 ? (
        <EmptyState title="Aucun guide pour l’instant." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-soft text-left text-xs">
                <th className="px-3 py-2">Titre</th>
                <th className="px-3 py-2">Difficulté</th>
                <th className="px-3 py-2 text-right">Produits liés</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {guides.map((g) => (
                <tr key={g.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-semibold">{g.title}</span>
                    <span className="block font-mono text-xs text-muted">/guides/{g.slug}</span>
                  </td>
                  <td className="px-3 py-2">{DIFFICULTE[g.difficulty]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g._count.products}</td>
                  <td className="px-3 py-2">
                    {g.publishedAt ? <Badge tone="ok">En ligne</Badge> : <Badge tone="neutral">Brouillon</Badge>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {peutModifier ? (
                      <Link href={`/admin/guides?modifier=${g.id}`} className="text-xs font-semibold underline">
                        Modifier
                      </Link>
                    ) : null}
                    {g.publishedAt ? (
                      <a href={`/guides/${g.slug}`} className="ml-3 text-xs underline" target="_blank" rel="noreferrer">
                        Voir
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
