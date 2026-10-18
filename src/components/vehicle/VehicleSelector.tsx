'use client'

import { useEffect, useId, useState } from 'react'
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

export function VehicleSelector({
  layout = 'inline',
  currentConfigurationId = null,
  onDone,
  className,
}: {
  layout?: 'inline' | 'stacked'
  currentConfigurationId?: string | null
  onDone?: () => void
  className?: string
}) {
  const router = useRouter()
  const baseId = useId()
  const [type, setType] = useState<VehicleType>('CAR')
  const [makes, setMakes] = useState<Option[]>([])
  const [models, setModels] = useState<Option[]>([])
  const [years, setYears] = useState<number[]>([])
  const [makeId, setMakeId] = useState('')
  const [modelId, setModelId] = useState('')
  const [year, setYear] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Chargements en cascade ------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMakeId('')
    setModelId('')
    setYear('')
    setModels([])
    setYears([])
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

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-3', className)}>
      {/* Bascule voiture / moto */}
      <div
        role="radiogroup"
        aria-label="Type de véhicule"
        className={cn(
          'inline-flex w-fit rounded-sm p-1',
          inline ? 'bg-white/10' : 'bg-surface-muted',
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
                'flex min-h-9 items-center gap-2 rounded-xs px-4 text-sm font-semibold transition-colors',
                active
                  ? inline
                    ? 'bg-white/90 text-slate-ink'
                    : 'bg-white text-slate-ink shadow-soft'
                  : inline
                    ? 'text-white/70 hover:text-white'
                    : 'text-muted-strong hover:text-slate-ink',
              )}
            >
              <Icon className="size-5" />
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
          className={cn(
            inline
              ? 'grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]'
              : 'grid gap-4 sm:grid-cols-3',
          )}
        >
          <SelectField
            id={`${baseId}-make`}
            label="Marque"
            hideLabel={inline}
            fieldSize="lg"
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
            hideLabel={inline}
            fieldSize="lg"
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
            hideLabel={inline}
            fieldSize="lg"
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
            className={cn(inline ? 'md:w-auto' : 'sm:col-span-3')}
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
