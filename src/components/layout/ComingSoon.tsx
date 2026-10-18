import Link from 'next/link'
import { ButtonLink } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { IconArrowRight } from '@/components/ui/icons'

/**
 * Page non encore construite.
 *
 * Elle existe pour une raison précise : un lien du header ou du pied de page
 * ne doit jamais tomber sur une 404. Elle dit ce qui est prévu, à quelle étape
 * du chantier, et propose une sortie — c'est plus utile qu'une page vide, et
 * surtout ce n'est pas une page qui fait semblant de fonctionner.
 *
 * Ces pages sont listées « Manquante » dans la matrice de réception.
 */
export function ComingSoon({
  title,
  purpose,
  step,
  related = [],
}: {
  title: string
  /** Ce que la page fera, en une phrase. */
  purpose: string
  /** Étape du plan de travail où elle est prévue. */
  step: string
  related?: Array<{ label: string; href: string }>
}) {
  return (
    <div className="container-page py-16">
      <nav aria-label="Fil d'Ariane" className="mb-6 text-sm text-muted">
        <Link href="/" className="underline underline-offset-4 hover:text-slate-ink">
          Accueil
        </Link>
        <span aria-hidden className="mx-2">
          ›
        </span>
        <span>{title}</span>
      </nav>

      <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-strong">{purpose}</p>

      <Alert tone="info" title="Page non encore construite" className="mt-8 max-w-2xl">
        Elle est prévue à l&apos;étape « {step} » du plan de travail. Rien n&apos;est simulé ici :
        tant que la page n&apos;est pas construite, elle le dit.
      </Alert>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href="/" iconRight={<IconArrowRight className="size-5" />}>
          Retour à l&apos;accueil
        </ButtonLink>
        {related.map((item) => (
          <ButtonLink key={item.href} href={item.href} variant="secondary">
            {item.label}
          </ButtonLink>
        ))}
      </div>
    </div>
  )
}
