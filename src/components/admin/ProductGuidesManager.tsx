'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose } from '@/components/ui/icons'
import { noteGuideNonPublie } from '@/lib/admin/produit-contenu'
import { attachProductGuide, detachProductGuide } from '@/lib/actions/admin-product-content'
import { ETAT_VIDE, Retour } from './ContentFields'

/**
 * Les guides de montage rattachés à une fiche produit.
 *
 * Le rattachement n'apparaissait nulle part dans le back-office : la fiche
 * publique affiche une section « Montage » avec ses guides, mais la fiche
 * d'administration n'en disait pas un mot, et le lien se posait en base.
 *
 * **Les guides ne se créent pas ici, et c'est dit.** Un guide a son propre
 * contenu, sa propre adresse et sa propre rédaction ; aucun écran de
 * l'application ne le crée encore — ils viennent du jeu de données. Cet écran
 * ne fait que désigner lequel accompagne ce produit, et peut donc n'avoir
 * aucun choix à proposer. Mieux vaut l'écrire que d'ouvrir une liste vide.
 *
 * Un guide non publié est rattachable — on prépare le lien avant la mise en
 * ligne du guide — mais la fiche ne l'affiche pas : `getProduct` filtre les
 * guides sur leur date de publication. L'écran le signale sur chaque ligne
 * concernée, sinon le rattachement semblerait sans effet.
 */

export type GuideFiche = { id: string; title: string; slug: string; publie: boolean }
export type GuideOption = { id: string; title: string; publie: boolean }

function LigneGuide({ productId, guide }: { productId: string; guide: GuideFiche }) {
  const [state, action, pending] = useActionState(detachProductGuide, ETAT_VIDE)
  const note = noteGuideNonPublie({ publie: guide.publie })

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/guides/${guide.slug}`}
              className="text-sm font-semibold text-brand underline underline-offset-4"
            >
              {guide.title}
            </Link>
            {guide.publie ? null : <Badge tone="warn">non publié</Badge>}
          </div>
          {note ? <p className="mt-1 text-xs text-muted-strong">{note}</p> : null}
        </div>

        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="guideId" value={guide.id} />
          <Button type="submit" size="sm" variant="ghost" disabled={pending}>
            {/* La couleur est portée par le contenu : `cn` ne déduplique pas les
                utilitaires Tailwind. */}
            <span className="flex items-center gap-1.5 text-danger">
              <IconClose className="size-4 shrink-0" />
              {pending ? 'Détachement…' : 'Détacher'}
            </span>
          </Button>
        </form>
      </div>
      {state.error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  )
}

export function ProductGuidesManager({
  productId,
  rattaches,
  disponibles,
  mayEdit,
}: {
  productId: string
  rattaches: GuideFiche[]
  /** Les guides qui ne sont pas encore rattachés à cette fiche. */
  disponibles: GuideOption[]
  mayEdit: boolean
}) {
  const [state, action, pending] = useActionState(attachProductGuide, ETAT_VIDE)

  if (!mayEdit) {
    return rattaches.length === 0 ? (
      <p className="mt-2 text-sm text-muted-strong">Aucun guide rattaché.</p>
    ) : (
      <ul className="mt-2 flex flex-col gap-2">
        {rattaches.map((guide) => (
          <li key={guide.id} className="rounded-md border border-line bg-white p-3 text-sm">
            {guide.title}
            {guide.publie ? null : <span className="ml-2 text-xs text-muted">non publié</span>}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {rattaches.length === 0 ? (
        <p className="text-sm text-muted-strong">
          Aucun guide rattaché. Sans guide et sans niveau de montage, la section « Montage »
          n’apparaît pas sur la fiche.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rattaches.map((guide) => (
            <LigneGuide key={guide.id} productId={productId} guide={guide} />
          ))}
        </ul>
      )}

      {disponibles.length === 0 ? (
        <Alert tone="info" title="Aucun guide à rattacher">
          {rattaches.length === 0
            ? "Aucun guide n'existe encore. Les guides viennent du jeu de données : aucun écran de l'application ne les rédige."
            : 'Tous les guides existants sont déjà rattachés à cette fiche.'}
        </Alert>
      ) : (
        <form action={action} className="rounded-md border border-line p-3">
          <input type="hidden" name="productId" value={productId} />
          <SelectField
            key={`guideId-${disponibles.length}`}
            id="guideId"
            name="guideId"
            label="Rattacher un guide"
            hint="Le guide s’affiche dans la section « Montage » de la fiche, avec son niveau et sa durée."
            defaultValue=""
            required
          >
            <option value="" disabled>
              Choisir un guide
            </option>
            {disponibles.map((guide) => (
              <option key={guide.id} value={guide.id}>
                {guide.title}
                {guide.publie ? '' : ' — non publié'}
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="secondary" className="mt-3" disabled={pending}>
            {pending ? 'Rattachement…' : 'Rattacher'}
          </Button>
          <Retour state={state} />
        </form>
      )}
    </div>
  )
}
