'use client'

import { useActionState, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPencil, IconPlus } from '@/components/ui/icons'
import { formatPrice } from '@/lib/identity'
import {
  MOTIFS_STOCK,
  MOTIFS_STOCK_LABELS,
  PACKAGING_LABELS,
  raisonStockNonEditable,
  texteSaisi,
  type PackagingValue,
} from '@/lib/admin/catalogue'
import {
  createVariant,
  removeVariant,
  setVariantStock,
  updateVariant,
  type PurchaseState,
} from '@/lib/actions/admin-product-purchase'
import {
  ChampsVariante,
  VARIANTE_VIDE,
  centsEnSaisie,
  valeursAffichees,
  type TauxTva,
} from './VariantFields'

/**
 * Le bloc achat d'une fiche produit : ce qui décide du prix, de la TVA et du
 * stock.
 *
 * Cette section était un tableau en lecture seule. Elle montrait un taux de TVA
 * manquant, un prix à 0 €, un stock faux — sans rien permettre d'y faire.
 * Corriger un prix demandait une requête SQL, et c'est le genre de geste qu'on
 * finit par faire sur la base de production.
 *
 * Trois formulaires par conditionnement, et c'est volontaire :
 *
 * 1. **Le stock, toujours visible.** C'est le geste quotidien — on compte un
 *    rayon, on saisit ce qu'on a compté. Le cacher derrière un dépliant
 *    rendrait pénible la seule opération répétée de l'écran. Il exige un motif
 *    parce qu'il laisse un mouvement : un inventaire faux sans trace est
 *    inexplicable six mois plus tard.
 * 2. **Le reste, replié.** Prix, référence, conditionnement, seuil : on y
 *    revient rarement, et dix champs ouverts par conditionnement feraient
 *    perdre la vue d'ensemble que donnait le tableau.
 * 3. **Le retrait, en deux temps**, et refusé par le serveur dès qu'une
 *    commande, un panier, un kit ou une compatibilité s'y rattache.
 *
 * L'en-tête de chaque carte garde ce que le tableau donnait d'un coup d'œil :
 * référence, prix, TVA, stock détenu, réservé et vendable.
 */

const EMPTY: PurchaseState = {}

export type VarianteFiche = {
  id: string
  sku: string
  name: string
  packaging: string
  priceCents: number
  compareAtCents: number | null
  vatRateId: string | null
  vatRateLabel: string | null
  stockOnHand: number
  stockReserved: number
  lowStockThreshold: number
  weightGrams: number | null
  backorder: boolean
  active: boolean
  /** Composants d'un kit : leur présence rend le stock non modifiable. */
  composants: Array<{ id: string; quantite: number; requis: boolean; libelle: string; sku: string }>
  /** Ce qui empêcherait la suppression, compté côté serveur. */
  attaches: { commandes: number; paniers: number; kits: number; compatibilites: number }
}

function Retour({ state }: { state: PurchaseState }) {
  if (state.error) {
    return (
      <Alert tone="danger" className="mt-3">
        {state.error}
      </Alert>
    )
  }
  if (state.notice) {
    return (
      <Alert tone="ok" className="mt-3">
        {state.notice}
      </Alert>
    )
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Stock                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Stock détenu, et le motif qui l'explique.
 *
 * On saisit le stock **constaté**, pas l'écart : compter douze pièces en rayon
 * est un geste sûr, calculer de tête qu'il faut en ajouter trois ne l'est pas.
 * L'écart est déduit par le serveur et conservé dans `StockMovement`.
 */
function FormulaireStock({ variante }: { variante: VarianteFiche }) {
  const [state, action, pending] = useActionState(setVariantStock, EMPTY)

  const fige = raisonStockNonEditable({ composants: variante.composants.length })
  if (fige) {
    return (
      <p className="rounded-sm bg-surface-soft px-2.5 py-2 text-xs text-muted-strong">{fige}</p>
    )
  }

  return (
    <form action={action} className="rounded-sm bg-surface-soft p-2.5">
      <input type="hidden" name="variantId" value={variante.id} />
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          id={`stock-${variante.id}`}
          name="stock"
          label="Stock détenu"
          fieldSize="sm"
          inputMode="numeric"
          defaultValue={texteSaisi(state.saisie, 'stock', String(variante.stockOnHand))}
          wrapperClassName="w-24"
        />
        <SelectField
          key={`motif-${texteSaisi(state.saisie, 'motif', 'inventaire')}`}
          id={`motif-${variante.id}`}
          name="motif"
          label="Motif"
          fieldSize="sm"
          defaultValue={texteSaisi(state.saisie, 'motif', 'inventaire')}
          wrapperClassName="min-w-[11rem] flex-1"
        >
          {MOTIFS_STOCK.map((motif) => (
            <option key={motif} value={motif}>
              {MOTIFS_STOCK_LABELS[motif]}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer le stock'}
        </Button>
      </div>

      {variante.stockReserved > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-strong">
          {variante.stockReserved} pièce{variante.stockReserved > 1 ? 's' : ''} réservée
          {variante.stockReserved > 1 ? 's' : ''} par des commandes non expédiées : elles sont
          comptées dans le stock détenu, mais déjà vendues.
        </p>
      ) : null}

      {state.error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className="mt-1.5 text-xs text-ok" aria-live="polite">
          {state.notice}
        </p>
      ) : null}
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Une carte de conditionnement                                               */
/* -------------------------------------------------------------------------- */

function CarteVariante({
  variante,
  tauxTva,
  mayEdit,
}: {
  variante: VarianteFiche
  tauxTva: TauxTva[]
  mayEdit: boolean
}) {
  const [edition, actionEdition, editionPending] = useActionState(updateVariant, EMPTY)
  const [retrait, actionRetrait, retraitPending] = useActionState(removeVariant, EMPTY)
  const [confirme, setConfirme] = useState(false)

  const vendable = Math.max(0, variante.stockOnHand - variante.stockReserved)
  const estKit = variante.composants.length > 0
  const sansTva = !variante.vatRateId

  return (
    <li
      className={[
        'flex flex-col gap-2.5 rounded-md border bg-white p-3',
        sansTva ? 'border-danger' : variante.active ? 'border-line' : 'border-line-strong',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-semibold">{variante.sku}</span>
        <span className="min-w-0 text-sm font-semibold">{variante.name}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">
            {PACKAGING_LABELS[variante.packaging as PackagingValue] ?? variante.packaging}
          </Badge>
          {variante.active ? (
            <Badge tone="ok">Proposé à la vente</Badge>
          ) : (
            <Badge tone="neutral">Retiré de la vente</Badge>
          )}
          {sansTva ? <Badge tone="danger">sans taux de TVA</Badge> : null}
          {variante.backorder ? <Badge tone="warn">vente à découvert</Badge> : null}
        </span>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-muted-strong">Prix</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(variante.priceCents)}</dd>
          {variante.compareAtCents ? (
            <dd className="text-xs text-muted line-through tabular-nums">
              {formatPrice(variante.compareAtCents)}
            </dd>
          ) : null}
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-muted-strong">TVA</dt>
          <dd className={sansTva ? 'text-sm font-semibold text-danger' : 'tabular-nums'}>
            {variante.vatRateLabel ?? 'non renseignée'}
          </dd>
        </div>
        {estKit ? (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-strong">Stock</dt>
            <dd className="text-xs text-muted-strong">calculé depuis les composants</dd>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-strong">Stock</dt>
            <dd className="tabular-nums">
              {variante.stockOnHand} détenu{variante.stockOnHand > 1 ? 's' : ''}
              {variante.stockReserved > 0 ? `, ${variante.stockReserved} réservé${variante.stockReserved > 1 ? 's' : ''}` : ''}
              {' → '}
              <span className="font-semibold">{vendable} vendable{vendable > 1 ? 's' : ''}</span>
            </dd>
          </div>
        )}
        <div className="flex items-baseline gap-1.5">
          <dt className="text-xs text-muted-strong">Seuil d’alerte</dt>
          <dd className="tabular-nums">{variante.lowStockThreshold}</dd>
        </div>
      </dl>

      {estKit ? (
        <div className="rounded-sm bg-surface-soft px-2.5 py-2">
          <p className="text-[11px] font-semibold text-muted-strong">Composants</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {variante.composants.map((composant) => (
              <li key={composant.id}>
                {composant.quantite} × {composant.libelle}
                <span className="text-muted">
                  {' '}
                  ({composant.sku}
                  {composant.requis ? '' : ', facultatif'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!mayEdit ? null : (
        <>
          <FormulaireStock variante={variante} />

          {/* Prix, référence et conditionnement sont repliés : on y revient
              rarement, et dix champs ouverts par conditionnement feraient
              perdre la vue d'ensemble que donnait le tableau. */}
          <details className="rounded-sm border border-line">
            <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-2 text-xs font-semibold">
              <IconPencil className="size-3.5 shrink-0" />
              Modifier le prix, la TVA, la référence
            </summary>
            <form action={actionEdition} className="border-t border-line p-3">
              <input type="hidden" name="variantId" value={variante.id} />
              <ChampsVariante
                cle={variante.id}
                tauxTva={tauxTva}
                valeurs={valeursAffichees(
                  {
                    sku: variante.sku,
                    variantName: variante.name,
                    packaging: variante.packaging,
                    prix: centsEnSaisie(variante.priceCents),
                    prixBarre: centsEnSaisie(variante.compareAtCents),
                    vatRateId: variante.vatRateId ?? '',
                    seuil: String(variante.lowStockThreshold),
                    poids: variante.weightGrams === null ? '' : String(variante.weightGrams),
                    stock: String(variante.stockOnHand),
                    backorder: variante.backorder,
                    active: variante.active,
                  },
                  edition.saisie,
                )}
                avecStock={false}
                avecActive
              />
              <Button type="submit" className="mt-4" disabled={editionPending}>
                {editionPending ? 'Enregistrement…' : 'Enregistrer le conditionnement'}
              </Button>
              <Retour state={edition} />
            </form>
          </details>

          <form action={actionRetrait}>
            <input type="hidden" name="variantId" value={variante.id} />
            {confirme ? (
              <div className="flex flex-col gap-1.5 rounded-sm bg-surface-soft p-2">
                <p className="text-xs text-muted-strong">
                  La suppression est définitive. Pour simplement retirer ce conditionnement de la
                  fiche, décochez « Proposé à la vente » : rien n’est perdu.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="submit" size="sm" disabled={retraitPending}>
                    {retraitPending ? 'Suppression…' : 'Confirmer la suppression'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirme(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirme(true)}
                disabled={retraitPending}
              >
                {/*
                  La couleur est portée par le contenu, et non par une classe
                  sur le bouton : `text-slate-ink` de la variante gagnerait sur
                  un `text-danger` ajouté après, faute de déduplication des
                  utilitaires Tailwind dans `cn`.
                */}
                <span className="flex items-center gap-1.5 text-danger">
                  <IconClose className="size-4 shrink-0" />
                  Supprimer
                </span>
              </Button>
            )}
            {retrait.error ? (
              <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
                {retrait.error}
              </p>
            ) : null}
          </form>
        </>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Ajout                                                                      */
/* -------------------------------------------------------------------------- */

function AjoutVariante({ productId, tauxTva }: { productId: string; tauxTva: TauxTva[] }) {
  const [state, action, pending] = useActionState(createVariant, EMPTY)

  return (
    <details className="rounded-md border border-line">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Ajouter un conditionnement
      </summary>
      <form action={action} className="border-t border-line p-3">
        <input type="hidden" name="productId" value={productId} />
        <p className="mb-3 text-xs text-muted-strong">
          Une autre façon d’acheter le même produit : à l’unité, par paire, en pack. Chaque
          conditionnement a sa propre référence, son prix et son stock.
        </p>
        <ChampsVariante
          cle="ajout"
          tauxTva={tauxTva}
          valeurs={valeursAffichees(VARIANTE_VIDE, state.saisie)}
          avecStock
          avecActive={false}
        />
        <Button type="submit" className="mt-4" disabled={pending || tauxTva.length === 0}>
          {pending ? 'Ajout…' : 'Ajouter le conditionnement'}
        </Button>
        <Retour state={state} />
      </form>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/* La section                                                                 */
/* -------------------------------------------------------------------------- */

export function ProductVariantsManager({
  productId,
  variantes,
  tauxTva,
  mayEdit,
}: {
  productId: string
  variantes: VarianteFiche[]
  tauxTva: TauxTva[]
  mayEdit: boolean
}) {
  const actives = variantes.filter((variante) => variante.active).length

  return (
    <div className="mt-2 flex flex-col gap-3">
      {variantes.length === 0 ? (
        <Alert tone="warn">
          Aucun conditionnement : il n’y a rien à acheter sur cette fiche, et la publication est
          refusée tant que c’est le cas.
        </Alert>
      ) : actives === 0 ? (
        <Alert tone="warn">
          Aucun conditionnement n’est proposé à la vente. La fiche s’affiche, mais rien ne peut
          être ajouté au panier.
        </Alert>
      ) : null}

      {mayEdit && tauxTva.length === 0 ? (
        <Alert tone="danger">
          Aucun taux de TVA n’est enregistré. Sans taux, le HT de la fiche et de la facture est
          faux, et aucun conditionnement ne peut être enregistré. Les taux viennent du jeu de
          données initial (<code>prisma/seed.ts</code>), aucun écran ne les crée.
        </Alert>
      ) : null}

      {variantes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {variantes.map((variante) => (
            <CarteVariante
              key={variante.id}
              variante={variante}
              tauxTva={tauxTva}
              mayEdit={mayEdit}
            />
          ))}
        </ul>
      ) : null}

      {mayEdit ? <AjoutVariante productId={productId} tauxTva={tauxTva} /> : null}
    </div>
  )
}
