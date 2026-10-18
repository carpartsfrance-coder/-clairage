'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { VariantView } from '@/lib/queries/product'
import { isPurchasable } from '@/lib/stock'

/**
 * Le conditionnement choisi, partagé par toute la fiche produit.
 *
 * Il vivait dans le bloc d'achat, et lui seul le connaissait. Les autres
 * sections décrivaient donc le produit « en général », en agrégeant tous les
 * conditionnements — ce qui donnait des pages qui se contredisaient : le kit
 * complet annonçait les adaptateurs et décodeurs inclus, pendant que la section
 * Installation affichait, trois écrans plus bas, « Adaptateurs et décodeurs
 * nécessaires, non inclus », restriction qui ne concernait que les ampoules
 * seules.
 *
 * Le choix est donc remonté ici. Ce qu'on affiche du montage, du contenu et
 * des restrictions suit le conditionnement réellement sélectionné.
 */

type ProductConfigurationValue = {
  variants: VariantView[]
  selectedId: string
  setSelectedId: (id: string) => void
  selected: VariantView | null
}

const ProductConfigurationContext = createContext<ProductConfigurationValue | null>(null)

/**
 * Conditionnement retenu par défaut.
 *
 * Ordre de préférence : la recommandation faite pour le véhicule, sinon le kit
 * complet — c'est l'offre qui contient tout ce qu'il faut, et le client qui n'a
 * pas encore dit son véhicule ne peut pas savoir ce qui lui manque. Le
 * conditionnement moins cher reste visible juste en dessous, avec son prix.
 */
export function defaultVariantId(
  variants: VariantView[],
  recommendedVariantId: string | null,
): string {
  return (
    recommendedVariantId ??
    variants.find((variant) => variant.components.length > 0 && isPurchasable(variant.availability))
      ?.id ??
    variants.find((variant) => isPurchasable(variant.availability))?.id ??
    variants[0]?.id ??
    ''
  )
}

export function ProductConfigurationProvider({
  variants,
  recommendedVariantId,
  children,
}: {
  variants: VariantView[]
  recommendedVariantId: string | null
  children: ReactNode
}) {
  const [selectedId, setSelectedId] = useState(() =>
    defaultVariantId(variants, recommendedVariantId),
  )

  const value = useMemo<ProductConfigurationValue>(
    () => ({
      variants,
      selectedId,
      setSelectedId,
      selected: variants.find((variant) => variant.id === selectedId) ?? variants[0] ?? null,
    }),
    [variants, selectedId],
  )

  return (
    <ProductConfigurationContext.Provider value={value}>
      {children}
    </ProductConfigurationContext.Provider>
  )
}

/**
 * Lit le conditionnement choisi.
 *
 * Renvoie `null` hors d'une fiche produit : les composants concernés savent
 * alors qu'ils n'ont rien à afficher, plutôt que de lever.
 */
export function useProductConfiguration(): ProductConfigurationValue | null {
  return useContext(ProductConfigurationContext)
}
