'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconArrowRight, IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Sélecteur de véhicule : marque → modèle → année.
 *
 * L'équipement lumineux d'origine n'est PAS demandé ici. Il est demandé juste
 * avant le choix du kit, parce que c'est lui — et non le culot — qui décide de
 * la compatibilité. Quand une année correspond à plusieurs équipements, le
 * serveur renvoie l'étape d'équipement au lieu de choisir à la place du client.
 *
 * `layout` :
 *   - `inline`  : bandeau sombre de la page d'accueil, une seule ligne.
 *   - `stacked` : modale et page dédiée, champs empilés avec libellés visibles.
 */

type Option = { id: string; name: string }
type VehicleType = 'CAR' | 'MOTORCYCLE'

/** Sélection déjà enregistrée, pour rouvrir le formulaire là où on l'a laissé. */
export type VehicleSelectorInitial = {
  type: VehicleType
  makeId: string
  modelId: string
  year: number
}

export function VehicleSelector({
  layout = 'inline',
  currentConfigurationId = null,
  initial = null,
  onDone,
  className,
}: {
  layout?: 'inline' | 'stacked'
  currentConfigurationId?: string | null
  /**
   * Véhicule déjà retenu. Le formulaire s'ouvre dessus au lieu de repartir de
   * zéro : il était vide alors que l'en-tête affichait le véhicule, et il
   * fallait tout re-saisir pour changer une seule chose.
   */
  initial?: VehicleSelectorInitial | null
  onDone?: () => void
  className?: string
}) {
  const router = useRouter()
  const baseId = useId()
  const [type, setType] = useState<VehicleType>(initial?.type ?? 'CAR')
  const [makes, setMakes] = useState<Option[]>([])
  const [models, setModels] = useState<Option[]>([])
  const [years, setYears] = useState<number[]>([])
  const [makeId, setMakeId] = useState(initial?.makeId ?? '')
  const [modelId, setModelId] = useState(initial?.modelId ?? '')
  const [year, setYear] = useState(initial ? String(initial.year) : '')

  /*
    L'effet ci-dessous vide les champs quand on bascule voiture ↔ moto. Au
    premier rendu, il effaçait la sélection reprise avant même qu'elle
    s'affiche.

    On compare donc au type précédent au lieu de sauter « le premier
    passage » : en développement, React joue les effets deux fois, un
    garde-fou à usage unique est consommé par le premier appel et le second
    vide quand même. Ici, tant que le type n'a pas changé, il n'y a rien à
    vider — que l'effet soit rejoué ou non.
  */
  const typePrecedent = useRef(type)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Chargements en cascade ------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (typePrecedent.current !== type) {
      setMakeId('')
      setModelId('')
      setYear('')
      setModels([])
      setYears([])
    }
    typePrecedent.current = type
    fetch(`/api/vehicules/marques?type=${type}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: Option[] }) => {
        if (!cancelled) setMakes(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setMakes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [type])

  useEffect(() => {
    if (!makeId) {
      setModels([])
      return
    }
    let cancelled = false
    fetch(`/api/vehicules/modeles?makeId=${encodeURIComponent(makeId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: Option[] }) => {
        if (!cancelled) setModels(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
    return () => {
      cancelled = true
    }
  }, [makeId])

  useEffect(() => {
    if (!modelId) {
      setYears([])
      return
    }
    let cancelled = false
    fetch(`/api/vehicules/annees?modelId=${encodeURIComponent(modelId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: number[] }) => {
        if (!cancelled) setYears(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setYears([])
      })
    return () => {
      cancelled = true
    }
  }, [modelId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!modelId || !year) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/vehicule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelId, year: Number(year) }),
      })
      const data = (await response.json()) as { redirect?: string; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Sélection impossible')
      onDone?.()
      router.push(data.redirect ?? '/vehicule/resultats')
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Sélection impossible pour le moment.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const catalogueEmpty = !loading && makes.length === 0
  const inline = layout === 'inline'

  /*
    Habillage des champs dans le bandeau sombre, repris de `home.css` :
      select  : 43 px de haut, fond #fafaf8, filet #4c5153, rayon 5 px,
                texte 12 px couleur #23272a ;
      label   : 7 px, gras, interlettrage 1.2 px, couleur #c2c8cb, capitales.
    Hors bandeau, les champs gardent l'habillage standard du projet.
  */
  const champSombre = inline
    ? 'h-[43px] rounded-[5px] border-[#4c5153] bg-[#fafaf8] px-[11px] text-[12px] text-[#23272a]'
    : undefined
  const labelSombre = inline
    ? 'text-[7px] font-bold uppercase tracking-[1.2px] text-[#c2c8cb]'
    : undefined


  return (
    <form
      onSubmit={submit}
      /* En bandeau, les écarts viennent des marges de chaque bloc (comme dans
         la référence) et non d'un `gap` global : les deux se cumuleraient. */
      className={cn('flex flex-col', inline ? 'gap-0' : 'gap-3', className)}
    >
      {/* Bascule voiture / moto */}
      {/*
        Bascule voiture / moto.

        En bandeau d'accueil (`inline`), la référence n'emploie pas un
        interrupteur en pilule mais deux onglets soulignés (`.finder-tabs`) :
        10 px, gris #9fa6aa, et un filet de 2 px couleur #e76b5d sous l'onglet
        actif. Ailleurs, la pilule du projet est conservée.
      */}
      <div
        role="radiogroup"
        aria-label="Type de véhicule"
        className={cn(
          inline
            ? 'mb-[13px] flex w-fit gap-5'
            : 'inline-flex w-fit rounded-sm bg-surface-muted p-1',
        )}
      >
        {(
          [
            { value: 'CAR' as const, label: 'Voiture', Icon: IconCar },
            { value: 'MOTORCYCLE' as const, label: 'Moto', Icon: IconMotorcycle },
          ]
        ).map(({ value, label, Icon }) => {
          const active = type === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setType(value)}
              className={cn(
                'flex items-center transition-colors',
                inline
                  ? 'min-h-9 gap-1.5 border-b-2 pb-1.5 text-[10px] lg:min-h-0'
                  : 'min-h-9 gap-2 rounded-xs px-4 text-sm font-semibold',
                inline
                  ? active
                    ? 'border-[#e76b5d] text-white'
                    : 'border-transparent text-[#9fa6aa] hover:text-white'
                  : active
                    ? 'bg-white text-slate-ink shadow-soft'
                    : 'text-muted-strong hover:text-slate-ink',
              )}
            >
              <Icon className={inline ? 'size-[15px]' : 'size-5'} />
              {label}
            </button>
          )
        })}
      </div>

      {catalogueEmpty ? (
        <Alert tone="warn" title="Aucun véhicule n'est encore référencé.">
          Importez les véhicules et les compatibilités depuis le back-office, ou décrivez votre
          véhicule à l&apos;équipe depuis la page contact.
        </Alert>
      ) : (
        <div
          /* .finder-section form : grid 1fr 1.2fr .75fr 1.1fr, gap 12, align end. */
          className={cn(
            inline
              /*
                Mobile : deux colonnes, la marque sur toute la largeur et le
                bouton en dessous — c'est la grille de la référence, et elle
                économise une rangée par rapport à un empilement simple.
              */
              ? 'grid grid-cols-2 items-end gap-[11px] md:grid-cols-[1fr_1.2fr_0.75fr_1.1fr] md:gap-3 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1'
              : 'grid gap-4 sm:grid-cols-3',
          )}
        >
          <SelectField
            id={`${baseId}-make`}
            label="Marque"
            hideLabel={false}
            fieldSize="lg"
            className={champSombre}
            labelClassName={labelSombre}
            value={makeId}
            disabled={loading}
            onChange={(event) => {
              setMakeId(event.target.value)
              setModelId('')
              setYear('')
            }}
          >
            <option value="">{loading ? 'Chargement…' : 'Marque'}</option>
            {makes.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id={`${baseId}-model`}
            label="Modèle"
            hideLabel={false}
            fieldSize="lg"
            className={champSombre}
            labelClassName={labelSombre}
            value={modelId}
            disabled={!makeId || models.length === 0}
            onChange={(event) => {
              setModelId(event.target.value)
              setYear('')
            }}
          >
            <option value="">{makeId ? 'Modèle' : 'Choisissez une marque'}</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id={`${baseId}-year`}
            label="Année"
            hideLabel={false}
            fieldSize="lg"
            className={champSombre}
            labelClassName={labelSombre}
            value={year}
            disabled={!modelId || years.length === 0}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="">{modelId ? 'Année' : 'Choisissez un modèle'}</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>

          <Button
            type="submit"
            size="lg"
            disabled={!modelId || !year || submitting}
            iconRight={<IconArrowRight className="size-5" />}
            /* .finder-section .primary : 43 px, 11 px, rayon 7 px. */
            className={cn(
              inline ? 'h-[43px] min-h-[43px] rounded-[7px] text-[11px] md:w-auto' : 'sm:col-span-3',
            )}
          >
            {submitting ? 'Recherche…' : currentConfigurationId ? 'Mettre à jour' : 'Voir mes éclairages'}
          </Button>
        </div>
      )}

      {error ? (
        <Alert tone="danger" live="assertive">
          {error}
        </Alert>
      ) : null}
    </form>
  )
}
