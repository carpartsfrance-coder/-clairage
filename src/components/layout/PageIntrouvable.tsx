import { ButtonLink } from '@/components/ui/Button'
import { mainNav } from '@/lib/navigation'
import { IconArrowRight } from '@/components/ui/icons'

/**
 * Contenu de la page 404 : on propose des sorties réelles plutôt qu'un cul-de-sac.
 *
 * Il est rendu depuis deux endroits, et c'est voulu : `(boutique)/not-found.tsx`
 * pour un `notFound()` déclenché par une page publique — une fiche produit
 * retirée, par exemple — et `not-found.tsx` à la racine pour une URL qui ne
 * correspond à aucune route. La seconde n'appartient à aucun groupe de routes,
 * donc aucune mise en page de groupe ne s'y applique : elle pose le décor
 * elle-même.
 */
export function PageIntrouvable() {
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
