import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/Button'
import { mainNav } from '@/lib/navigation'
import { IconArrowRight } from '@/components/ui/icons'

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
}

/** 404 : on propose des sorties réelles plutôt qu'un cul-de-sac. */
export default function NotFound() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow text-brand">Erreur 404</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Cette page n&apos;existe pas.</h1>
      <p className="mt-3 max-w-xl text-lg text-muted-strong">
        Le lien est peut-être ancien, ou la page a été déplacée. Vous pouvez repartir de votre
        véhicule, ou parcourir les univers.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/vehicule" iconRight={<IconArrowRight className="size-5" />}>
          Partir de mon véhicule
        </ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Accueil
        </ButtonLink>
      </div>

      <nav aria-label="Univers" className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Univers</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {mainNav.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="font-semibold underline underline-offset-4 hover:text-brand">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
