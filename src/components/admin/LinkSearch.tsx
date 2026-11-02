'use client'

import type { ReactNode } from 'react'
import Form from 'next/form'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { RAISON_TERME_COURT, normaliserTerme, termeSuffisant } from '@/lib/admin/produit-liens'

/**
 * Le champ qui sert à trouver ce qu'on veut rattacher.
 *
 * **Pourquoi une recherche et non une liste déroulante.** Le catalogue compte
 * près de dix mille produits et autant de références, et le référentiel
 * véhicule 2 180 configurations. L'écran Véhicules, lui, charge encore toutes
 * les références dans un `<select>` (`listVariantOptions`) : la page en porte
 * le poids à chaque affichage, et la liste est de toute façon trop longue pour
 * qu'on y trouve quoi que ce soit.
 *
 * **Pourquoi `next/form` et non le `<form method="get">` utilisé ailleurs dans
 * l'administration.** Les filtres du catalogue sont en haut de leur page ; ces
 * champs-ci sont au milieu d'une fiche longue. Un envoi natif recharge la page
 * et remonte en haut — loin du bloc qu'on remplissait. `next/form` navigue
 * côté client, et `scroll={false}` garde la position. Le reste est identique :
 * la recherche vit dans l'adresse, donc elle survit à un rechargement et se
 * partage.
 *
 * `replace` plutôt qu'un empilement d'étapes : trois recherches successives
 * laisseraient trois entrées d'historique à remonter avant de revenir à la
 * page d'où l'on venait.
 */
export function RechercheLien({
  nomChamp,
  terme,
  label,
  placeholder,
  hint,
  champsCaches,
}: {
  /** Nom du paramètre d'adresse qui porte le terme : `complement`, `composant`… */
  nomChamp: string
  terme: string
  label: string
  placeholder: string
  hint?: string
  /** Ce que la navigation doit emporter en plus du terme (la variante visée). */
  champsCaches?: Record<string, string>
}) {
  return (
    <Form action="" scroll={false} replace className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {Object.entries(champsCaches ?? {}).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <TextField
        id={`recherche-${nomChamp}`}
        name={nomChamp}
        label={label}
        hint={hint}
        fieldSize="sm"
        defaultValue={terme}
        placeholder={placeholder}
        wrapperClassName="min-w-0 flex-1"
      />
      <Button type="submit" size="sm" variant="secondary" className="sm:mb-0.5">
        Chercher
      </Button>
    </Form>
  )
}

/**
 * Ce que la recherche répond quand elle ne propose rien.
 *
 * Trois états, et aucun n'est une erreur : rien n'a encore été cherché, le
 * terme est trop court pour être utile, ou il ne correspond à rien. Les
 * confondre en une liste vide laisserait croire que le catalogue est vide.
 */
export function ReponseRecherche({
  terme,
  nombre,
  invitation,
  aucunResultat,
}: {
  terme: string
  nombre: number
  /** Ce qu'on dit avant toute recherche. */
  invitation: ReactNode
  /** Ce qu'on dit quand le terme ne correspond à rien. */
  aucunResultat: ReactNode
}) {
  const propre = normaliserTerme(terme)

  if (propre.length === 0) {
    return <p className="mt-3 text-xs text-muted-strong">{invitation}</p>
  }
  if (!termeSuffisant(propre)) {
    return (
      <p className="mt-3 text-xs font-medium text-danger" role="alert">
        {RAISON_TERME_COURT}
      </p>
    )
  }
  if (nombre === 0) {
    return (
      <p className="mt-3 text-xs text-muted-strong">
        Rien ne correspond à «&nbsp;{propre}&nbsp;». {aucunResultat}
      </p>
    )
  }
  return null
}
