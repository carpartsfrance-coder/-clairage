import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Prose } from '@/components/ui/Prose'
import { PageLegale } from '@/components/legal/PageLegale'

/*
  Pré-rendu partiel : cette page n'est pas encore reprise. `instant = false`
  la dispense de la vérification ; elle se comporte exactement comme avant.
  Retirer cette ligne, c'est la faire entrer dans le nouveau modèle — voir le
  commentaire de `cacheComponents` dans next.config.ts.
*/
export const instant = false

/** Un guide de montage rédigé dans le back-office (/admin/guides). */

const DIFFICULTE: Record<string, string> = { EASY: 'Facile', MEDIUM: 'Moyen', HARD: 'Difficile' }

async function lire(slug: string) {
  return prisma.guide.findFirst({
    where: { slug, publishedAt: { not: null } },
    include: {
      products: {
        where: { product: { status: 'PUBLISHED' } },
        include: { product: { select: { slug: true, name: true } } },
        take: 12,
      },
    },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = await lire((await params).slug)
  if (!guide) return { title: 'Guide introuvable' }
  return {
    title: guide.metaTitle ?? guide.title,
    description: guide.metaDescription ?? guide.summary ?? undefined,
    alternates: { canonical: `/guides/${guide.slug}` },
  }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = await lire((await params).slug)
  if (!guide) notFound()

  const infos = [
    DIFFICULTE[guide.difficulty] ? `Difficulté : ${DIFFICULTE[guide.difficulty].toLowerCase()}` : null,
    guide.durationMinutes ? `Environ ${guide.durationMinutes} min` : null,
  ].filter(Boolean)

  return (
    <PageLegale
      titre={guide.title}
      chapeau={[guide.summary, infos.join(' · ')].filter(Boolean).join(' — ') || undefined}
      miseAJour={guide.updatedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
    >
      <Prose>{guide.body}</Prose>
      {guide.products.length > 0 ? (
        <div className="mt-8 border-t border-line pt-5">
          <p className="font-bold">Les produits concernés</p>
          <ul className="mt-2 list-disc pl-5">
            {guide.products.map(({ product }) => (
              <li key={product.slug}>
                <Link href={`/p/${product.slug}`} className="underline underline-offset-2">
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-8 text-sm">
        <Link href="/guides" className="underline underline-offset-2">
          Tous les conseils de montage
        </Link>
      </p>
    </PageLegale>
  )
}
