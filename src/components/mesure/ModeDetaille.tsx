'use client'

import { useEffect, useState } from 'react'
import { CLE_DETAIL } from './file'

/**
 * L'interrupteur du mode détaillé, posé sur /admin/statistiques.
 *
 * **Ce qu'il allume, et sur quoi.** Sur CE navigateur, et sur lui seul, la
 * mesure enregistre en plus la trace du pointeur : une position tous les
 * 150 ms, qui permet de rejouer un parcours au lieu de le lire en tableau.
 * La clé est posée dans le stockage local du navigateur, rien n'est envoyé à
 * personne, et aucun autre visiteur n'est concerné.
 *
 * **Pourquoi ce n'est pas allumé pour tout le monde.** La mesure du site tient
 * dans l'exemption de consentement de la CNIL parce qu'elle est strictement
 * anonyme : des pages, des clics, des compteurs. Suivre le pointeur d'une
 * personne en continu sort de ce cadre — c'est le même geste qu'un
 * enregistrement de session, et il faut alors un accord préalable, comme pour
 * la balise publicitaire.
 *
 * Tant que l'exploitant ne l'allume que sur son propre navigateur, pour
 * comprendre ses propres pages, la question ne se pose pour personne. Le jour
 * où l'on voudrait l'appliquer aux visiteurs, il faudra : une case dans le
 * bandeau de consentement (components/consentement/), une ligne sur
 * /confidentialite, et une durée de conservation annoncée. Ne pas l'allumer
 * globalement en pensant que « c'est juste des coordonnées ».
 */
export function ModeDetaille() {
  const [actif, setActif] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setActif(localStorage.getItem(CLE_DETAIL) === '1')
    } catch {
      setActif(false)
    }
  }, [])

  // Rien avant d'avoir lu le navigateur : le serveur ne peut pas savoir.
  if (actif === null) return null

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        actif ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface-soft'
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold">
          {actif
            ? 'Mode détaillé allumé sur ce navigateur'
            : 'Mode détaillé éteint sur ce navigateur'}
        </p>
        <p className="mt-0.5 text-muted-strong">
          {actif
            ? 'Vos propres visites sont enregistrées en entier, trace du pointeur comprise, et vous pouvez les rejouer. Aucun autre visiteur n’est concerné.'
            : 'Allumez-le pour parcourir le site vous-même et rejouer votre parcours au pointeur près. Le réglage ne vaut que pour ce navigateur.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            if (actif) localStorage.removeItem(CLE_DETAIL)
            else localStorage.setItem(CLE_DETAIL, '1')
          } catch {}
          setActif(!actif)
        }}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
          actif ? 'bg-ink text-white' : 'bg-brand text-white'
        }`}
      >
        {actif ? 'Éteindre' : 'Allumer sur ce navigateur'}
      </button>
    </div>
  )
}
