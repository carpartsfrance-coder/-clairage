import Image from 'next/image'
import Link from 'next/link'
import { IconArrowRight } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/Surface'
import type { HomeUniverse } from '@/lib/queries/home'

export type UniversesSectionProps = {
  content: { eyebrow: string; title: string; subtitle?: string }
  universes: HomeUniverse[]
}

/** Taille réelle d'une vignette : ~240 px sur xl, puis 3 puis 2 colonnes. */
const THUMB_SIZES = '(min-width: 1280px) 250px, (min-width: 768px) 30vw, 46vw'

/**
 * Les six univers de produits.
 *
 * Chaque carte est un seul lien. La pastille fléchée sous le nom en fait
 * partie — ce n'est pas un second lien imbriqué, qui doublerait la cible au
 * clavier et ferait entendre deux fois la même destination.
 *
 * **Le raccourci « Voir toutes les catégories » est à hauteur du titre**, et
 * non sous les cartes. Il s'adresse à qui ne se reconnaît dans aucune des six
 * vignettes : le lui proposer après les avoir toutes parcourues arrive trop
 * tard.
 */
export function UniversesSection({ content, universes }: UniversesSectionProps) {
  return (
    <section aria-labelledby="universes-heading" className="bg-white py-12 lg:py-16">
      <div className="container-page">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-bold tracking-[2px] text-brand uppercase">
              {content.eyebrow}
            </p>
            <h2
              id="universes-heading"
              className="m-0 mt-3 text-[28px] leading-[1.08] font-extrabold tracking-[-1px] text-ink lg:text-[36px] lg:tracking-[-1.3px]"
            >
              {content.title}
            </h2>
            {content.subtitle ? (
              <p className="m-0 mt-2.5 text-[15px] leading-[1.6] text-muted-strong lg:text-[16px]">
                {content.subtitle}
              </p>
            ) : null}
          </div>

          <Link
            href="/c"
            className="inline-flex min-h-[44px] w-fit shrink-0 items-center gap-2.5 rounded-md border border-brand px-5 text-[14px] font-bold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            Voir toutes les catégories
            <IconArrowRight className="size-[17px] shrink-0" />
          </Link>
        </div>

        {universes.length === 0 ? (
          <EmptyState
            className="mt-8"
            title="Les univers seront affichés ici."
            action={{ label: 'Voir tous les univers', href: '/c' }}
          />
        ) : (
          <ul className="mt-8 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 xl:grid-cols-6">
            {universes.map((universe) => (
              <li key={universe.slug}>
                <Link
                  href={`/c/${universe.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-white transition-colors hover:border-line-strong"
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-surface-muted">
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

                  {/*
                    Le nom et la pastille se partagent la barre basse, l'un
                    poussant l'autre au bord. `mt-auto` la colle en bas même
                    quand un nom passe sur deux lignes : sans cela, les six
                    pastilles ne seraient plus alignées d'une carte à l'autre.
                  */}
                  <div className="mt-auto flex items-center justify-between gap-3 px-4 py-4">
                    <p className="m-0 min-w-0 text-[14px] leading-[1.3] font-bold text-ink lg:text-[15px]">
                      {universe.name}
                    </p>
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand text-brand transition-colors group-hover:bg-brand group-hover:text-white"
                    >
                      <IconArrowRight className="size-[15px]" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
