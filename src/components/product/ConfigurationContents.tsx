'use client'

import { Alert } from '@/components/ui/Surface'
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
 * Elle ne dit plus ce que le conditionnement CONTIENT — `KitContents` s'en
 * charge, juste au-dessus. Il lui reste ce qui manquerait au moment du
 * montage, et c'est l'information qui évite un colis inutilisable :
 *
 *  - ce que le conditionnement exige et ne fournit PAS ;
 *  - ses propres restrictions.
 *
 * Les restrictions d'un conditionnement qu'on n'a pas choisi ne sont pas
 * cachées : elles réapparaissent dès qu'on le sélectionne dans le bloc d'achat.
 */
export function ConfigurationContents() {
  const configuration = useProductConfiguration()
  const selected = configuration?.selected
  if (!selected) return null

  const manquants = selected.missingAccessories
  const restrictions = selected.fitment.restrictions

  if (manquants.length === 0 && !restrictions) return null

  return (
    <div className="mt-5 flex max-w-3xl flex-col gap-4 text-[11px]">
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
