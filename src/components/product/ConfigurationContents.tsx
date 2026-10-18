'use client'

import { Alert } from '@/components/ui/Surface'
import { IconCheck } from '@/components/ui/icons'
import { useProductConfiguration } from './ProductConfiguration'

/**
 * Ce que contient — et ne contient pas — le conditionnement choisi.
 *
 * C'est la section qui se contredisait avec le bloc d'achat : elle listait les
 * restrictions de TOUS les conditionnements, si bien qu'un client ayant retenu
 * le kit complet, annoncé « adaptateurs et décodeurs inclus », lisait plus bas
 * « Adaptateurs et décodeurs nécessaires, non inclus » — une restriction qui ne
 * vaut que pour les ampoules seules.
 *
 * Elle décrit désormais le conditionnement réellement sélectionné :
 *
 *  - ce qu'il contient, quand il a des composants ;
 *  - ce qu'il exige et ne fournit PAS, quand le montage le demande — c'est
 *    l'information qui évite un colis inutilisable à l'arrivée ;
 *  - ses propres restrictions.
 *
 * Les restrictions d'un conditionnement qu'on n'a pas choisi ne sont pas
 * cachées : elles réapparaissent dès qu'on le sélectionne dans le bloc d'achat.
 */
export function ConfigurationContents() {
  const configuration = useProductConfiguration()
  const selected = configuration?.selected
  if (!selected) return null

  const inclus = selected.components
  const manquants = selected.missingAccessories
  const restrictions = selected.fitment.restrictions

  if (inclus.length === 0 && manquants.length === 0 && !restrictions) return null

  return (
    <div className="mt-5 flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted-strong">
        Pour le conditionnement retenu :{' '}
        <span className="font-semibold text-slate-ink">{selected.name}</span>.
      </p>

      {inclus.length > 0 ? (
        <div className="rounded-md border border-ok-border bg-ok-soft px-4 py-3">
          <p className="text-sm font-semibold">Fourni dans ce kit</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {inclus.map((composant) => (
              <li key={composant.sku} className="flex items-start gap-2">
                <IconCheck className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.4} />
                <span>
                  {composant.quantity} × {composant.productName}
                  {composant.variantName ? (
                    <span className="text-muted-strong"> — {composant.variantName}</span>
                  ) : null}
                  {!composant.required ? (
                    <span className="text-muted"> (facultatif)</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {manquants.length > 0 ? (
        <Alert tone="warn" title="Nécessaire au montage, non fourni dans ce conditionnement">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {manquants.map((accessoire) => (
              <li key={accessoire.variantId}>
                {accessoire.quantity} × {accessoire.productName}
                {accessoire.variantName ? (
                  <span className="text-muted-strong"> — {accessoire.variantName}</span>
                ) : null}
                {accessoire.note ? <span className="text-muted"> ({accessoire.note})</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Ces pièces se retrouvent dans le bloc d&apos;achat, à ajouter si vous ne les avez pas
            déjà. Le kit complet, lui, les contient.
          </p>
        </Alert>
      ) : null}

      {restrictions ? (
        <Alert tone="warn" title="Restrictions de montage">
          <p>{restrictions}</p>
        </Alert>
      ) : null}
    </div>
  )
}
