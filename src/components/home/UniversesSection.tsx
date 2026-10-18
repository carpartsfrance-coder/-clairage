import Image from 'next/image'
import Link from 'next/link'
import { IconArrowUpRight } from '@/components/ui/icons'
import { EmptyState, SectionHeading } from '@/components/ui/Surface'
import type { HomeUniverse } from '@/lib/queries/home'

export type UniversesSectionProps = {
  content: { eyebrow: string; title: string }
  universes: HomeUniverse[]
}

/** Taille réelle d'une vignette : ~205 px sur xl, puis 3 puis 2 colonnes. */
const THUMB_SIZES = '(min-width: 1280px) 220px, (min-width: 768px) 30vw, 46vw'

/**
 * Les six univers de produits.
 *
 * Chaque carte est un seul lien : le « Découvrir » visible sous le nom est un
 * élément de ce lien, pas un second lien imbriqué.
 */
export function UniversesSection({ content, universes }: UniversesSectionProps) {
  return (
    <section aria-labelledby="universes-heading" className="bg-white py-14">
      <div className="container-page">
        {/* L'id porte sur l'enveloppe : SectionHeading n'expose pas d'id sur son <h2>. */}
        <div id="universes-heading">
          <SectionHeading eyebrow={content.eyebrow} title={content.title} />
        </div>

        {universes.length === 0 ? (
          <EmptyState
            className="mt-8"
            title="Les univers seront affichés ici."
            action={{ label: 'Voir tous les univers', href: '/c' }}
          />
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
            {universes.map((universe) => (
              <li key={universe.slug}>
                <Link href={`/c/${universe.slug}`} className="group block">
                  <div className="relative aspect-[5/4] overflow-hidden rounded-sm bg-surface-muted">
                    {universe.image ? (
                      <Image
                        src={universe.image.url}
                        /* Décorative : le nom de l'univers est lu juste après, dans le même lien. */
                        alt=""
                        fill
                        sizes={THUMB_SIZES}
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center px-2 text-center text-sm text-muted">
                        {universe.name}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-[0.95rem] font-bold text-slate-ink">{universe.name}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm text-muted-strong underline underline-offset-4 transition-colors group-hover:text-brand">
                    Découvrir
                    <IconArrowUpRight className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
