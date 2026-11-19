'use client'

import { useEffect, useRef } from 'react'
import type { NomEvenement } from '@/lib/mesure-evenements'
import { mesurer } from './file'

/**
 * « Cette page affiche tel résultat » — une mesure posée depuis une page rendue
 * par le serveur.
 *
 * Beaucoup de verdicts du site ne sont pas des clics : un code promo refusé,
 * un paiement abandonné, une commande payée sont des états que le serveur
 * rend. Les mesurer au clic donnerait toujours le même chiffre, qu'ils
 * réussissent ou qu'ils échouent.
 *
 * Ce composant ne dessine rien. Il émet une fois, au montage, et jamais deux
 * fois pour le même affichage.
 */
export function MesureEtat({
  nom,
  label,
  value,
}: {
  nom: NomEvenement
  label?: string | null
  value?: number | null
}) {
  const fait = useRef(false)
  useEffect(() => {
    if (fait.current) return
    fait.current = true
    mesurer(nom, { label, value })
  }, [nom, label, value])
  return null
}
